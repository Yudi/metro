import { processLiteSearchResults } from './lite-search-results';
import { LITE_SEARCH_QUERY, LITE_NEARBY_QUERY } from './lite-search.queries';
import type {
  LiteBikeAvailability,
  LiteSearchStop,
  LiteNextTrainsResult,
  NextTrainStationInfo,
  LiteRouteRailConnection,
  GraphQLResponse,
  SearchGraphQLResult,
  LiteScheduledBusDeparture,
  BikeStationsSummaryPayload,
} from './lite-search.types';
export type {
  LiteSearchResultKind,
  LiteBusRoute,
  LiteBikeAvailability,
  LiteSearchStop,
  LiteNextTrainArrival,
  LiteNextTrainsResult,
  NextTrainStationInfo,
  LiteRouteRailConnectionStation,
  LiteRouteRailConnectionDirection,
  LiteRouteRailConnection,
  LiteScheduledBusDeparture,
} from './lite-search.types';
import { Service, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { API_BASE_URL } from '@metro/shared/api';
import {
  ExtendedNextTrainLineCode,
  findNextTrainStations,
  hardNormalizeString,
  SpecialRailService,
} from '@metro/shared/utils';

/**
 * Minimal search service for lite frontend
 * Uses direct HTTP calls instead of complex dependencies
 */
@Service()
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
          query: LITE_SEARCH_QUERY,
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
        map((response) =>
          processLiteSearchResults(response.data?.search || []),
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
          query: LITE_NEARBY_QUERY,
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
          processLiteSearchResults(response.data?.nearbyStops || []),
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

  private enrichBikeStations(
    stops: LiteSearchStop[],
  ): Observable<LiteSearchStop[]> {
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

  private fetchBikeStationSummaries(): Observable<
    Map<string, LiteBikeAvailability>
  > {
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
          for (const station of response.data?.bikeStationsSummary?.stations ||
            []) {
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

    return [
      ...findNextTrainStations(stop.name, stop.lineCodes),
      ...specialStations,
    ];
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
      .post<
        GraphQLResponse<{ railSpecialServices: SpecialRailService[] }>
      >(`${this.baseUrl}/graphql`, { query })
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
  ): Observable<LiteNextTrainsResult> {
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
          scheduledServices {
            destinationCode
            destinationName
            originStationCode
            originStationName
            nextDepartureAt
            nextArrivalAt
            arrivalEstimated
            intervalLabel
            followingDepartures {
              departureAt
              arrivalAt
            }
          }
          headway {
            direction
            averageSeconds
            sampleCount
            bucket
            bucketLabel
            isFallback
          }
          operationClosed
          outOfSchedule
        }
      }
    `;

    return this.http
      .post<{
        data: {
          nextTrains: LiteNextTrainsResult | null;
        };
      }>(`${this.baseUrl}/graphql`, {
        query,
        variables: { lineCode, stationCode },
      })
      .pipe(
        map(
          (response) =>
            response.data?.nextTrains ?? {
              trains: [],
              scheduledServices: [],
            },
        ),
        catchError(() =>
          of({ trains: [], scheduledServices: [], hasError: true }),
        ),
      );
  }

  getRouteRailConnectionsForStop(
    stopId: string,
    routeIds: string[],
  ): Observable<LiteRouteRailConnection[]> {
    if (routeIds.length === 0) {
      return of([]);
    }

    const query = `
      query LiteRouteRailConnectionsForStop(
        $stopId: String!
        $routeIds: [String!]!
      ) {
        routeRailConnectionsForStop(
          stopId: $stopId
          routeIds: $routeIds
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
      .post<
        GraphQLResponse<{
          routeRailConnectionsForStop: LiteRouteRailConnection[];
        }>
      >(`${this.baseUrl}/graphql`, {
        query,
        variables: { stopId, routeIds },
      })
      .pipe(
        map((response) => response.data?.routeRailConnectionsForStop || []),
        catchError(() => of([])),
      );
  }

  getScheduledBusDepartures(
    stopId: string,
    limit = 5,
  ): Observable<LiteScheduledBusDeparture[]> {
    const query = `
      query LiteScheduledBusDepartures($stopId: String!, $limit: Int!) {
        scheduledBusDepartures(
          stopId: $stopId
          limit: $limit
          perRouteLimit: $limit
        ) {
          routeId
          routeShortName
          tripId
          headsign
          directionId
          departureTime
          sourceAgency
          platformCode
        }
      }
    `;

    return this.http
      .post<
        GraphQLResponse<{
          scheduledBusDepartures: LiteScheduledBusDeparture[];
        }>
      >(`${this.baseUrl}/graphql`, {
        query,
        variables: { stopId, limit },
      })
      .pipe(
        map((response) => response.data?.scheduledBusDepartures ?? []),
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
}
