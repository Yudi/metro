import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { API_BASE_URL } from '@metro/shared/api';
import {
  ExtendedNextTrainLineCode,
  findNextTrainStations,
  RAIL_LINES,
  hardNormalizeString,
  SpecialRailService,
} from '@metro/shared/utils';

/**
 * Minimal search result for lite version
 */
export type LiteSearchResultKind = 'busStop' | 'railStation' | 'bikeStation';

export interface LiteBusRoute {
  id: string;
  routeId: string;
  shortName: string;
  longName: string;
  routeType: number;
  color: string;
  textColor: string;
}

export interface LiteBikeAvailability {
  stationId: string;
  capacity: number | null;
  effectiveCapacity: number;
  numBikesAvailable: number;
  electricBikesAvailable: number;
}

export interface LiteSearchStop {
  id: string;
  kind: LiteSearchResultKind;
  stopId: string;
  name: string;
  isSubway: boolean;
  lineCodes: number[];
  latitude: number;
  longitude: number;
  /** Route short names for this stop (e.g., "METRÔ L1-AZUL") */
  routeShortNames?: string[];
  routes?: LiteBusRoute[];
  bikeAvailability?: LiteBikeAvailability;
  stationAliases?: string[];
  stationCode?: string;
}

/**
 * Next train arrival data
 */
export interface LiteNextTrainArrival {
  lineCode: string;
  stationCode: string;
  destinationCode: string;
  destinationName: string;
  arrivalTime: string;
  isAtPlatform: boolean;
}

/**
 * Station info for next train feature (L4/L8/L9)
 */
export interface NextTrainStationInfo {
  lineCode: ExtendedNextTrainLineCode;
  stationCode: string;
}

export interface LiteRouteRailConnectionStation {
  id: string;
  name: string;
  agencies: string[];
  lines: string[];
  distanceMeters: number;
  nearStopId: string;
  nearStopName: string;
  stopSequence: number;
}

export interface LiteRouteRailConnectionDirection {
  directionId: number;
  headsign: string;
  stations: LiteRouteRailConnectionStation[];
}

export interface LiteRouteRailConnection {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  directions: LiteRouteRailConnectionDirection[];
}

interface GraphQLResponse<T> {
  data?: T;
}

interface SearchGraphQLResult {
  __typename: string;
  id: string;
  type: LiteSearchResultKind;
  score?: number | null;
  stop_id?: string;
  stop_name?: string;
  stop_desc?: string | null;
  stop_lat?: number;
  stop_lon?: number;
  routes?: LiteBusRouteGraphQL[];
  station_code?: string;
  station_name?: string;
  station_aliases?: string[] | null;
  railLatitude?: number | null;
  railLongitude?: number | null;
  bikeLatitude?: number | null;
  bikeLongitude?: number | null;
  station_id?: string;
}

interface LiteBusRouteGraphQL {
  id: string;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color?: string | null;
  route_text_color?: string | null;
}

interface BikeStationsSummaryPayload {
  stations: LiteBikeAvailability[];
}

/**
 * Minimal search service for lite frontend
 * Uses direct HTTP calls instead of complex dependencies
 */
