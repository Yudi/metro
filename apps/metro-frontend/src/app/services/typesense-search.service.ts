import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { LoggerService } from '@metro/shared/api';
import {
  SearchTypes,
  getLineCodeByColorName,
  getRailLineByCode,
} from '@metro/shared/utils';

// Types for Typesense search responses
export interface TypesenseRoute {
  id: string;
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
  source?: 'gtfs' | 'rail'; // Data source: GTFS (bus) or static rail
}

export interface TypesenseStop {
  id: string;
  stop_id: string;
  stop_name: string;
  stop_desc?: string;
  stop_lat: number;
  stop_lon: number;
  is_subway_station?: boolean;
  source?: 'gtfs' | 'gpkg' | 'bike'; // Data source: GTFS, GeoSampa rail, or GBFS bike
}

export interface TypesenseSearchResult {
  type: 'route' | 'stop';
  document: TypesenseRoute | TypesenseStop;
  highlights?: Record<string, string[]>;
  text_match?: number;
}

export interface TypesenseSearchResponse {
  success: boolean;
  query: string;
  results: TypesenseSearchResult[];
  total: number;
  message?: string;
}

interface SearchHighlightResult {
  field: string;
  snippet: string;
}

interface SearchGraphQLResultBase {
  __typename:
    | 'SearchBusRoute'
    | 'SearchBusStop'
    | 'SearchRailLine'
    | 'SearchRailStation'
    | 'SearchBikeStation';
  type: SearchTypes;
  score?: number | null;
  highlights?: SearchHighlightResult[] | null;
}

interface SearchGraphQLBusRoute extends SearchGraphQLResultBase, TypesenseRoute {
  __typename: 'SearchBusRoute';
}

interface SearchGraphQLBusStop extends SearchGraphQLResultBase {
  __typename: 'SearchBusStop';
  id: string;
  stop_id: string;
  stop_name: string;
  stop_desc?: string | null;
  stop_lat: number;
  stop_lon: number;
  routes?: SearchGraphQLBusRoute[] | null;
}

interface SearchGraphQLRailLine extends SearchGraphQLResultBase {
  __typename: 'SearchRailLine';
  id: string;
  line_code: string;
  line_fullname: string;
  agency: string;
}

interface SearchGraphQLRailStation extends SearchGraphQLResultBase {
  __typename: 'SearchRailStation';
  id: string;
  station_code: string;
  station_name: string;
  station_aliases?: string[] | null;
  railLatitude?: number | null;
  railLongitude?: number | null;
}

interface SearchGraphQLBikeStation extends SearchGraphQLResultBase {
  __typename: 'SearchBikeStation';
  id: string;
  station_id: string;
  station_name: string;
  bikeLatitude: number;
  bikeLongitude: number;
}

type SearchGraphQLResult =
  | SearchGraphQLBusRoute
  | SearchGraphQLBusStop
  | SearchGraphQLRailLine
  | SearchGraphQLRailStation
  | SearchGraphQLBikeStation;

interface SearchGraphQLResponse {
  data?: {
    search?: SearchGraphQLResult[];
  };
}

interface NearbyGraphQLResponse {
  data?: {
    nearbyStops?: SearchGraphQLResult[];
  };
}

export interface NearbyStopsResponse {
  success: boolean;
  stops: TypesenseStop[];
  center: { lat: number; lon: number };
  radius: number;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
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
        query: this.searchQuery,
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
        map((response) => this.mapSearchResponse(query, response.data?.search || [])),
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

