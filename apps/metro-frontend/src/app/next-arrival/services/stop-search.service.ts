import { Injectable, inject, DestroyRef, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Subject,
  of,
  debounceTime,
  distinctUntilChanged,
  switchMap,
} from 'rxjs';

import {
  TypesenseSearchService,
  TypesenseStop,
  NearbyStopsResponse,
} from '../../services/typesense-search.service';
import { GeographyGraphQLService } from '../../map-main/services/geography-graphql.service';
import { LoggerService } from '@metro/shared/api';
import {
  mergeByStationName,
  normalizeStationName,
  toTitleCase,
  getLineCodesFromColorNames,
  SearchTypes,
  getCanonicalRailStationName,
  extractLineCodesFromRouteNames,
  getLiveTrainTrackingApiIds,
  mapTypesenseStopToTransitSearchResult,
} from '@metro/shared/utils';
import {
  SearchResult,
  SearchResultType,
} from '../../map-main/components/search-dialog/search-result-card/search-result-card.component';
import { HttpClient } from '@angular/common/http';

// Re-export types for backward compatibility
export type { SearchResult, SearchResultType };

/**
 * Extended search result with stopId for next-train specific needs
 */
export interface StopSearchResult extends SearchResult {
  stopId: string;
}

/**
 * Service for searching stops only (no routes)
 * Prioritizes live-tracked stations, then other subway stations, then bus stops
 */
@Injectable()
export class StopSearchService {
  private readonly typesenseService = inject(TypesenseSearchService);
  private readonly geographyService = inject(GeographyGraphQLService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);
  private readonly http = inject(HttpClient);

  // State signals
  readonly searchQuery = signal('');
  readonly searchResults = signal<StopSearchResult[]>([]);
  readonly isSearching = signal(false);
  readonly hasResults = signal(false);
  readonly nearbyMode = signal(false);

  // Search subject for debouncing
  private readonly searchSubject = new Subject<string>();
  private searchTypes = signal<SearchTypes[]>([]);

  // L8/L9 line keywords for prioritization
  private readonly L8_L9_KEYWORDS = [
    'l8',
    'l9',
    'linha 8',
    'linha 9',
    'diamante',
    'esmeralda',
  ];

  constructor() {
    this.setupSearchPipeline();
  }

  /**
   * Trigger a search with the given query
   */
  search(query: string, types: SearchTypes[]): void {
    this.nearbyMode.set(false);
    this.searchQuery.set(query);
    this.searchTypes.set(types);
    this.searchSubject.next(query);
  }

