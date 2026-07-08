import {
  Component,
  inject,
  DestroyRef,
  signal,
  computed,
  isDevMode,
  AfterViewInit,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  effect,
} from '@angular/core';

import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  of,
} from 'rxjs';

import {
  TypesenseSearchService,
  TypesenseSearchResponse,
  NearbyStopsResponse,
  TypesenseSearchResult,
  TypesenseRoute,
  TypesenseStop,
} from '../../../services/typesense-search.service';
import { GeolocationService } from '@metro/shared/geolocation';

import {
  normalizeStationName,
  shouldMergeStations,
  toTitleCase,
  hardNormalizeString,
  SpecialRailService,
  extractLineCodesFromRouteNames,
  getLiveTrainTrackingApiIds,
  mapTypesenseStopToTransitSearchResult,
} from '@metro/shared/utils';
import { GeographyGraphQLService } from '../../services/geography-graphql.service';
import {
  SearchResult,
  SearchResultCardComponent,
  SearchResultType,
} from './search-result-card/search-result-card.component';
import { LoggerService, RailGraphqlService } from '@metro/shared/api';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-search-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    SearchResultCardComponent,
  ],
  templateUrl: './search-dialog.component.html',
  styleUrl: './search-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchDialogComponent implements AfterViewInit {
  @ViewChild('searchInput')
  private readonly searchInputRef!: ElementRef<HTMLInputElement>;

  private readonly dialogRef = inject(MatDialogRef<SearchDialogComponent>);
  private readonly typesenseService = inject(TypesenseSearchService);
  private readonly geographyService = inject(GeographyGraphQLService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);
  private readonly railService = inject(RailGraphqlService);

  // Search state
  readonly searchQuery = signal('');
  readonly searchResults = signal<SearchResult[]>([]);
  readonly isSearching = signal(false);
  readonly isReindexing = signal(false);
  readonly nearbySearch = signal(false);

  // Expose geolocation service signals for template
  readonly locationPermission = this.geolocationService.permission;
  readonly isLocationSupported = this.geolocationService.isSupported;
  readonly isRequestingLocation = this.geolocationService.isRequesting;

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

  /** Whether the nearby search button should be disabled */
  readonly isNearbyDisabled = this.geolocationService.isDisabled;

  /** Tooltip message for the nearby button */
  readonly nearbyButtonTooltip = this.geolocationService.permissionMessage;

  /** User location from geolocation service */
  readonly userLocation = computed(() => {
    const loc = this.geolocationService.location();
    return loc ? { lat: loc.latitude, lng: loc.longitude } : null;
  });

  constructor() {
    this.setupSearchPipeline();
    this.setupNearbySearchEffect();
  }

  ngAfterViewInit(): void {
    // Focus the search input when dialog opens
    setTimeout(() => {
      this.searchInputRef?.nativeElement?.focus();
    }, 100);
  }

  /** Set up the search observable with debouncing */
  private setupSearchPipeline(): void {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query.trim()) {
            return of(null);
          }

          this.isSearching.set(true);
          return forkJoin({
            response: this.typesenseService.search(query),
            specialServices: this.railService.fetchSpecialServices(),
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.isSearching.set(false);
          if (response) {
            this.processSearchResults(
              response.response,
              response.specialServices,
            );
          } else {
            this.searchResults.set([]);
          }
        },
        error: (error) => {
          this.logger.error('Search error', error);
          this.isSearching.set(false);
          this.searchResults.set([]);
        },
      });
  }

  /** Set up effect to trigger nearby search when toggle is enabled */
  private setupNearbySearchEffect(): void {
    effect(() => {
      const isNearby = this.nearbySearch();
      const location = this.userLocation();

      if (isNearby && location) {
        this.performNearbySearch(location.lat, location.lng);
      }
    });
  }

  /** Request geolocation access and get current position */
  async requestLocation(): Promise<void> {
    if (this.isRequestingLocation()) return;

    const location = await this.geolocationService.requestLocation();

    if (location) {
      this.nearbySearch.set(true);
    } else {
      this.nearbySearch.set(false);
    }
  }

  /** Toggle nearby search mode */
  toggleNearbySearch(): void {
    const permission = this.locationPermission();

    if (this.nearbySearch()) {
      // Turning off nearby search
      this.nearbySearch.set(false);
      // Re-run regular search if there's a query
      if (this.searchQuery()) {
        this.searchSubject.next(this.searchQuery());
      } else {
        this.searchResults.set([]);
      }
      return;
    }

    // Turning on nearby search
    if (permission === 'granted' && this.userLocation()) {
      this.nearbySearch.set(true);
    } else if (permission === 'prompt' || permission === 'granted') {
      // Need to request permission or get fresh location
      this.requestLocation();
    }
    // If denied or unavailable, button is disabled so this won't be called
  }

  /** Perform a nearby stops search */
  private performNearbySearch(lat: number, lng: number): void {
    this.isSearching.set(true);
    this.typesenseService
      .searchNearbyStops(lat, lng, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.isSearching.set(false);
          this.processNearbyResults(response);
        },
        error: (error) => {
          this.logger.error('Nearby search error', error);
          this.isSearching.set(false);
          this.searchResults.set([]);
        },
      });
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const query = target.value;
    this.searchQuery.set(query);

    // Disable nearby search when user types
    if (query && this.nearbySearch()) {
      this.nearbySearch.set(false);
    }

    this.searchSubject.next(query);
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
    if ((!response.results || response.results.length === 0) && specialServices.length === 0) {
      this.searchResults.set([]);
      return;
    }

    const results = response.results
      .map((result: TypesenseSearchResult): SearchResult | null => {
        const document = result.document;

        if (result.type === 'route') {
          const route = document as TypesenseRoute;
          const isRailLine = route.source === 'rail';
          return {
            id: route.id,
            name: isRailLine ? route.route_long_name : route.route_short_name,
            type: 'route' as SearchResultType,
            description: isRailLine ? route.route_short_name : route.route_long_name,
            routeData: route,
            latitude: undefined,
            longitude: undefined,
            source: route.source || 'gtfs',
          };
        } else {
          const stop = document as TypesenseStop;
          const stopResult = mapTypesenseStopToTransitSearchResult(stop);

          return stopResult
            ? {
                ...stopResult,
                type: stopResult.type as SearchResultType,
              }
            : null;
        }
      })
      .filter(
        (result): result is SearchResult => result !== null,
      ) as SearchResult[];

    this.logger.debug(
      '[processSearchResults] Before merge:',
      results
        .filter((r) => r.type === 'subway_station')
        .map((r) => ({
          id: r.id,
          name: r.name,
          routes: r.routes,
          source: r.source,
        })),
    );

    // Merge duplicate subway stations
    const specialResults = this.getMatchingSpecialServices(specialServices);
    const mergedResults = [
      ...specialResults,
      ...this.mergeSubwayStationResults(results),
    ];

    this.logger.debug(
      '[processSearchResults] After merge:',
      mergedResults
        .filter((r) => r.type === 'subway_station')
        .map((r) => ({
          id: r.id,
          name: r.name,
          routes: r.routes,
          source: r.source,
        })),
    );

    this.searchResults.set(mergedResults);

    // Fetch routes for GTFS stops only (GPKG stations already have line info)
    const gtfsStops = mergedResults.filter((r) => r.source === 'gtfs');
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

  private processNearbyResults(response: NearbyStopsResponse): void {
    if (!response.stops || response.stops.length === 0) {
      this.searchResults.set([]);
      return;
    }

    const results = response.stops
      .map((stop: TypesenseStop): SearchResult | null => {
        const stopResult = mapTypesenseStopToTransitSearchResult(stop);

        return stopResult
          ? {
              ...stopResult,
              type: stopResult.type as SearchResultType,
            }
          : null;
      })
      .filter(
        (result): result is SearchResult => result !== null,
      ) as SearchResult[];

    // Merge duplicate subway stations
    const mergedResults = this.mergeSubwayStationResults(results);
    this.searchResults.set(mergedResults);

    // Fetch routes for GTFS stops only (GPKG stations already have line info)
    const gtfsStops = mergedResults.filter((r) => r.source === 'gtfs');
    if (gtfsStops.length > 0) {
      this.fetchRoutesForStops(gtfsStops);
    }
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

  /** Merge subway station results that represent the same physical location */
  private mergeSubwayStationResults(results: SearchResult[]): SearchResult[] {
    // Separate subway stations from other results
    const subwayStations = results.filter((r) => r.type === 'subway_station');
    if (subwayStations.length === 0) {
      return results;
    }

    const stationGroups = this.groupSubwayStations(subwayStations);
    const mergedStationByFirstId = new Map<string, SearchResult>();
    const duplicateStationIds = new Set<string>();

    for (const stations of stationGroups) {
      const base = stations[0];
      const allRoutes = new Set<string>();

      stations.forEach((station, index) => {
        station.routes?.forEach((route) => allRoutes.add(route));
        if (index > 0) {
          duplicateStationIds.add(station.id);
        }
      });

      mergedStationByFirstId.set(base.id, {
        ...base,
        name: toTitleCase(normalizeStationName(base.name)),
        routes: Array.from(allRoutes).sort(),
      });
    }

    return results
      .map((result) => {
        if (result.type !== 'subway_station') {
          return result;
        }

        if (duplicateStationIds.has(result.id)) {
          return null;
        }

        return mergedStationByFirstId.get(result.id) ?? result;
      })
      .filter((result): result is SearchResult => result !== null);
  }

  private groupSubwayStations(stations: SearchResult[]): SearchResult[][] {
    const groups: SearchResult[][] = [];

    for (const station of stations) {
      const group = groups.find((items) =>
        shouldMergeStations(station.name, items[0].name),
      );

      if (group) {
        group.push(station);
      } else {
        groups.push([station]);
      }
    }

    return groups;
  }
}
