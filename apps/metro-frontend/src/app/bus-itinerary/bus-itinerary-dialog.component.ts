import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe, NgOptimizedImage, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FavoritesService } from '@metro/shared/api';
import {
  catchError,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import {
  isBusDirectionFavorite,
  isBusLineFavorite,
  getBusLineDirectionAnchor,
  matchBusDirectionFavorite,
  parseBusDirectionFavorite,
  formatBusFare,
  getAgencyIconPath,
  getContrastColor,
  normalizeHexColor,
  TransitAgency,
} from '@metro/shared/utils';
import type {
  PublishedDayKind,
  PublishedRouteDirection,
} from '@metro/shared/bus-itinerary-contracts';
import {
  BusInformationService,
  BusNoticesResult,
} from '../map-main/components/bus-information/bus-information.service';
import { BusInformationComponent } from '../map-main/components/bus-information/bus-information.component';
import { routeNoticeView } from '../map-main/components/bus-information/bus-notice-view';
import { ScheduledDeparturesComponent } from '../shared/components/scheduled-departures/scheduled-departures.component';
import { CityContextService } from '../cities/city-context.service';
import {
  BusRouteGraphQL,
  GeographyGraphQLService,
} from '../map-main/geography/geography-graphql.service';
import {
  BusItineraryService,
  ItineraryPattern,
  RouteItinerary,
  PublishedItinerary,
} from './bus-itinerary.service';
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

export interface BusItineraryDialogData {
  routeId: string;
  favoriteCode?: string;
  serviceDate?: string;
}

@Component({
  selector: 'app-bus-itinerary-dialog',
  imports: [
    DatePipe,
    NgOptimizedImage,
    RouterLink,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatProgressBarModule,
    BusInformationComponent,
    ScheduledDeparturesComponent,
  ],
  templateUrl: './bus-itinerary-dialog.component.html',
  styleUrl: './bus-itinerary-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.embedded]': 'embedded()' },
})
export class BusItineraryDialogComponent {
  readonly embedded = input(false);
  private readonly dialogData = inject<BusItineraryDialogData>(MAT_DIALOG_DATA);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly dialogRef = inject(
    MatDialogRef<BusItineraryDialogComponent>,
    { optional: true },
  );
  readonly cityContext = inject(CityContextService);
  private readonly itineraries = inject(BusItineraryService);
  private readonly information = inject(BusInformationService);
  private readonly geography = inject(GeographyGraphQLService);
  private readonly favoritesService = inject(FavoritesService);
  readonly routeId = this.dialogData.routeId;
  readonly directionState = toSignal(
    isPlatformBrowser(this.platformId) && this.routeId
      ? this.geography.getBusRouteDirections([this.routeId]).pipe(
          map((directions) => ({ loading: false, directions })),
          catchError(() =>
            of({ loading: false, directions: [] as BusRouteGraphQL[] }),
          ),
          startWith({ loading: true, directions: [] as BusRouteGraphQL[] }),
        )
      : of({ loading: false, directions: [] as BusRouteGraphQL[] }),
    {
      initialValue: { loading: false, directions: [] as BusRouteGraphQL[] },
    },
  );
  readonly directions = computed(() => this.directionState().directions);
  readonly directionCandidates = computed(() =>
    this.directions().flatMap((direction) => {
      const favoriteCode = direction.favoriteCode;
      const identity = parseBusDirectionFavorite(favoriteCode ?? '');
      if (!favoriteCode || !identity || direction.directionId === undefined) {
        return [];
      }
      return [
        {
          ...identity,
          favoriteCode,
          directionId: direction.directionId,
          destination: direction.destination ?? direction.longName,
          sourceAgency: identity.sourceAgency,
          shortName: identity.shortName,
          direction,
        },
      ];
    }),
  );
  readonly requestedDirection = computed(() => {
    const favoriteCode = this.dialogData.favoriteCode;
    if (!favoriteCode || isBusLineFavorite(favoriteCode)) {
      return undefined;
    }
    return matchBusDirectionFavorite(
      favoriteCode,
      this.directionCandidates(),
    );
  });
  readonly requestedFavoriteCode = this.dialogData.favoriteCode;
  readonly requestedFavoriteIsWholeLine = computed(() =>
    isBusLineFavorite(this.requestedFavoriteCode ?? ''),
  );
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
  readonly serviceDate = signal(
    this.days.find((day) => day.value === this.dialogData.serviceDate)?.value ??
      this.today,
  );
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
  private readonly request = computed(() => ({
    routeId: this.routeId,
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
  readonly isCircularRoute = computed(() =>
    this.directions().some((direction) => direction.isCircular === true),
  );
  readonly pattern = computed<ItineraryPattern | undefined>(() => {
    const patterns = this.patterns();
    const manuallySelected = patterns.find(
      (item) => item.id === this.selectedPatternId(),
    );
    if (manuallySelected) {
      return manuallySelected;
    }

    const requestedDirection = this.requestedDirection()?.direction;
    if (requestedDirection) {
      const destination = this.normalizeDestination(
        requestedDirection.destination ?? '',
      );
      const destinationMatches = patterns.filter(
        (item) =>
          destination.length > 0 &&
          (this.normalizeDestination(item.headsign) === destination ||
            this.normalizeDestination(
              item.stops[item.stops.length - 1]?.name ?? '',
            ) ===
              destination),
      );
      if (destinationMatches.length === 1) {
        return destinationMatches[0];
      }

      const directionMatches = patterns.filter(
        (item) => item.directionId === requestedDirection.directionId,
      );
      if (directionMatches.length === 1) {
        return directionMatches[0];
      }

      return undefined;
    }

    return patterns[0];
  });
  readonly patternOptions = computed(() => {
    const patterns = this.patterns();
    const isCircular = this.isCircularRoute();

    return patterns.map((pattern, index) => {
      const hasDuplicateHeadsign = patterns.some(
        (other) => other.id !== pattern.id && other.headsign === pattern.headsign,
      );
      const directionLabel = isCircular
        ? 'Circular'
        : pattern.headsign ||
          (pattern.directionId === 0
            ? 'Ida'
            : pattern.directionId === 1
              ? 'Volta'
              : 'Sentido não informado');

      return {
        value: pattern.id,
        label: `${directionLabel}${hasDuplicateHeadsign ? ` (percurso ${index + 1})` : ''}`,
      };
    });
  });
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
      : this.route()?.fares.map(formatBusFare).join(', ') || 'Não informada',
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
                  data: null as PublishedItinerary | null,
                }),
              ),
              startWith({
                loading: true,
                data: null as PublishedItinerary | null,
              }),
            )
          : of({
              loading: false,
              data: null as PublishedItinerary | null,
            }),
      ),
    ),
    {
      initialValue: {
        loading: false,
        data: null as PublishedItinerary | null,
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
      const manuallySelected = directions.find(
        (direction) => direction.id === this.publishedDirectionId(),
      );
      if (manuallySelected) {
        return manuallySelected;
      }

      const requestedDirection = this.requestedDirection()?.direction;
      if (!requestedDirection) {
        return directions[0];
      }

      const requestedDestination = this.normalizeDestination(
        requestedDirection.destination ?? '',
      );
      const directionMatches = directions.filter(
        (direction) =>
          this.normalizeDestination(direction.headsign) ===
          requestedDestination,
      );
      return directionMatches.length === 1 ? directionMatches[0] : undefined;
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
    busRoutes: this.dialogData.favoriteCode ?? this.route()?.routeId,
    subwayStations: '1',
    subwayRoutes: '1',
    bike: '0',
  }));

  cityPath(path = ''): string {
    return this.cityContext.path(path);
  }

  isDirectionFavorite(direction: BusRouteGraphQL): boolean {
    return (
      this.getSavedDirectionFavoriteCode(direction) !== null ||
      this.getSavedBusLineFavoriteCode(direction) !== null
    );
  }

  isWholeLineFavorite(direction: BusRouteGraphQL): boolean {
    return this.getSavedBusLineFavoriteCode(direction) !== null;
  }

  directionFavoriteDisabled(direction: BusRouteGraphQL): boolean {
    const lineCode = this.getSavedBusLineFavoriteCode(direction);
    if (!lineCode) {
      return false;
    }
    const directionCount = this.directionCandidates().filter(
      (candidate) => candidate.direction.routeId === direction.routeId,
    ).length;
    return directionCount < 2;
  }

  directionFavoriteLabel(direction: BusRouteGraphQL): string {
    const directionLabel = direction.isCircular
      ? 'Circular'
      : `destino ${direction.destination || 'não informado'}`;
    if (
      this.getSavedBusLineFavoriteCode(direction) &&
      this.directionFavoriteDisabled(direction)
    ) {
      return `A linha ${direction.shortName} está salva por inteiro; os sentidos ainda não puderam ser separados`;
    }
    return this.isDirectionFavorite(direction)
      ? `Remover favorito da linha ${direction.shortName}, ${directionLabel}`
      : `Adicionar aos favoritos a linha ${direction.shortName}, ${directionLabel}`;
  }

  directionDisplayName(direction: BusRouteGraphQL): string {
    return direction.isCircular
      ? 'Circular'
      : direction.destination || direction.longName;
  }

  directionColor(direction: BusRouteGraphQL): string {
    return normalizeHexColor(direction.color, '5f6368');
  }

  directionTextColor(direction: BusRouteGraphQL): string {
    return normalizeHexColor(
      direction.textColor,
      getContrastColor(this.directionColor(direction)),
    );
  }

  toggleDirectionFavorite(direction: BusRouteGraphQL): void {
    const currentCode = this.getSavedDirectionFavoriteCode(direction);
    if (currentCode) {
      this.favoritesService.removeFavorite(currentCode, 'busRoute');
      return;
    }

    const lineCode = this.getSavedBusLineFavoriteCode(direction);
    if (lineCode) {
      void this.expandWholeLineAndToggleDirection(lineCode, direction);
      return;
    }

    if (
      direction.favoriteCode &&
      isBusDirectionFavorite(direction.favoriteCode)
    ) {
      this.favoritesService.addFavorite(direction.favoriteCode, 'busRoute');
    }
  }

  close(): void {
    this.dialogRef?.close();
  }

  selectDate(date: string): void {
    if (!this.days.some((day) => day.value === date)) return;
    this.selectedPatternId.set('');
    this.showDepartureTimes.set(false);
    this.serviceDate.set(date);
  }

  private getSavedDirectionFavoriteCode(
    direction: BusRouteGraphQL,
  ): string | null {
    const candidates = this.directionCandidates();
    const candidate = candidates.find((item) => item.direction === direction);
    if (!candidate) {
      return null;
    }

    const favoriteCodes = this.favoritesService.favorites().busRoute;
    if (favoriteCodes.includes(candidate.favoriteCode)) {
      return candidate.favoriteCode;
    }

    for (const favoriteCode of favoriteCodes) {
      if (!parseBusDirectionFavorite(favoriteCode)) {
        continue;
      }
      const matched = matchBusDirectionFavorite(favoriteCode, candidates);
      if (matched?.direction === direction) {
        return favoriteCode;
      }
    }

    return null;
  }

  private getSavedBusLineFavoriteCode(
    direction: BusRouteGraphQL,
  ): string | null {
    const candidate = this.directionCandidates().find(
      (item) => item.direction === direction,
    );
    if (!candidate) {
      return null;
    }

    const favoriteCodes = this.favoritesService.favorites().busRoute;
    for (const favoriteCode of favoriteCodes) {
      if (!isBusLineFavorite(favoriteCode)) {
        continue;
      }
      const directionAnchor = getBusLineDirectionAnchor(favoriteCode);
      if (!directionAnchor) {
        continue;
      }
      const matchedAnchor = matchBusDirectionFavorite(
        directionAnchor,
        this.directionCandidates(),
      );
      if (matchedAnchor?.direction.routeId === direction.routeId) {
        return favoriteCode;
      }
    }

    return null;
  }

  private async expandWholeLineAndToggleDirection(
    lineCode: string,
    direction: BusRouteGraphQL,
  ): Promise<void> {
    const directionCodes = Array.from(
      new Set(
        this.directionCandidates()
          .filter((candidate) => candidate.direction.routeId === direction.routeId)
          .map((candidate) => candidate.favoriteCode),
      ),
    );
    if (directionCodes.length < 2) {
      return;
    }

    const migrated = await this.favoritesService.migrateBusRouteFavorite(
      lineCode,
      directionCodes,
    );
    const currentFavorites = new Set(this.favoritesService.favorites().busRoute);
    if (
      migrated ||
      (!currentFavorites.has(lineCode) &&
        directionCodes.every((code) => currentFavorites.has(code)))
    ) {
      const currentDirectionCode = direction.favoriteCode;
      if (currentDirectionCode) {
        this.favoritesService.removeFavorite(
          currentDirectionCode,
          'busRoute',
        );
      }
    }
  }

  private normalizeDestination(value: string): string {
    return value.trim().toLocaleLowerCase('pt-BR');
  }
}
