import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { LoggerService } from '@metro/shared/api';
import { SearchTypes } from '@metro/shared/utils';

import type {
  NearbyGraphQLResponse,
  NearbyStopsResponse,
  SearchGraphQLResponse,
  TypesenseRoute,
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

@Service()
export class TypesenseSearchService {
  private http = inject(HttpClient);
  private logger = inject(LoggerService);

  /**
   * Search for routes and stops with typo tolerance
   */
  search(
    query: string,
    types: SearchTypes[] = [...SearchTypes],
  ): Observable<TypesenseSearchResponse> {
    if (!query || query.trim().length < 1) {
      return of({
        success: true,
        query: '',
        results: [],
        total: 0,
      });
    }

    return this.http
      .post<SearchGraphQLResponse>('/api/graphql', {
        query: TYPESENSE_SEARCH_QUERY,
        variables: {
          input: {
            query: query.trim(),
            includeBusRoutes: types.includes('busRoute'),
            includeBusStops: types.includes('busStop'),
            includeRailLines: types.includes('railLine'),
            includeRailStations: types.includes('railStation'),
            includeBikeStations: types.includes('bikeStation'),
          },
        },
      })
      .pipe(
        map((response) =>
          mapTypesenseSearchResponse(query, response.data?.search || []),
        ),
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
          const mapped = mapTypesenseSearchResponse(
            '',
            response.data?.nearbyStops || [],
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
   * Get route details by ID using GraphQL (for detailed information)
   * This can be used when you need more detailed route information like trips, schedules, etc.
   */
  getRouteDetails(routeId: string): Observable<TypesenseRoute | null> {
    // TODO: Integrate with GraphQL SearchService.getRouteDetails() when needed
    // For now, return the basic route info from Typesense search results
    this.logger.debug('Route details requested for:', routeId);
    return of(null);
  }

  /**
   * Get stop details by ID using GraphQL (for detailed information)
   * This can be used when you need more detailed stop information like stop times, routes, etc.
   */
  getStopDetails(stopId: string): Observable<TypesenseStop | null> {
    // TODO: Integrate with GraphQL SearchService.getStopDetails() when needed
    // For now, return the basic stop info from Typesense search results
    this.logger.debug('Stop details requested for:', stopId);
    return of(null);
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
