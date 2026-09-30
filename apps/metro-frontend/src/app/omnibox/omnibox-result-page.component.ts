import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  Type,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink, UrlTree } from '@angular/router';
import {
  getRailLineById,
  getUniqueAgencies,
  RailLineInfo,
} from '@metro/shared/utils';
import {
  BehaviorSubject,
  Observable,
  catchError,
  firstValueFrom,
  from,
  map,
  of,
  scan,
  startWith,
  switchMap,
} from 'rxjs';
import { BusItineraryDialogComponent } from '../bus-itinerary/bus-itinerary-dialog.component';
import { CityContextService } from '../cities/city-context.service';
import { LineStatusGridComponent } from '../home/components/line-status-grid/line-status-grid.component';
import { BikeStationDialogComponent } from '../map-main/components/bike-station-dialog/bike-station-dialog.component';
import { BikeStation } from '../map-main/components/map/map.types';
import { BusStopDialogComponent } from '../map-main/components/bus-stop-dialog/bus-stop-dialog.component';
import { SubwayStationDialogComponent } from '../map-main/components/subway-station-dialog/subway-station-dialog.component';
import { SearchResult } from '../map-main/components/search-dialog/search-result-card/search-result-card.component';
import {
  mapTypesenseResult,
  mergeSubwayStationResults,
} from '../map-main/components/search-dialog/search-dialog.utils';
import { BikeStationsService } from '../map-main/geography/bike-stations.service';
import type {
  BusRouteGraphQL,
  BusStopGraphQL,
  StopFullDataSnapshot,
} from '../map-main/geography/geography-graphql.service';
import { GeographyGraphQLService } from '../map-main/geography/geography-graphql.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { TransitSearchFieldComponent } from '../shared/components/transit-search-field/transit-search-field.component';

interface DetailBase {
  title: string;
  mapParams: Record<string, string> | null;
}

type Detail = DetailBase &
  (
    | { kind: 'bus-route'; data: { routeId: string } }
    | { kind: 'rail-line'; data: RailLineInfo }
    | {
        kind: 'bus-stop';
        data: {
          stop: BusStopGraphQL;
          routes: BusRouteGraphQL[];
          selectedRoutes: Set<string>;
          showMapActions: false;
          routesLoading: boolean;
          routesError: boolean;
        };
      }
    | { kind: 'rail-station'; data: { stop: BusStopGraphQL } }
    | { kind: 'bike-station'; data: { station: BikeStation } }
  );

interface DetailState {
  loading: boolean;
  detail: Detail | null;
}

const LOADING: DetailState = { loading: true, detail: null };