  /**
   * Search for nearby stops using geolocation
   */
  searchNearby(lat: number, lon: number, radius = 1000): void {
    this.isSearching.set(true);
    this.nearbyMode.set(true);
    this.searchQuery.set('');

    this.typesenseService
      .searchNearbyStops(lat, lon, radius)
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
          this.hasResults.set(false);
        },
      });
  }

  /**
   * Clear search results
   */
  clear(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.hasResults.set(false);
    this.nearbyMode.set(false);
  }

  private setupSearchPipeline(): void {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query.trim() || query.length < 2) {
            return of(null);
          }

          this.isSearching.set(true);
          return this.http.post<NextArrivalComponentSearchResult>(
            '/api/graphql',
            {
              query: this.searchQueryDocument,
              variables: {
                input: {
                  query: query.trim(),
                  limit: 10,
                  includeBusRoutes: false,
                  includeBusStops: this.searchTypes().includes('busStop'),
                  includeRailLines: false,
                  includeRailStations:
                    this.searchTypes().includes('railStation'),
                  includeBikeStations: false,
                },
              },
            },
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.isSearching.set(false);
          if (response) {
            const results = this.sortResults(
              this.mergeSubwayStationResults(
                (response.data?.search || [])
                  .map((item) => this.mapSearchItemToResult(item))
                  .filter(
                    (result): result is StopSearchResult => result !== null,
                  ),
              ),
            );
            this.searchResults.set(results);
            this.hasResults.set(results.length > 0);
            this.fetchRoutesForStops(results);
          } else {
            this.searchResults.set([]);
            this.hasResults.set(false);
          }
        },
        error: (error) => {
          this.logger.error('Stop search error', error);
          this.isSearching.set(false);
          this.searchResults.set([]);
          this.hasResults.set(false);
        },
      });
  }

  private processNearbyResults(response: NearbyStopsResponse): void {
    if (!response.stops || response.stops.length === 0) {
      this.searchResults.set([]);
      this.hasResults.set(false);
      return;
    }

    const results: StopSearchResult[] = response.stops
      .map((stop: TypesenseStop): StopSearchResult | null =>
        this.mapNearbyStopToResult(stop),
      )
      .filter((result): result is StopSearchResult => result !== null);

    // Merge duplicate subway stations by name
    const mergedResults = this.mergeSubwayStationResults(results);

    // For nearby mode, we keep distance-based order (already from Typesense)
    // but still group subway stations first within the same approximate distance
    const sortedResults = this.sortResults(mergedResults);

    this.searchResults.set(sortedResults);
    this.hasResults.set(sortedResults.length > 0);

    // Fetch routes for stops asynchronously
    this.fetchRoutesForStops(sortedResults);
  }

  private mapSearchItemToResult(
    item: NextArrivalSearchItem,
  ): StopSearchResult | null {
    if (item.__typename === 'SearchBusStop') {
      const stop = item;
      const routes = stop.routes.map((route) => route.route_short_name);

      return {
        id: stop.stop_id,
        stopId: stop.stop_id,
        name: stop.stop_name,
        type: 'bus_stop',
        description: stop.stop_desc || undefined,
        latitude: stop.stop_lat,
        longitude: stop.stop_lon,
        liveTrainTrackingApiIds: [],
        lineCodes: [],
        routes,
        source: 'gtfs',
      };
    }

    if (item.__typename === 'SearchRailStation') {
      const station = item;
      const aliases = station.station_aliases || [];
      const lineCodes = getLineCodesFromColorNames(aliases);

      return {
        id: station.station_code || station.id,
        stopId: station.station_code || station.id,
        name: toTitleCase(
          getCanonicalRailStationName(station.station_name, lineCodes),
        ),
        type: 'subway_station',
        latitude: station.latitude || 0,
        longitude: station.longitude || 0,
        liveTrainTrackingApiIds: getLiveTrainTrackingApiIds(lineCodes),
        lineCodes,
        routes: aliases,
        source: 'gpkg',
      };
    }

    return null;
  }

  private mapNearbyStopToResult(stop: TypesenseStop): StopSearchResult | null {
    const result = mapTypesenseStopToTransitSearchResult(stop, {
      gpkgStationRequiresSubwayFlag: false,
      extractGtfsLineCodesFromName: true,
      inferGtfsSubwayStation: (candidate) =>
        this.isLikelySubwayStation(candidate.stop_name),
    });

    if (result?.type === 'bike_station') {
      return null;
    }

    return result ? { ...result, stopId: result.id } : null;
  }

  /**
   * Fetch route information for stop results using batched GraphQL query
   * Skips GPKG stations which already have line information
   */
  private fetchRoutesForStops(results: StopSearchResult[]): void {
    // Only fetch for GTFS stops, GPKG stations already have routes
    const gtfsResults = results.filter((r) => r.source !== 'gpkg');
    const stopIds = gtfsResults.map((r) => r.stopId);

    if (stopIds.length === 0) return;

    this.geographyService
      .getBatchRoutesForStops(stopIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (routeMap) => {
          const updatedResults = this.searchResults().map((result) => {
            // Don't update GPKG stations - they already have correct line names
            if (result.source === 'gpkg') {
              return result;
            }

            if (routeMap.has(result.stopId)) {
              const routes = routeMap.get(result.stopId) || [];
              // Update lineCodes from actual routes if available
              const extractedLineCodes =
                extractLineCodesFromRouteNames(routes);
              const existingLineCodes = result.lineCodes || [];
              const allLineCodes = [
                ...new Set([...existingLineCodes, ...extractedLineCodes]),
              ];
              const liveTrainTrackingApiIds =
                getLiveTrainTrackingApiIds(allLineCodes);

              return {
                ...result,
                routes,
                lineCodes: allLineCodes,
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

  /**
   * Fallback heuristic for detecting subway stations based on name
   * Used when is_subway_station field is not available
   */
  private isLikelySubwayStation(stopName: string): boolean {
    const lowerName = stopName.toLowerCase();
    return (
      lowerName.includes('metrô') ||
      lowerName.includes('metro') ||
      lowerName.includes('cptm') ||
      lowerName.includes('monotrilho') ||
      lowerName.includes('estação')
    );
  }

  private mergeSubwayStationResults(
    results: StopSearchResult[],
  ): StopSearchResult[] {
    const subwayStations = results.filter((r) => r.type === 'subway_station');
    const busStops = results.filter((r) => r.type === 'bus_stop');

    if (subwayStations.length === 0) {
      return results;
    }

    // Merge subway stations by name
    const mergedSubwayStations = mergeByStationName<StopSearchResult>(
      subwayStations,
      (station) => station.name,
      (stations) => {
        const base = stations[0];
        const allLineCodes = new Set<number>();
        const allRoutes = new Set<string>();

        stations.forEach((station) => {
          (station.lineCodes || []).forEach((code) => allLineCodes.add(code));
          station.routes?.forEach((route) => allRoutes.add(route));
        });

        const mergedLineCodes = Array.from(allLineCodes).sort((a, b) => a - b);

        return {
          ...base,
          name: normalizeStationName(base.name),
          lineCodes: mergedLineCodes,
          routes: Array.from(allRoutes).sort(),
          liveTrainTrackingApiIds: getLiveTrainTrackingApiIds(mergedLineCodes),
        };
      },
    );

    return [...mergedSubwayStations, ...busStops];
  }

  private sortResults(results: StopSearchResult[]): StopSearchResult[] {
    return results.sort((a, b) => {
      // Priority 1: live-tracked stations first
      const aHasLiveTrainTracking =
        (a.liveTrainTrackingApiIds?.length ?? 0) > 0;
      const bHasLiveTrainTracking =
        (b.liveTrainTrackingApiIds?.length ?? 0) > 0;
      if (aHasLiveTrainTracking && !bHasLiveTrainTracking) return -1;
      if (!aHasLiveTrainTracking && bHasLiveTrainTracking) return 1;

      // Priority 2: Subway stations before bus stops
      if (a.type === 'subway_station' && b.type !== 'subway_station') return -1;
      if (a.type !== 'subway_station' && b.type === 'subway_station') return 1;

      // Priority 3: Alphabetical
      return a.name.localeCompare(b.name);
    });
  }

  private readonly searchQueryDocument = `
    query StopSearch($input: SearchFiltersInput!) {
      search(input: $input) {
        __typename
        ... on SearchBusStop {
          id
          type
          score
          stop_id
          stop_name
          stop_desc
          stop_lat
          stop_lon
          routes {
            route_short_name
          }
          highlights {
            field
            snippet
          }
        }
        ... on SearchRailStation {
          id
          type
          score
          station_code
          station_name
          station_aliases
          latitude
          longitude
          highlights {
            field
            snippet
          }
        }
      }
    }
  `;
}

export interface NextArrivalComponentSearchResult {
  data?: {
    search: NextArrivalSearchItem[];
  };
}

interface NextArrivalSearchItemBase {
  __typename:
    | 'SearchBusStop'
    | 'SearchRailStation'
    | 'SearchBusRoute'
    | 'SearchRailLine'
    | 'SearchBikeStation';
  type: SearchTypes;
  score?: number | null;
  highlights?: {
    field: string;
    snippet: string;
  }[];
}

type NextArrivalSearchItem =
  | BusStopResult
  | RailStationResult
  | BusRouteResult
  | RailLineResult
  | BikeStationResult;

interface RailStationResult extends NextArrivalSearchItemBase {
  __typename: 'SearchRailStation';
  id: string;
  station_code: string;
  station_name: string;
  station_aliases?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface BusRouteResult extends NextArrivalSearchItemBase {
  __typename: 'SearchBusRoute';
  id: string;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
}

interface BusStopResult extends NextArrivalSearchItemBase {
  __typename: 'SearchBusStop';
  id: string;
  stop_id: string;
  stop_name: string;
  stop_desc: string | null;
  stop_lat: number;
  stop_lon: number;
  routes: {
    route_short_name: string;
  }[];
}

interface RailLineResult extends NextArrivalSearchItemBase {
  __typename: 'SearchRailLine';
  id: string;
  line_code: string;
  line_fullname: string;
  agency: string;
}

interface BikeStationResult extends NextArrivalSearchItemBase {
  __typename: 'SearchBikeStation';
  id: string;
  station_id: string;
  station_name: string;
  latitude: number;
  longitude: number;
}
