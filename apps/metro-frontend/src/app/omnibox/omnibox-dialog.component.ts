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
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatChipListboxChange, MatChipsModule } from '@angular/material/chips';
import {
  BehaviorSubject,
  Observable,
  catchError,
  map,
  of,
  startWith,
  switchMap,
  timer,
} from 'rxjs';
import { GeolocationService } from '@metro/shared/geolocation';
import { SearchTypes } from '@metro/shared/utils';
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
import { resultKind, resultQueryParams } from './omnibox-result-link';

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
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly requests = new BehaviorSubject<SearchRequest>({
    query: '',
    filter: 'all',
  });
  private locationRequest = 0;
  readonly query = signal('');
  readonly filter = signal<OmniboxFilter>('all');
  readonly nearby = signal(false);
  readonly locationError = signal('');
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
        this.locationRequest++;
      });
    this.dialogData?.queryChanges
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => this.setQuery(query));
    this.router.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event instanceof NavigationStart) this.dialogRef.close();
      });
  }

  setQuery(query: string): void {
    this.locationRequest++;
    this.query.set(query);
    this.dialogData?.onQueryChange?.(query);
    this.nearby.set(false);
    this.locationError.set('');
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
    const id = result.type === 'route' ? result.routeData?.route_id : result.id;
    if (!id) return;
    void this.router.navigate(
      [this.cityContext.path('/busca'), resultKind(result), id],
      { queryParams: resultQueryParams(result, this.query()) },
    );
  }
}
