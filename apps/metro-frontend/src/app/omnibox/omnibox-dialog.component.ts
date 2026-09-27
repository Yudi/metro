import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatChipListboxChange, MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  BehaviorSubject,
  Observable,
  Subject,
  catchError,
  map,
  of,
  startWith,
  switchMap,
  timer,
} from 'rxjs';
import { GeolocationService } from '@metro/shared/geolocation';
import { getUniqueAgencies, SearchTypes } from '@metro/shared/utils';
import { CityContextService } from '../cities/city-context.service';
import {
  matchDestinations,
  searchDestinations,
} from '../menu/menu-destinations';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { TransitSearchFieldComponent } from '../shared/components/transit-search-field/transit-search-field.component';
import {
  SearchResult,
  SearchResultCardComponent,
} from '../map-main/components/search-dialog/search-result-card/search-result-card.component';
import {
  mapNearbyStop,
  mapTypesenseResult,
  mergeSubwayStationResults,
} from '../map-main/components/search-dialog/search-dialog.utils';
import { GeographyGraphQLService } from '../map-main/geography/geography-graphql.service';
import { BusStopDialogComponent } from '../map-main/components/bus-stop-dialog/bus-stop-dialog.component';
import { SubwayStationDialogComponent } from '../map-main/components/subway-station-dialog/subway-station-dialog.component';
import { BusItineraryDialogComponent } from '../bus-itinerary/bus-itinerary-dialog.component';

export interface OmniboxDialogData {
  queryChanges?: Observable<string>;
  onQueryChange?: (query: string) => void;
}

export type OmniboxFilter = 'all' | 'routes' | 'stops' | 'pages';
type SearchRequest =
  | { query: string; filter: OmniboxFilter }
  | { latitude: number; longitude: number };

interface SearchState {
  loading: boolean;
  error: boolean;
  results: SearchResult[];
}

const EMPTY_STATE: SearchState = {
  loading: false,
  error: false,
  results: [],
};
const FILTER_TYPES: Record<Exclude<OmniboxFilter, 'pages'>, SearchTypes[]> = {
  all: [...SearchTypes],
  routes: ['busRoute', 'railLine'],
  stops: ['busStop', 'railStation', 'bikeStation'],
};

