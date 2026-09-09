import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  catchError,
  distinctUntilChanged,
  map,
  merge,
  of,
  startWith,
  switchMap,
  timer,
} from 'rxjs';
import {
  formatBusFare,
  getAgencyIconPath,
  getContrastColor,
  normalizeHexColor,
  TransitAgency,
} from '@metro/shared/utils';
import type {
  PublishedDayKind,
  PublishedRouteDirection,
  PublishedRouteInformation,
} from '@metro/shared/bus-itinerary-contracts';
import { TypesenseSearchService } from '../search/typesense-search.service';
import {
  SearchResult,
  SearchResultCardComponent,
} from '../map-main/components/search-dialog/search-result-card/search-result-card.component';
import {
  mapTypesenseResult,
  orderSearchResults,
} from '../map-main/components/search-dialog/search-dialog.utils';
import {
  BusInformationService,
  BusNoticesResult,
} from '../map-main/components/bus-information/bus-information.service';
import { BusInformationComponent } from '../map-main/components/bus-information/bus-information.component';
import { routeNoticeView } from '../map-main/components/bus-information/bus-notice-view';
import { TransitSearchFieldComponent } from '../shared/components/transit-search-field/transit-search-field.component';
import { ScheduledDeparturesComponent } from '../shared/components/scheduled-departures/scheduled-departures.component';
import {
  ItinerariesService,
  ItineraryPattern,
  RouteItinerary,
} from './itineraries.service';
import { summarizeDepartureIntervals } from './departure-intervals';

export function saoPauloServiceDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Preserve GTFS service-day hours: 25:10 means 01:10 on the following day. */
export function serviceTimeLabel(value: string): string {
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const days = Math.floor(hours / 24);
  return `${String(hours % 24).padStart(2, '0')}:${match[2]}${days ? ` (+${days} dia${days > 1 ? 's' : ''})` : ''}`;
}

export function serviceDayKind(date: string): PublishedDayKind {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : 'weekday';
}

