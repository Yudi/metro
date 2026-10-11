import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable,
  catchError,
  defer,
  finalize,
  map,
  of,
  shareReplay,
  tap,
} from 'rxjs';
import { LoggerService } from '@metro/shared/api';
import { SearchTypes } from '@metro/shared/utils';

import type {
  NearbyGraphQLResponse,
  NearbyStopsResponse,
  SearchGraphQLResult,
  SearchGraphQLResponse,
  TypesenseSearchResponse,
  TypesenseStop,
} from './typesense-search.types';
import {
  TYPESENSE_NEARBY_STOPS_QUERY,
  TYPESENSE_SEARCH_QUERY,
} from './typesense-search.queries';
import { mapTypesenseSearchResponse } from './typesense-search.mapper';

export type {
  NearbyStopsResponse,
  TypesenseRoute,
  TypesenseSearchResponse,
  TypesenseSearchResult,
  TypesenseStop,
} from './typesense-search.types';

const SEARCH_CACHE_TTL_MS = 30_000;
const SEARCH_CACHE_MAX_ENTRIES = 100;

interface CachedSearchResults {
  expiresAt: number;
  results: SearchGraphQLResult[];
}

@Service()
export class TypesenseSearchService {
  private http = inject(HttpClient);
  private logger = inject(LoggerService);
  private readonly searchCache = new Map<string, CachedSearchResults>();
  private readonly inFlightSearches = new Map<
    string,
    Observable<SearchGraphQLResult[]>
  >();
  private searchCacheGeneration = 0;

  /**
   * Search for routes and stops with typo tolerance
   */
  search(
    query: string,
    types: SearchTypes[] = [...SearchTypes],
  ): Observable<TypesenseSearchResponse> {
    return defer(() => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        return of({
          success: true,
          query: '',
          results: [],
          total: 0,
        });
      }

      const canonicalTypes = SearchTypes.filter((type) => types.includes(type));
      const cacheKey = JSON.stringify([trimmedQuery, canonicalTypes]);

      return this.getSearchResults(cacheKey, trimmedQuery, canonicalTypes).pipe(
        map((results) => mapTypesenseSearchResponse(query, results)),
        catchError((error) => {
          this.logger.error('Search error', error);
          return of({
            success: false,
            query,
            results: [],
            total: 0,
            message: 'Search failed',
          });
        }),
      );
    });
  }

  private getSearchResults(
    cacheKey: string,
    query: string,
    types: SearchTypes[],
  ): Observable<SearchGraphQLResult[]> {
    const cachedResults = this.getCachedSearchResults(cacheKey);
    if (cachedResults) return of(cachedResults);

    const existingSearch = this.inFlightSearches.get(cacheKey);
    if (existingSearch) return existingSearch;

    const generation = this.searchCacheGeneration;
    const sharedSearch = this.http
      .post<SearchGraphQLResponse>('/api/graphql', {
        query: TYPESENSE_SEARCH_QUERY,
        variables: {
          input: {
            query,
            includeBusRoutes: types.includes('busRoute'),
            includeBusStops: types.includes('busStop'),
            includeRailLines: types.includes('railLine'),
            includeRailStations: types.includes('railStation'),
            includeBikeStations: types.includes('bikeStation'),
          },
        },
      })
      .pipe(
        map((response) => {
          if (
            response.errors?.length ||
            !Array.isArray(response.data?.search)
          ) {
            throw new Error('Search failed');
          }

          return response.data.search;
        }),
        tap((results) => {
          if (generation === this.searchCacheGeneration) {
            this.cacheSearchResults(cacheKey, results);
          }
        }),
        finalize(() => {
          if (this.inFlightSearches.get(cacheKey) === sharedSearch) {
            this.inFlightSearches.delete(cacheKey);
          }
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );

    this.inFlightSearches.set(cacheKey, sharedSearch);
    return sharedSearch;
  }

  private getCachedSearchResults(
    cacheKey: string,
  ): SearchGraphQLResult[] | undefined {
    const cached = this.searchCache.get(cacheKey);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
      this.searchCache.delete(cacheKey);
      return undefined;
    }

    // Refresh insertion order so the map evicts the least recently used entry.
    this.searchCache.delete(cacheKey);
    this.searchCache.set(cacheKey, cached);
    return cached.results;
  }

  private cacheSearchResults(
    cacheKey: string,
    results: SearchGraphQLResult[],
  ): void {
    this.searchCache.delete(cacheKey);
    this.searchCache.set(cacheKey, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      results,
    });

    while (this.searchCache.size > SEARCH_CACHE_MAX_ENTRIES) {
      const oldestKey = this.searchCache.keys().next().value;
      if (oldestKey === undefined) return;
      this.searchCache.delete(oldestKey);
    }
  }

  private clearSearchCache(): void {
    this.searchCacheGeneration++;
    this.searchCache.clear();
    this.inFlightSearches.clear();
  }

  /**
   * Find nearby stops using geolocation
   */
  searchNearbyStops(
    latitude: number,
    longitude: number,
    radiusMeters = 1000,
  ): Observable<NearbyStopsResponse> {
    return this.http
      .post<NearbyGraphQLResponse>('/api/graphql', {
        query: TYPESENSE_NEARBY_STOPS_QUERY,
        variables: {
          input: {
            latitude,
            longitude,
            radiusMeters,
          },
        },
      })
      .pipe(
        map((response) => {
          if (
            response.errors?.length ||
            !Array.isArray(response.data?.nearbyStops)
          ) {
            throw new Error('Nearby search failed');
          }

          const mapped = mapTypesenseSearchResponse(
            '',
            response.data.nearbyStops,
          );
          const stops = mapped.results
            .filter((result) => result.type === 'stop')
            .map((result) => result.document as TypesenseStop);

          return {
            success: true,
            stops,
            center: { lat: latitude, lon: longitude },
            radius: radiusMeters,
          };
        }),
        catchError((error) => {
          this.logger.error('Nearby stops search error', error);
          return of({
            success: false,
            stops: [],
            center: { lat: latitude, lon: longitude },
            radius: radiusMeters,
            message: 'Nearby search failed',
          });
        }),
      );
  }

  /**
   * Trigger reindexing of all data in Typesense
   * This should be called when no search results are returned to rebuild the index
   */
  reindexData(): Observable<{ success: boolean; message: string }> {
    return this.http
      .post<{ data?: { reindexSearch?: boolean } }>('/api/graphql', {
        query: `
          mutation ReindexSearch {
            reindexSearch
          }
        `,
      })
      .pipe(
        map((response) => {
          const success = response.data?.reindexSearch === true;
          if (success) this.clearSearchCache();
          return {
            success,
            message: success
              ? 'Data reindexed successfully'
              : 'Reindexing failed',
          };
        }),
        catchError((error) => {
          this.logger.error('Reindex error', error);
          return of({
            success: false,
            message: 'Reindexing failed',
          });
        }),
      );
  }
}
