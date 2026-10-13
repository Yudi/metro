import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  DestroyRef,
  signal,
  computed,
  isDevMode,
  ChangeDetectionStrategy,
  viewChild,
} from '@angular/core';

import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  defer,
  forkJoin,
  of,
  shareReplay,
  switchMap,
  timer,
} from 'rxjs';

import {
  TypesenseSearchService,
  TypesenseSearchResponse,
} from '../../../search/typesense-search.service';

import {
  hardNormalizeString,
  SpecialRailService,
  extractLineCodesFromRouteNames,
  getLiveTrainTrackingApiIds,
} from '@metro/shared/utils';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import {
  SearchResult,
  SearchResultCardComponent,
} from './search-result-card/search-result-card.component';
import { LoggerService, RailGraphqlService } from '@metro/shared/api';
import {
  mapTypesenseResult,
  mergeSubwayStationResults,
  orderSearchResults,
} from './search-dialog.utils';

export interface SearchDialogData {
  queryChanges?: Observable<string>;
  onQueryChange?: (query: string) => void;
}

@Component({
  selector: 'app-search-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SearchResultCardComponent,
  ],
  templateUrl: './search-dialog.component.html',
  styleUrl: './search-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<SearchDialogComponent>);
  private readonly dialogData = inject<SearchDialogData>(MAT_DIALOG_DATA, {
    optional: true,
  });
  private readonly typesenseService = inject(TypesenseSearchService);
  private readonly geographyService = inject(GeographyGraphQLService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);
  private readonly railService = inject(RailGraphqlService);
  private readonly specialServices$ = defer(() => {
    const cachedServices = this.railService.specialServices();
    return cachedServices.length > 0
      ? of(cachedServices)
      : this.railService.fetchSpecialServices();
  }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>(
    'searchInput',
  );

  // Search state
  readonly searchQuery = signal('');
  readonly searchResults = signal<SearchResult[]>([]);
  readonly isSearching = signal(false);
  readonly isReindexing = signal(false);

  // Search subject for debouncing
  private readonly searchSubject = new Subject<string>();

  readonly isDevMode = isDevMode();

  // Computed values
  readonly hasResults = computed(() => this.searchResults().length > 0);
  readonly showNoResults = computed(
    () =>
      this.searchQuery().length > 0 &&
      !this.isSearching() &&
      !this.hasResults() &&
      !this.isReindexing(),
  );

  constructor() {
    this.setupSearchPipeline();
    this.dialogData?.queryChanges
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((query) => this.setQuery(query));
  }

  /** Set up the search observable with debouncing */
  private setupSearchPipeline(): void {
    this.searchSubject
      .pipe(
        switchMap((query) => {
          if (!query.trim()) {
            this.isSearching.set(false);
            this.searchResults.set([]);
            return EMPTY;
          }

          this.isSearching.set(true);
          return timer(250).pipe(
            switchMap(() =>
              forkJoin({
                response: this.typesenseService.search(query),
                specialServices: this.specialServices$,
              }),
            ),
            catchError((error: unknown) => {
              this.logger.error('Search error', error);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.isSearching.set(false);
        if (response) {
          this.processSearchResults(
            response.response,
            response.specialServices,
          );
        } else {
          this.searchResults.set([]);
        }
      });
  }

  onSearchInput(event: Event): void {
    this.setQuery((event.target as HTMLInputElement).value);
  }

  setQuery(query: string): void {
    if (query === this.searchQuery()) return;

    this.searchQuery.set(query);
    this.dialogData?.onQueryChange?.(query);
    this.searchSubject.next(query);
  }

  focusSearch(): void {
    this.changeDetector.detectChanges();
    const input = this.searchInput()?.nativeElement;
    if (!input) return;

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  reindexData(): void {
    if (!isDevMode()) return;

    this.isReindexing.set(true);

    this.typesenseService
      .reindexData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.isReindexing.set(false);
          if (response.success) {
            this.logger.debug(
              'Reindexing completed successfully',
              response.message,
            );
            if (this.searchQuery()) {
              this.searchSubject.next(this.searchQuery());
            }
          } else {
            this.logger.error('Reindexing failed', response.message);
          }
        },
        error: (error) => {
          this.logger.error('Reindexing error', error);
          this.isReindexing.set(false);
        },
      });
  }

  onResultClick(result: SearchResult): void {
    this.logger.debug('[onResultClick] Result clicked:', {
      id: result.id,
      name: result.name,
      type: result.type,
      description: result.description,
      routes: result.routes,
      lineCodes: result.lineCodes,
      source: result.source,
      liveTrainTrackingApiIds: result.liveTrainTrackingApiIds,
    });
    this.dialogRef.close(result);
  }

  private processSearchResults(
    response: TypesenseSearchResponse,
    specialServices: SpecialRailService[] = [],
  ): void {
    if (
      (!response.results || response.results.length === 0) &&
      specialServices.length === 0
    ) {
      this.searchResults.set([]);
      return;
    }

    const results = response.results
      .map(mapTypesenseResult)
      .filter((result): result is SearchResult => result !== null);
    const orderedResults = orderSearchResults(results);

    this.logger.debug(
      '[processSearchResults] Before merge:',
      orderedResults
        .filter((result) => result.type === 'subway_station')
        .map((result) => ({
          id: result.id,
          name: result.name,
          routes: result.routes,
          source: result.source,
        })),
    );

    const specialResults = this.getMatchingSpecialServices(specialServices);
    const mergedResults = [
      ...specialResults,
      ...mergeSubwayStationResults(orderedResults),
    ];

    this.logger.debug(
      '[processSearchResults] After merge:',
      mergedResults
        .filter((result) => result.type === 'subway_station')
        .map((result) => ({
          id: result.id,
          name: result.name,
          routes: result.routes,
          source: result.source,
        })),
    );

    this.searchResults.set(mergedResults);
    const gtfsStops = mergedResults.filter(
      (result) => result.source === 'gtfs',
    );
    if (gtfsStops.length > 0) {
      this.fetchRoutesForStops(gtfsStops);
    }
  }

  private getMatchingSpecialServices(
    services: SpecialRailService[],
  ): SearchResult[] {
    const query = hardNormalizeString(this.searchQuery());

    return services
      .filter((service) =>
        hardNormalizeString(`${service.code} ${service.name}`).includes(query),
      )
      .map((service) => ({
        id: service.code,
        name: service.name,
        type: 'route',
        description: service.code,
        source: 'rail',
        specialService: service,
      }));
  }

  /** Fetch route information for stop results using batched GraphQL query */
  private fetchRoutesForStops(results: SearchResult[]): void {
    // Get all stop IDs (bus stops and subway stations)
    const stopIds = results
      .filter((r) => r.type === 'bus_stop' || r.type === 'subway_station')
      .map((r) => r.id);

    if (stopIds.length === 0) return;

    // Single batched GraphQL request for all stops
    this.geographyService
      .getBatchRoutesForStops(stopIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (routeMap) => {
          // Update results with route information
          const updatedResults = this.searchResults().map((result) => {
            if (
              (result.type === 'bus_stop' ||
                result.type === 'subway_station') &&
              routeMap.has(result.id)
            ) {
              const routes = routeMap.get(result.id) || [];
              // Extract line codes for subway stations
              const lineCodes =
                result.type === 'subway_station'
                  ? extractLineCodesFromRouteNames(routes)
                  : undefined;
              const liveTrainTrackingApiIds =
                lineCodes !== undefined
                  ? getLiveTrainTrackingApiIds(lineCodes)
                  : [];
              return {
                ...result,
                routes,
                lineCodes,
                liveTrainTrackingApiIds,
              };
            }
            return result;
          });
          this.searchResults.set(updatedResults);
        },
        error: (error) => {
          this.logger.error('Failed to fetch routes for stops', error);
        },
      });
  }
}