@Component({
  selector: 'app-omnibox-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressBarModule,
    RouterLink,
    TransitSearchFieldComponent,
    SearchResultCardComponent,
  ],
  templateUrl: './omnibox-dialog.component.html',
  styleUrl: './omnibox-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OmniboxDialogComponent {
  readonly dialogRef = inject(MatDialogRef<OmniboxDialogComponent>);
  private readonly dialogData = inject<OmniboxDialogData>(MAT_DIALOG_DATA, {
    optional: true,
  });
  readonly cityContext = inject(CityContextService);
  readonly geolocation = inject(GeolocationService);
  private readonly search = inject(TypesenseSearchService);
  private readonly geography = inject(GeographyGraphQLService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly requests = new BehaviorSubject<SearchRequest>({
    query: '',
    filter: 'all',
  });
  private readonly selections = new Subject<SearchResult | null>();
  private locationRequest = 0;
  readonly query = signal('');
  readonly filter = signal<OmniboxFilter>('all');
  readonly nearby = signal(false);
  readonly locationError = signal('');
  readonly detailError = signal('');
  readonly openingId = signal<string | null>(null);
  readonly filters: { value: OmniboxFilter; label: string }[] = [
    { value: 'all', label: 'Tudo' },
    { value: 'routes', label: 'Linhas' },
    { value: 'stops', label: 'Paradas e estações' },
    { value: 'pages', label: 'Páginas' },
  ];
  readonly destinations = computed(() =>
    searchDestinations(this.cityContext.city()),
  );
  readonly pages = computed(() =>
    !this.nearby() && (this.filter() === 'all' || this.filter() === 'pages')
      ? matchDestinations(this.query(), this.destinations())
      : [],
  );
  readonly state = toSignal(
    this.requests.pipe(switchMap((request) => this.loadResults(request))),
    { initialValue: EMPTY_STATE },
  );

  private loadResults(request: SearchRequest) {
    if (
      'query' in request &&
      (!request.query.trim() || request.filter === 'pages')
    ) {
      return of(EMPTY_STATE);
    }
    const response =
      'latitude' in request
        ? this.search
            .searchNearbyStops(request.latitude, request.longitude)
            .pipe(
              map((result) => ({
                success: result.success,
                results: result.stops.map(mapNearbyStop),
              })),
            )
        : timer(250).pipe(
            switchMap(() =>
              this.search.search(
                request.query,
                FILTER_TYPES[request.filter as Exclude<OmniboxFilter, 'pages'>],
              ),
            ),
            map((result) => ({
              success: result.success,
              results: result.results.map(mapTypesenseResult),
            })),
          );
    return response.pipe(
      map(
        (result): SearchState => ({
          loading: false,
          error: !result.success,
          // Merging retains the first ranked occurrence, without agency regrouping.
          results: mergeSubwayStationResults(
            result.results.filter(
              (item): item is SearchResult => item !== null,
            ),
          ),
        }),
      ),
      catchError(() => of({ ...EMPTY_STATE, error: true })),
      startWith({ ...EMPTY_STATE, loading: true }),
    );
  }

  constructor() {
    this.dialogRef
      .beforeClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // A pending detail/location response must not reopen UI during closing.
        this.locationRequest++;
        this.cancelSelection();
      });
    this.dialogData?.queryChanges
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => this.setQuery(query));
    this.router.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event instanceof NavigationStart) this.dialogRef.close();
      });
    this.selections
      .pipe(
        switchMap((result) => {
          if (!result) return of(null);
          return this.geography.getBusStop(result.id).pipe(
            switchMap((stop) => {
              if (!stop) throw new Error('Stop unavailable');
              return this.geography.getRoutesForStop(stop.stopId).pipe(
                catchError(() => of([])),
                map((routes) => ({ stop, routes })),
              );
            }),
            catchError(() => {
              this.detailError.set(
                'Não foi possível abrir a parada. Selecione o resultado para tentar novamente.',
              );
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((detail) => {
        this.openingId.set(null);
        if (detail) {
          this.dialog.open(BusStopDialogComponent, {
            ariaLabel: detail.stop.name,
            data: {
              ...detail,
              selectedRoutes: new Set<string>(),
              showMapActions: false,
            },
            width: '640px',
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: '90dvh',
          });
        }
      });
  }

  setQuery(query: string): void {
    this.locationRequest++;
    this.query.set(query);
    this.dialogData?.onQueryChange?.(query);
    this.nearby.set(false);
    this.locationError.set('');
    this.cancelSelection();
    this.requests.next({ query, filter: this.filter() });
  }

  onFilterChange(event: MatChipListboxChange): void {
    if (!event.value) {
      event.source.value = this.filter();
      return;
    }
    this.setFilter(event.value);
  }

  setFilter(filter: OmniboxFilter): void {
    if (!filter) return;
    this.filter.set(filter);
    this.setQuery(this.query());
  }

  clear(): void {
    this.setQuery('');
  }

  retry(): void {
    this.requests.next(this.requests.value);
  }

  async searchNearby(): Promise<void> {
    if (this.geolocation.isRequesting()) return;
    const request = ++this.locationRequest;
    this.locationError.set('');
    const location =
      this.geolocation.location() ?? (await this.geolocation.requestLocation());
    if (request !== this.locationRequest || this.destroyRef.destroyed) return;
    if (!location) {
      this.locationError.set(
        this.geolocation.permissionMessage() ||
          'Não foi possível obter sua localização. Tente novamente.',
      );
      return;
    }
    this.cancelSelection();
    this.query.set('');
    this.dialogData?.onQueryChange?.('');
    this.filter.set('stops');
    this.nearby.set(true);
    this.requests.next({
      latitude: location.latitude,
      longitude: location.longitude,
    });
  }

  selectResult(result: SearchResult): void {
    this.cancelSelection();
    if (result.type === 'route' && result.routeData?.source !== 'rail') {
      if (!result.routeData) return;
      this.dialog.open(BusItineraryDialogComponent, {
        data: { routeId: result.routeData.route_id },
        width: '900px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
      });
    } else if (result.type === 'subway_station') {
      this.dialog.open(SubwayStationDialogComponent, {
        ariaLabel: result.name,
        data: {
          stop: {
            id: result.id,
            stopId: result.id,
            name: result.name,
            latitude: result.latitude ?? 0,
            longitude: result.longitude ?? 0,
            isSubwayStation: true,
            agencies: getUniqueAgencies(result.routes ?? []),
            routeShortNames: result.routes ?? [],
          },
        },
        width: '600px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
      });
    } else if (result.type === 'bus_stop') {
      this.openingId.set(result.id);
      this.selections.next(result);
    } else {
      this.dialogRef.close();
      void this.router.navigate([this.cityContext.path('/mapa')], {
        queryParams:
          result.type === 'route'
            ? {
                railRoutes: result.routeData?.route_id,
                subwayStations: '1',
                subwayRoutes: '1',
              }
            : {
                bike: '1',
                lat: result.latitude,
                lon: result.longitude,
                z: '17',
              },
      });
    }
  }

  private cancelSelection(): void {
    this.selections.next(null);
    this.openingId.set(null);
    this.detailError.set('');
  }
}