@Component({
  selector: 'app-omnibox-result-page',
  imports: [
    NgComponentOutlet,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    TransitSearchFieldComponent,
    LineStatusGridComponent,
  ],
  templateUrl: './omnibox-result-page.component.html',
  styleUrl: './omnibox-result-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OmniboxResultPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly geography = inject(GeographyGraphQLService);
  private readonly search = inject(TypesenseSearchService);
  private readonly bikes = inject(BikeStationsService);
  readonly cityContext = inject(CityContextService);
  private readonly urlQuery = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('q') ?? '')),
    { initialValue: this.route.snapshot.queryParamMap.get('q') ?? '' },
  );
  private readonly draftQuery = signal<string | null>(null);
  readonly query = computed(() => this.draftQuery() ?? this.urlQuery());
  private readonly searchQueries = new BehaviorSubject(this.query());
  private openingSearch = false;
  readonly searchOpen = signal(false);
  readonly searchError = signal('');
  readonly state = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) =>
        this.loadDetail(params.get('kind'), params.get('id')).pipe(
          startWith(LOADING),
        ),
      ),
    ),
    { initialValue: LOADING },
  );
  readonly detail = computed(() => this.state().detail);
  readonly bikeStation = computed(() => {
    const detail = this.detail();
    if (detail?.kind !== 'bike-station') return null;
    return (
      this.bikes.getStation(detail.data.station.stationId) ??
      detail.data.station
    );
  });
  readonly stationMapLink = computed<UrlTree | null>(() => {
    const detail = this.detail();
    if (detail?.kind !== 'rail-station' || !detail.mapParams) return null;
    return this.router.createUrlTree([this.cityContext.path('/mapa')], {
      queryParams: detail.mapParams,
    });
  });
  readonly detailComponent = computed<Type<unknown> | null>(() => {
    switch (this.detail()?.kind) {
      case 'bus-route':
        return BusItineraryDialogComponent;
      case 'bus-stop':
        return BusStopDialogComponent;
      case 'rail-station':
        return SubwayStationDialogComponent;
      case 'bike-station':
        return BikeStationDialogComponent;
      default:
        return null;
    }
  });
  readonly detailInjector = linkedSignal<Detail | null, Injector | null>({
    source: () => this.detail(),
    computation: (detail, previous) => {
      if (!detail || detail.kind === 'rail-line') return null;
      if (
        previous?.value &&
        previous.source?.kind === 'bus-stop' &&
        detail.kind === 'bus-stop' &&
        previous.source.data.stop.stopId === detail.data.stop.stopId
      ) {
        return previous.value;
      }
      return Injector.create({
        parent: this.injector,
        providers: [{ provide: MAT_DIALOG_DATA, useValue: detail.data }],
      });
    },
  });
  readonly embeddedInputs = computed(() => {
    const detail = this.detail();
    return {
      embedded: true,
      ...(detail?.kind === 'bus-stop' ? { detailsOverride: detail.data } : {}),
      ...(detail?.kind === 'bike-station'
        ? { stationOverride: this.bikeStation() }
        : {}),
      ...(detail?.kind === 'rail-station'
        ? { mapLink: this.stationMapLink() }
        : {}),
    };
  });

  private loadDetail(
    kind: string | null,
    id: string | null,
  ): Observable<DetailState> {
    if (!id) return of({ loading: false, detail: null });
    if (kind === 'bus-stop') return this.loadBusStopDetail(id);
    return from(this.loadNonStopDetail(kind, id));
  }

  private loadBusStopDetail(stopId: string): Observable<DetailState> {
    return this.geography.watchStopFullData(stopId).pipe(
      map((snapshot) => ({ type: 'snapshot' as const, snapshot })),
      catchError(() => of({ type: 'error' as const })),
      scan((state, event) => {
        if (event.type === 'error') {
          const current = state.detail;
          if (current?.kind !== 'bus-stop') {
            return { loading: false, detail: null };
          }
          return {
            loading: false,
            detail: {
              ...current,
              data: {
                ...current.data,
                routesLoading: false,
                routesError: true,
              },
            },
          };
        }
        return this.applyBusStopSnapshot(state, stopId, event.snapshot);
      }, LOADING),
    );
  }

  private applyBusStopSnapshot(
    previous: DetailState,
    requestedStopId: string,
    snapshot: StopFullDataSnapshot,
  ): DetailState {
    const previousDetail =
      previous.detail?.kind === 'bus-stop' ? previous.detail : null;
    const stop = snapshot.stop ?? previousDetail?.data.stop ?? null;
    if (!stop) {
      return snapshot.hasNext ? previous : { loading: false, detail: null };
    }

    const routes =
      snapshot.routes === undefined
        ? (previousDetail?.data.routes ?? [])
        : (snapshot.routes ?? []).map(({ route }) => route);
    const routesError =
      previousDetail?.data.routesError === true ||
      (snapshot.errors?.length ?? 0) > 0 ||
      (!snapshot.hasNext && snapshot.routes === undefined);
    const detail: Detail = {
      kind: 'bus-stop',
      title: stop.name,
      data: {
        stop,
        routes,
        selectedRoutes: new Set<string>(),
        showMapActions: false,
        routesLoading: snapshot.hasNext && !routesError,
        routesError,
      },
      mapParams: {
        busStops: stop.stopId || requestedStopId,
        lat: String(stop.latitude),
        lon: String(stop.longitude),
        z: '16',
      },
    };
    return { loading: false, detail };
  }

  private async loadNonStopDetail(
    kind: string | null,
    id: string,
  ): Promise<DetailState> {
    try {
      let detail: Detail | null = null;
      switch (kind) {
        case 'bus-route':
          detail = {
            kind,
            title: 'Itinerário de ônibus',
            data: { routeId: id },
            mapParams: { busRoutes: id, focusRoute: id },
          };
          break;
        case 'rail-line': {
          const line = getRailLineById(id);
          if (line) {
            detail = {
              kind,
              title: line.fullName,
              data: line,
              mapParams: {
                railRoutes: line.lineId,
                subwayStations: '1',
                subwayRoutes: '1',
                focusRoute: line.lineId,
              },
            };
          }
          break;
        }
        case 'rail-station':
        case 'bike-station': {
          const result = await this.findSearchResult(id, kind);
          if (!result) break;
          const latitude = result.latitude;
          const longitude = result.longitude;
          const hasCoordinates =
            latitude != null &&
            longitude != null &&
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            !(latitude === 0 && longitude === 0);
          if (kind === 'rail-station') {
            const stop: BusStopGraphQL = {
              id,
              stopId: id,
              name: result.name,
              latitude: hasCoordinates ? latitude : 0,
              longitude: hasCoordinates ? longitude : 0,
              isSubwayStation: true,
              agencies: getUniqueAgencies(result.routes ?? []),
              routeShortNames: result.routes ?? [],
            };
            detail = {
              kind,
              title: result.name,
              data: { stop },
              mapParams: hasCoordinates
                ? {
                    railStationId: id,
                    railStationName: result.name,
                    subwayStations: '1',
                    lat: String(latitude),
                    lon: String(longitude),
                    z: '16',
                  }
                : null,
            };
          } else {
            if (!hasCoordinates) break;
            const station =
              this.bikes.getStation(id) ??
              this.bikes.upsertStationSummary({
                stationId: id,
                name: result.name,
                latitude,
                longitude,
                capacity: null,
                effectiveCapacity: 0,
                numBikesAvailable: 0,
                electricBikesAvailable: 0,
              });
            this.bikes.ensureStationDetails(id);
            detail = {
              kind,
              title: result.name,
              data: { station },
              mapParams: {
                bike: '1',
                bikeStationId: id,
                bikeStationName: result.name,
                lat: String(latitude),
                lon: String(longitude),
                z: '17',
              },
            };
          }
          break;
        }
      }
      return { loading: false, detail };
    } catch {
      return { loading: false, detail: null };
    }
  }

  private async findSearchResult(
    id: string,
    kind: 'rail-station' | 'bike-station',
  ): Promise<SearchResult | null> {
    const type = kind === 'rail-station' ? 'railStation' : 'bikeStation';
    const query = this.route.snapshot.queryParamMap.get('q')?.trim() || id;
    for (const term of new Set([query, id])) {
      const response = await firstValueFrom(this.search.search(term, [type]));
      if (!response.success) continue;
      const results = mergeSubwayStationResults(
        response.results
          .map(mapTypesenseResult)
          .filter((item): item is SearchResult => item !== null),
      );
      const result = results.find((item) => item.id === id);
      if (result) return result;
    }
    const params = this.route.snapshot.queryParamMap;
    const lat = Number(params.get('lat'));
    const lon = Number(params.get('lon'));
    const name = params.get('name');
    if (!name) return null;
    return {
      id,
      name,
      type: kind === 'rail-station' ? 'subway_station' : 'bike_station',
      latitude: params.has('lat') && Number.isFinite(lat) ? lat : undefined,
      longitude: params.has('lon') && Number.isFinite(lon) ? lon : undefined,
      routes: params.get('lines')?.split(',').filter(Boolean) ?? [],
    };
  }

  async openSearch(query = this.query()): Promise<void> {
    this.searchQueries.next(query);
    if (this.searchOpen() || this.openingSearch) return;
    this.openingSearch = true;
    this.searchError.set('');
    await import('./omnibox-dialog.component')
      .then(({ OmniboxDialogComponent }) => {
        if (this.destroyRef.destroyed) return;
        const ref = this.dialog.open(OmniboxDialogComponent, {
          width: '760px',
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: '90dvh',
          autoFocus: 'input',
          // Accept typing as soon as the dialog renders, including during its animation.
          delayFocusTrap: false,
          restoreFocus: true,
          data: {
            queryChanges: this.searchQueries.asObservable(),
            onQueryChange: (next: string) => this.draftQuery.set(next),
          },
        });
        ref.componentInstance.focusSearch();
        this.searchOpen.set(true);
        ref
          .afterClosed()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.searchOpen.set(false);
            const draft = this.draftQuery();
            if (draft === null) return;
            void this.router
              .navigate([], {
                relativeTo: this.route,
                queryParams: { q: draft || null },
                queryParamsHandling: 'merge',
                replaceUrl: true,
              })
              .finally(() => this.draftQuery.set(null));
          });
      })
      .catch(() => {
        this.searchOpen.set(false);
        this.searchError.set(
          'Não foi possível abrir a busca. Tente novamente.',
        );
      })
      .finally(() => {
        this.openingSearch = false;
      });
  }
}