  private mapSearchResponse(
    query: string,
    results: SearchGraphQLResult[],
  ): TypesenseSearchResponse {
    const mappedResults = results
      .map((result): TypesenseSearchResult | null => {
        const highlights = this.mapHighlights(result.highlights);
        const text_match = result.score ?? undefined;

        if (result.__typename === 'SearchBusRoute') {
          return {
            type: 'route',
            document: {
              id: result.route_id,
              route_id: result.route_id,
              agency_id: '',
              route_short_name: result.route_short_name,
              route_long_name: result.route_long_name,
              route_type: result.route_type,
              route_color: result.route_color || '',
              route_text_color: result.route_text_color || '',
              source: 'gtfs',
            },
            highlights,
            text_match,
          };
        }

        if (result.__typename === 'SearchBusStop') {
          return {
            type: 'stop',
            document: {
              id: result.stop_id,
              stop_id: result.stop_id,
              stop_name: result.stop_name,
              stop_desc: result.stop_desc || undefined,
              stop_lat: result.stop_lat,
              stop_lon: result.stop_lon,
              is_subway_station: false,
              source: 'gtfs',
            },
            highlights,
            text_match,
          };
        }

        if (result.__typename === 'SearchRailLine') {
          const lineCode = this.normalizeRailLineCode(result.line_code);

          return {
            type: 'route',
            document: {
              id: lineCode,
              route_id: lineCode,
              agency_id: result.agency,
              route_short_name: lineCode,
              route_long_name: result.line_fullname,
              route_type: 2,
              route_color: '',
              route_text_color: '',
              source: 'rail',
            },
            highlights,
            text_match,
          };
        }

        if (result.__typename === 'SearchRailStation') {
          const aliases = result.station_aliases || [];
          const lineNames = this.getRailLineNamesFromAliases(aliases);

          return {
            type: 'stop',
            document: {
              id: result.station_code,
              stop_id: result.station_code,
              stop_name: result.station_name,
              stop_desc:
                lineNames.length > 0
                  ? `GeoSampa - ${lineNames.join(', ')}`
                  : undefined,
              stop_lat: result.railLatitude || 0,
              stop_lon: result.railLongitude || 0,
              is_subway_station: true,
              source: 'gpkg',
            },
            highlights,
            text_match,
          };
        }

        if (result.__typename === 'SearchBikeStation') {
          return {
            type: 'stop',
            document: {
              id: result.station_id,
              stop_id: result.station_id,
              stop_name: result.station_name,
              stop_lat: result.bikeLatitude,
              stop_lon: result.bikeLongitude,
              source: 'bike',
            },
            highlights,
            text_match,
          };
        }

        return null;
      })
      .filter((result): result is TypesenseSearchResult => result !== null);

    return {
      success: true,
      query,
      results: mappedResults,
      total: mappedResults.length,
    };
  }

  private normalizeRailLineCode(lineCode: string): string {
    const match = lineCode.match(/\d+/);
    if (!match) {
      return lineCode;
    }

    return `L${parseInt(match[0], 10)}`;
  }

  private getRailLineNamesFromAliases(aliases: string[]): string[] {
    const codes = new Set<number>();

    for (const alias of aliases) {
      const code = getLineCodeByColorName(alias);
      if (code !== undefined) {
        codes.add(code);
      }
    }

    return Array.from(codes)
      .sort((a, b) => a - b)
      .map((code) => getRailLineByCode(code)?.colorName)
      .filter((lineName): lineName is string => lineName !== undefined);
  }

  private mapHighlights(
    highlights?: SearchHighlightResult[] | null,
  ): Record<string, string[]> | undefined {
    if (!highlights?.length) {
      return undefined;
    }

    return highlights.reduce<Record<string, string[]>>((acc, highlight) => {
      acc[highlight.field] = [...(acc[highlight.field] || []), highlight.snippet];
      return acc;
    }, {});
  }

  private readonly searchQuery = `
    query Search($input: SearchFiltersInput!) {
      search(input: $input) {
        __typename
        ... on SearchBusRoute {
          id
          type
          score
          route_id
          route_short_name
          route_long_name
          route_type
          route_color
          route_text_color
          highlights {
            field
            snippet
          }
        }
        ... on SearchBusStop {
          id
          type
          score
          stop_id
          stop_name
          stop_desc
          stop_lat
          stop_lon
          highlights {
            field
            snippet
          }
        }
        ... on SearchRailLine {
          id
          type
          score
          line_code
          line_fullname
          agency
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
          railLatitude: latitude
          railLongitude: longitude
          highlights {
            field
            snippet
          }
        }
        ... on SearchBikeStation {
          id
          type
          score
          station_id
          station_name
          bikeLatitude: latitude
          bikeLongitude: longitude
          highlights {
            field
            snippet
          }
        }
      }
    }
  `;

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
        query: this.nearbyStopsQuery,
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
          const mapped = this.mapSearchResponse(
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

  private readonly nearbyStopsQuery = `
    query NearbyStops($input: NearbyStopsInput!) {
      nearbyStops(input: $input) {
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
          railLatitude: latitude
          railLongitude: longitude
          highlights {
            field
            snippet
          }
        }
        ... on SearchBikeStation {
          id
          type
          score
          station_id
          station_name
          bikeLatitude: latitude
          bikeLongitude: longitude
          highlights {
            field
            snippet
          }
        }
      }
    }
  `;

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