@Injectable({
  providedIn: 'root',
})
export class LiteSearchService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  // State for preserving between views
  readonly lastQuery = signal('');
  readonly lastResults = signal<LiteSearchStop[]>([]);
  readonly selectedStop = signal<LiteSearchStop | null>(null);
  readonly isLoading = signal(false);
  readonly isNearbyMode = signal(false);
  readonly specialRailServices = signal<SpecialRailService[]>([]);

  // Computed states
  readonly hasResults = computed(() => this.lastResults().length > 0);
  readonly hasSelection = computed(() => this.selectedStop() !== null);

  constructor() {
    this.fetchSpecialRailServices().subscribe();
  }

  /**
   * Search for stops
   */
  search(query: string): Observable<LiteSearchStop[]> {
    if (!query || query.trim().length < 2) {
      return of([]);
    }

    this.isLoading.set(true);
    this.lastQuery.set(query);
    this.isNearbyMode.set(false);

    return this.http
      .post<GraphQLResponse<{ search: SearchGraphQLResult[] }>>(
        `${this.baseUrl}/graphql`,
        {
          query: this.searchQuery,
          variables: {
            input: {
              query: query.trim(),
              includeBusRoutes: false,
              includeBusStops: true,
              includeRailLines: false,
              includeRailStations: true,
              includeBikeStations: true,
              limit: 20,
            },
          },
        },
      )
      .pipe(
        map((response) => this.processGraphQLResults(response.data?.search || [])),
        switchMap((stops) => this.enrichBikeStations(stops)),
        map((stops) => {
          this.lastResults.set(stops);
          this.isLoading.set(false);
          return stops;
        }),
        catchError(() => {
          this.isLoading.set(false);
          return of([]);
        }),
      );
  }

  /**
   * Search for nearby stops using geolocation
   */
  searchNearby(
    lat: number,
    lon: number,
    radius = 1000,
  ): Observable<LiteSearchStop[]> {
    this.isLoading.set(true);
    this.lastQuery.set('');
    this.isNearbyMode.set(true);

    return this.http
      .post<GraphQLResponse<{ nearbyStops: SearchGraphQLResult[] }>>(
        `${this.baseUrl}/graphql`,
        {
          query: this.nearbyQuery,
          variables: {
            input: {
              latitude: lat,
              longitude: lon,
              radiusMeters: radius,
              limit: 20,
            },
          },
        },
      )
      .pipe(
        map((response) =>
          this.processGraphQLResults(response.data?.nearbyStops || []),
        ),
        switchMap((stops) => this.enrichBikeStations(stops)),
        map((stops) => {
          this.lastResults.set(stops);
          this.isLoading.set(false);
          return stops;
        }),
        catchError(() => {
          this.isLoading.set(false);
          return of([]);
        }),
      );
  }

  private enrichBikeStations(stops: LiteSearchStop[]): Observable<LiteSearchStop[]> {
    const bikeStationIds = stops
      .filter((s) => s.kind === 'bikeStation')
      .map((s) => s.stopId);

    if (bikeStationIds.length === 0) {
      return of(stops);
    }

    return this.fetchBikeStationSummaries().pipe(
      map((summaryMap) =>
        stops.map((stop) => {
          if (stop.kind === 'bikeStation') {
            const bikeAvailability = summaryMap.get(stop.stopId);
            return bikeAvailability ? { ...stop, bikeAvailability } : stop;
          }
          return stop;
        }),
      ),
      catchError(() => of(stops)),
    );
  }

  private fetchBikeStationSummaries(): Observable<Map<string, LiteBikeAvailability>> {
    const query = `
      query LiteBikeStationsSummary {
        bikeStationsSummary {
          stations {
            stationId
            capacity
            effectiveCapacity
            numBikesAvailable
            electricBikesAvailable
          }
        }
      }
    `;

    return this.http
      .post<{
        data: {
          bikeStationsSummary: BikeStationsSummaryPayload;
        };
      }>(`${this.baseUrl}/graphql`, {
        query,
      })
      .pipe(
        map((response) => {
          const resultMap = new Map<string, LiteBikeAvailability>();
          for (const station of response.data?.bikeStationsSummary?.stations || []) {
            resultMap.set(station.stationId, station);
          }
          return resultMap;
        }),
        catchError(() => of(new Map())),
      );
  }

  /**
   * Get next-train station info for every supported line serving this station.
   */
  getNextTrainStations(stop: LiteSearchStop): NextTrainStationInfo[] {
    const normalizedName = hardNormalizeString(stop.name);
    const specialStations = this.specialRailServices().flatMap((service) => {
      const station = service.stations.find(
        (candidate) => hardNormalizeString(candidate.name) === normalizedName,
      );
      return station
        ? [{ lineCode: service.code, stationCode: station.stationCode }]
        : [];
    });

    return [...findNextTrainStations(stop.name, stop.lineCodes), ...specialStations];
  }

  private fetchSpecialRailServices(): Observable<SpecialRailService[]> {
    const query = `
      query LiteSpecialRailServices {
        railSpecialServices {
          code
          name
          colorHex
          textColorHex
          stations {
            stationCode
            name
            latitude
            longitude
          }
        }
      }
    `;

    return this.http
      .post<GraphQLResponse<{ railSpecialServices: SpecialRailService[] }>>(
        `${this.baseUrl}/graphql`,
        { query },
      )
      .pipe(
        map((response) => response.data?.railSpecialServices ?? []),
        map((services) => {
          this.specialRailServices.set(services);
          return services;
        }),
        catchError(() => of([])),
      );
  }

  resolveNextTrainStations(
    stop: LiteSearchStop,
  ): Observable<NextTrainStationInfo[]> {
    return of(
      this.getNextTrainStations(stop).filter(
        (station) => station.stationCode !== '',
      ),
    );
  }

  /**
   * Fetch next train arrivals for a station via GraphQL
   */
  getNextTrains(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ): Observable<LiteNextTrainArrival[]> {
    const query = `
      query GetNextTrains($lineCode: String!, $stationCode: String!) {
        nextTrains(lineCode: $lineCode, stationCode: $stationCode) {
          trains {
            lineCode
            stationCode
            destinationCode
            destinationName
            arrivalTime
            isAtPlatform
          }
        }
      }
    `;

    return this.http
      .post<{
        data: {
          nextTrains: { trains: LiteNextTrainArrival[] } | null;
        };
      }>(`${this.baseUrl}/graphql`, {
        query,
        variables: { lineCode, stationCode },
      })
      .pipe(
        map((response) => response.data?.nextTrains?.trains || []),
        catchError(() => of([])),
      );
  }

  getRouteRailConnectionsForStop(
    stopId: string,
    routeIds: string[],
    radiusMeters = 150,
  ): Observable<LiteRouteRailConnection[]> {
    if (routeIds.length === 0) {
      return of([]);
    }

    const query = `
      query LiteRouteRailConnectionsForStop(
        $stopId: String!
        $routeIds: [String!]!
        $radiusMeters: Float
      ) {
        routeRailConnectionsForStop(
          stopId: $stopId
          routeIds: $routeIds
          radiusMeters: $radiusMeters
        ) {
          routeId
          routeShortName
          routeLongName
          directions {
            directionId
            headsign
            stations {
              id
              name
              agencies
              lines
              distanceMeters
              nearStopId
              nearStopName
              stopSequence
            }
          }
        }
      }
    `;

    return this.http
      .post<GraphQLResponse<{ routeRailConnectionsForStop: LiteRouteRailConnection[] }>>(
        `${this.baseUrl}/graphql`,
        {
          query,
          variables: { stopId, routeIds, radiusMeters },
        },
      )
      .pipe(
        map((response) => response.data?.routeRailConnectionsForStop || []),
        catchError(() => of([])),
      );
  }

  /**
   * Select a stop for detail view
   */
  selectStop(stop: LiteSearchStop): void {
    this.selectedStop.set(stop);
  }

  /**
   * Clear selection (back button)
   */
  clearSelection(): void {
    this.selectedStop.set(null);
  }

  /**
   * Clear all state
   */
  clearAll(): void {
    this.lastQuery.set('');
    this.lastResults.set([]);
    this.selectedStop.set(null);
  }

  private processGraphQLResults(
    rawResults: SearchGraphQLResult[],
  ): LiteSearchStop[] {
    const results: LiteSearchStop[] = [];

    for (const result of rawResults) {
      if (result.type === 'busStop') {
        results.push({
          id: result.id,
          kind: 'busStop',
          stopId: result.stop_id || result.id,
          name: result.stop_name || '',
          isSubway: false,
          lineCodes: [],
          latitude: result.stop_lat || 0,
          longitude: result.stop_lon || 0,
          routes: (result.routes || []).map((route) => ({
            id: route.id,
            routeId: route.route_id,
            shortName: route.route_short_name,
            longName: route.route_long_name,
            routeType: route.route_type,
            color: route.route_color || '2563eb',
            textColor: route.route_text_color || 'ffffff',
          })),
        });
        continue;
      }

      if (result.type === 'railStation') {
        const name = result.station_name || '';
        const aliases = result.station_aliases || [];
        results.push({
          id: result.id,
          kind: 'railStation',
          stopId: result.station_code || result.id,
          name,
          isSubway: true,
          lineCodes: this.getRailStationLineCodes(name, aliases),
          latitude: result.railLatitude || 0,
          longitude: result.railLongitude || 0,
          stationAliases: aliases,
          stationCode: result.station_code,
        });
        continue;
      }

      if (result.type === 'bikeStation') {
        results.push({
          id: result.id,
          kind: 'bikeStation',
          stopId: result.station_id || result.id,
          name: result.station_name || '',
          isSubway: false,
          lineCodes: [],
          latitude: result.bikeLatitude || 0,
          longitude: result.bikeLongitude || 0,
        });
      }
    }

    return results;
  }

  private getRailStationLineCodes(name: string, aliases: string[]): number[] {
    const candidates = [name, ...aliases].map((candidate) =>
      this.normalizeStationName(candidate),
    );
    const codes = new Set<number>();

    for (const line of RAIL_LINES) {
      if (
        line.stations.some((station) =>
          candidates.includes(this.normalizeStationName(station.name)),
        )
      ) {
        codes.add(line.code);
      }
    }

    return Array.from(codes).sort((a, b) => a - b);
  }

  private normalizeStationName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*\(linha\s*\d+\)\s*/gi, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toUpperCase();
  }

  private readonly searchQuery = `
    query LiteSearch($input: SearchFiltersInput!) {
      search(input: $input) {
        __typename
        ... on SearchBusStop {
          id
          type
          stop_id
          stop_name
          stop_lat
          stop_lon
          routes {
            id
            route_id
            route_short_name
            route_long_name
            route_type
            route_color
            route_text_color
          }
        }
        ... on SearchRailStation {
          id
          type
          station_code
          station_name
          station_aliases
          railLatitude: latitude
          railLongitude: longitude
        }
        ... on SearchBikeStation {
          id
          type
          station_id
          station_name
          bikeLatitude: latitude
          bikeLongitude: longitude
        }
      }
    }
  `;

  private readonly nearbyQuery = `
    query LiteNearbyStops($input: NearbyStopsInput!) {
      nearbyStops(input: $input) {
        __typename
        ... on SearchBusStop {
          id
          type
          stop_id
          stop_name
          stop_lat
          stop_lon
          routes {
            id
            route_id
            route_short_name
            route_long_name
            route_type
            route_color
            route_text_color
          }
        }
        ... on SearchRailStation {
          id
          type
          station_code
          station_name
          station_aliases
          railLatitude: latitude
          railLongitude: longitude
        }
        ... on SearchBikeStation {
          id
          type
          station_id
          station_name
          bikeLatitude: latitude
          bikeLongitude: longitude
        }
      }
    }
  `;
}