@Component({
  selector: 'app-itineraries',
  imports: [
    DatePipe,
    NgOptimizedImage,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatProgressBarModule,
    TransitSearchFieldComponent,
    SearchResultCardComponent,
    BusInformationComponent,
    ScheduledDeparturesComponent,
  ],
  templateUrl: './itineraries.component.html',
  styleUrl: './itineraries.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItinerariesComponent {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly searchService = inject(TypesenseSearchService);
  private readonly itineraries = inject(ItinerariesService);
  private readonly information = inject(BusInformationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly params = toSignal(this.activatedRoute.queryParamMap, {
    initialValue: this.activatedRoute.snapshot.queryParamMap,
  });
  private readonly pathParams = toSignal(this.activatedRoute.paramMap, {
    initialValue: this.activatedRoute.snapshot.paramMap,
  });
  readonly today = saoPauloServiceDate();
  readonly days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${this.today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return {
      value: date.toISOString().slice(0, 10),
      label:
        index === 0
          ? 'Hoje'
          : index === 1
            ? 'Amanhã'
            : new Intl.DateTimeFormat('pt-BR', {
                weekday: 'long',
                timeZone: 'UTC',
              }).format(date),
    };
  });
  readonly serviceDate = computed(() => {
    const date = this.params().get('dia');
    return this.days.some((day) => day.value === date)
      ? (date as string)
      : this.today;
  });
  readonly routeId = computed(() => {
    const agency = this.pathParams().get('agency');
    const line = this.pathParams().get('line');
    return agency && line
      ? agency === 'sptrans'
        ? line
        : `${agency}:${line}`
      : '';
  });
  readonly query = signal('');
  readonly retryCount = signal(0);
  readonly incrementRetry = (value: number) => value + 1;
  readonly selectedPatternId = signal('');
  readonly showDepartureTimes = signal(false);
  readonly publishedDayKind = signal<PublishedDayKind>(
    serviceDayKind(this.today),
  );
  readonly publishedDirectionId = signal('');
  readonly dayLabels: Record<PublishedDayKind, string> = {
    weekday: 'Segunda a sexta',
    saturday: 'Sábado',
    sunday: 'Domingo',
  };
  readonly periodLabels = {
    morning: 'Manhã',
    interpeak: 'Entrepico',
    afternoon: 'Tarde',
  };
  readonly searchState = toSignal(
    toObservable(this.query).pipe(
      switchMap((query) =>
        query.trim().length < 2
          ? of({ loading: false, error: false, results: [] as SearchResult[] })
          : timer(250).pipe(
              switchMap(() => this.searchService.search(query, ['busRoute'])),
              map((response) => ({
                loading: false,
                error: !response.success,
                results: orderSearchResults(
                  response.results
                    .map(mapTypesenseResult)
                    .filter(
                      (result): result is SearchResult =>
                        result !== null &&
                        result.type === 'route' &&
                        result.source !== 'rail',
                    ),
                ),
              })),
              catchError(() =>
                of({
                  loading: false,
                  error: true,
                  results: [] as SearchResult[],
                }),
              ),
              startWith({
                loading: true,
                error: false,
                results: [] as SearchResult[],
              }),
            ),
      ),
    ),
    {
      initialValue: {
        loading: false,
        error: false,
        results: [] as SearchResult[],
      },
    },
  );

  private readonly request = computed(() => ({
    routeId: this.routeId(),
    serviceDate: this.serviceDate(),
    retry: this.retryCount(),
  }));
  readonly detailState = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ routeId, serviceDate }) =>
        !routeId
          ? of({
              loading: false,
              error: false,
              data: null as RouteItinerary | null,
            })
          : this.itineraries.load(routeId, serviceDate).pipe(
              map((data) => ({
                loading: false,
                error: data.status === 'UNAVAILABLE',
                data,
              })),
              catchError(() =>
                of({
                  loading: false,
                  error: true,
                  data: null as RouteItinerary | null,
                }),
              ),
              startWith({
                loading: true,
                error: false,
                data: null as RouteItinerary | null,
              }),
            ),
      ),
    ),
    {
      initialValue: {
        loading: false,
        error: false,
        data: null as RouteItinerary | null,
      },
    },
  );
  readonly data = computed(() => this.detailState().data);
  readonly route = computed(() => this.data()?.route);
  readonly patterns = computed(() => this.data()?.patterns ?? []);
  readonly pattern = computed<ItineraryPattern | undefined>(
    () =>
      this.patterns().find((item) => item.id === this.selectedPatternId()) ??
      this.patterns()[0],
  );
  readonly patternOptions = computed(() =>
    this.patterns().map((pattern, index) => ({
      value: pattern.id,
      label: `${pattern.headsign || (pattern.directionId === 0 ? 'Ida' : pattern.directionId === 1 ? 'Volta' : 'Sentido não informado')}${this.patterns().some((other) => other.id !== pattern.id && other.headsign === pattern.headsign) ? ` · percurso ${index + 1}` : ''}`,
    })),
  );
  // Municipal Sunday gratuity applies to the calendar day, not GTFS hours >=24.
  // https://www.sptrans.com.br/tarifas
  readonly sundayFree = computed(
    () =>
      this.route()?.sourceAgency?.toLowerCase() === 'sptrans' &&
      (this.published()
        ? this.publishedDayKind()
        : serviceDayKind(this.serviceDate())) === 'sunday',
  );
  readonly fares = computed(() =>
    this.sundayFree()
      ? 'Gratuita no domingo'
      : this.route()?.fares.map(formatBusFare).join(' · ') || 'Não informada',
  );
  readonly routeColor = computed(() =>
    normalizeHexColor(this.route()?.color, '5f6368'),
  );
  readonly routeTextColor = computed(() =>
    normalizeHexColor(
      this.route()?.textColor,
      getContrastColor(this.routeColor()),
    ),
  );
  readonly agencyLogo = computed(() => {
    const agency = this.route()?.sourceAgency?.toLowerCase();
    return agency === 'sptrans'
      ? getAgencyIconPath(TransitAgency.SPTRANS)
      : agency === 'artesp'
        ? getAgencyIconPath(TransitAgency.ARTESP)
        : null;
  });
  readonly duration = computed(() => {
    const minutes = this.pattern()?.durationMinutes;
    return typeof minutes === 'number' ? `${minutes} min` : 'Não informada';
  });
  readonly agency = computed(() =>
    this.route()?.sourceAgency?.toLowerCase() === 'artesp'
      ? 'Artesp'
      : this.route()?.sourceAgency?.toLowerCase() === 'sptrans'
        ? 'SPTrans'
        : this.route()?.sourceAgency || 'Rede não informada',
  );
  readonly noticeCode = computed(() => {
    const route = this.route();
    return route?.sourceAgency?.toLowerCase() === 'sptrans' &&
      /^[0-9A-Z]{4}-\d{2}$/.test(route.shortName)
      ? route.shortName
      : '';
  });
  readonly publishedRouteId = computed(() => {
    const route = this.route();
    return route?.sourceAgency?.toLowerCase() === 'sptrans' &&
      /^[0-9A-Z]{4}-\d{1,2}$/.test(route.shortName)
      ? route.routeId
      : '';
  });
  readonly publishedState = toSignal(
    toObservable(this.publishedRouteId).pipe(
      distinctUntilChanged(),
      switchMap((routeId) =>
        routeId
          ? this.itineraries.published(routeId).pipe(
              map((data) => ({ loading: false, data })),
              catchError(() =>
                of({
                  loading: false,
                  data: null as PublishedRouteInformation | null,
                }),
              ),
              startWith({
                loading: true,
                data: null as PublishedRouteInformation | null,
              }),
            )
          : of({
              loading: false,
              data: null as PublishedRouteInformation | null,
            }),
      ),
    ),
    {
      initialValue: {
        loading: false,
        data: null as PublishedRouteInformation | null,
      },
    },
  );
  readonly published = computed(() =>
    this.publishedState().data?.status === 'AVAILABLE'
      ? this.publishedState().data
      : null,
  );
  readonly publishedDay = computed(() =>
    this.published()?.days.find((day) => day.kind === this.publishedDayKind()),
  );
  readonly publishedDirection = computed<PublishedRouteDirection | undefined>(
    () => {
      const directions = this.publishedDay()?.directions ?? [];
      return (
        directions.find(
          (direction) => direction.id === this.publishedDirectionId(),
        ) ?? directions[0]
      );
    },
  );
  readonly publishedTravelTimes = computed(
    () =>
      this.publishedDirection()?.travelTimes.map((time) => ({
        label: this.periodLabels[time.period],
        value: `${time.minutes} min`,
      })) ?? [],
  );
  readonly operator = computed(
    () =>
      this.published()?.operatorName ||
      this.data()?.operatorName ||
      'Não informada',
  );
  readonly visibleDepartures = computed(() => [
    ...new Set(
      this.published()
        ? (this.publishedDirection()?.departures ?? [])
        : (this.pattern()?.departures ?? []),
    ),
  ]);
  readonly calculatedIntervals = computed(() =>
    summarizeDepartureIntervals(this.visibleDepartures()).map((interval) => ({
      ...interval,
      label:
        interval.minimumMinutes === interval.maximumMinutes
          ? `${this.intervalMinutes(interval.minimumMinutes * 60)} min`
          : `${this.intervalMinutes(interval.minimumMinutes * 60)}–${this.intervalMinutes(interval.maximumMinutes * 60)} min`,
    })),
  );
  readonly noticeState = toSignal(
    toObservable(this.noticeCode).pipe(
      distinctUntilChanged(),
      switchMap((code) =>
        code
          ? this.information.notices([code]).pipe(
              catchError(() =>
                of({
                  status: 'UNAVAILABLE',
                  lastUpdated: null,
                  notices: [],
                } as BusNoticesResult),
              ),
              startWith(null),
            )
          : of(null),
      ),
    ),
    { initialValue: null },
  );
  readonly notices = computed(
    () =>
      this.noticeState()?.notices.map((notice) =>
        routeNoticeView(notice, this.noticeCode()),
      ) ?? [],
  );
  readonly timeLabel = serviceTimeLabel;
  readonly intervalMinutes = (seconds: number) =>
    new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(
      seconds / 60,
    );
  readonly operatingWindow = computed(() => {
    if (this.published()) {
      const direction = this.publishedDirection();
      return direction?.startTime && direction?.endTime
        ? `${serviceTimeLabel(direction.startTime)} – ${serviceTimeLabel(direction.endTime)}`
        : null;
    }
    const pattern = this.pattern();
    if (!pattern) return null;
    const times = [
      ...pattern.departures,
      ...pattern.intervals.flatMap((interval) => [
        interval.startTime,
        interval.endTime,
      ]),
    ].sort(
      (a, b) =>
        Number(a.split(':')[0]) - Number(b.split(':')[0]) || a.localeCompare(b),
    );
    return times.length
      ? `${serviceTimeLabel(times[0])} – ${serviceTimeLabel(times[times.length - 1])}`
      : null;
  });
  readonly mapParams = computed(() => ({
    busRoutes: this.route()?.routeId,
    subwayStations: '1',
    subwayRoutes: '1',
    bike: '0',
  }));

  constructor() {
    merge(this.activatedRoute.paramMap, this.activatedRoute.queryParamMap)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.selectedPatternId.set(''));
  }

  selectRoute(result: SearchResult): void {
    if (!result.routeData) return;
    const route = result.routeData;
    const separator = route.route_id.indexOf(':');
    const agency =
      separator >= 0
        ? route.route_id.slice(0, separator)
        : route.sourceAgency?.toLowerCase() || 'sptrans';
    const line =
      separator >= 0 ? route.route_id.slice(separator + 1) : route.route_id;
    this.query.set('');
    this.selectedPatternId.set('');
    void this.router.navigate(['/itinerarios', agency, line], {
      queryParams: { dia: this.params().get('dia') },
    });
  }

  selectDate(date: string): void {
    void this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { dia: date },
      queryParamsHandling: 'merge',
    });
  }
}
