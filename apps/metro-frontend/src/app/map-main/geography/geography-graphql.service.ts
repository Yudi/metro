import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, defer, of } from 'rxjs';
import { finalize, map, shareReplay } from 'rxjs/operators';
import { IncrementalGraphqlClient } from '@metro/shared/api';
import type { GraphqlResponseError } from '@metro/shared/api';
import type { MapFeature } from '../components/map/map-service.types';
import type {
  BoundingBox,
  BusRouteGraphQL,
  BusShapeGraphQL,
  BusStopGraphQL,
  RouteFullDataGraphQL,
  RouteRailConnectionGraphQL,
  ScheduledBusDepartureGraphQL,
  StopSearchInput,
  TripGraphQL,
} from './geography-graphql.types';
import {
  convertToBusRoute,
  convertToBusShape,
  convertToBusStop,
} from './geography-graphql.mapper';
import { isBusDirectionFavorite, isBusLineFavorite, parseRailLineCode } from '@metro/shared/utils';
import { ROUTE_FIELDS, STOP_FIELDS } from './geography-graphql.queries';

export type {
  BoundingBox,
  BusRouteGraphQL,
  BusShapeGraphQL,
  BusStopGraphQL,
  RouteFullDataGraphQL,
  RouteRailConnectionDirectionGraphQL,
  RouteRailConnectionGraphQL,
  RouteRailConnectionStationGraphQL,
  ScheduledBusDepartureGraphQL,
  StopSearchInput,
  TripGraphQL,
} from './geography-graphql.types';

export interface StopFullDataSnapshot {
  stop: BusStopGraphQL | null;
  routes?: readonly RouteFullDataGraphQL[] | null;
  hasNext: boolean;
  errors?: readonly GraphqlResponseError[];
}

@Service()
export class GeographyGraphQLService {
  private http = inject(HttpClient);
  private incrementalGraphqlClient = inject(IncrementalGraphqlClient);
  private readonly graphqlEndpoint = '/api/graphql';
  private readonly stopFullDataRequests = new Map<
    string,
    Observable<StopFullDataSnapshot>
  >();

  // State management
  private busStopsSubject = new BehaviorSubject<BusStopGraphQL[]>([]);
  private busRoutesSubject = new BehaviorSubject<BusRouteGraphQL[]>([]);
  private busShapesSubject = new BehaviorSubject<BusShapeGraphQL[]>([]);

  readonly busStops$ = this.busStopsSubject.asObservable();
  readonly busRoutes$ = this.busRoutesSubject.asObservable();
  readonly busShapes$ = this.busShapesSubject.asObservable();

  private executeGraphQL<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Observable<T> {
    return this.http
      .post<{ data: T }>(this.graphqlEndpoint, {
        query,
        variables,
      })
      .pipe(map((response) => response.data));
  }

  // Bus Stops
  getAllBusStops(): Observable<BusStopGraphQL[]> {
    const query = `
      query GetAllBusStops {
        busStops {
          ${STOP_FIELDS}
        }
      }
    `;

    return this.executeGraphQL<{ busStops: BusStopGraphQL[] }>(query).pipe(
      map((data) => {
        this.busStopsSubject.next(data.busStops);
        return data.busStops;
      }),
    );
  }

  getBusStopsInBounds(bounds: BoundingBox): Observable<BusStopGraphQL[]> {
    const query = `
      query GetBusStopsInBounds($bounds: BoundingBoxInput!) {
        busStopsInBounds(bounds: $bounds) {
          ${STOP_FIELDS}
        }
      }
    `;

    return this.executeGraphQL<{ busStopsInBounds: BusStopGraphQL[] }>(query, {
      bounds,
    }).pipe(map((data) => data.busStopsInBounds));
  }

  searchBusStops(input?: StopSearchInput): Observable<BusStopGraphQL[]> {
    const query = `
      query SearchBusStops($input: StopSearchInput) {
        searchBusStops(input: $input) {
          ${STOP_FIELDS}
        }
      }
    `;

    return this.executeGraphQL<{ searchBusStops: BusStopGraphQL[] }>(query, {
      input,
    }).pipe(map((data) => data.searchBusStops));
  }

  getBusStop(id: string): Observable<BusStopGraphQL | null> {
    const query = `
      query GetBusStop($id: ID!) {
        busStop(id: $id) {
          ${STOP_FIELDS}
        }
      }
    `;

    return this.executeGraphQL<{ busStop: BusStopGraphQL | null }>(query, {
      id,
    }).pipe(map((data) => data.busStop));
  }

  /** Only two server-calculated corners are needed to frame the complete route. */
  getRouteFocusCoordinates(routeId: string): Observable<[number, number][]> {
    return this.executeGraphQL<{ routeBounds: BoundingBox | null }>(`
      query RouteFocusBounds($routeId: String!) {
        routeBounds(routeId: $routeId) {
          minLng minLat maxLng maxLat
        }
      }
    `, { routeId }).pipe(map((data) => {
      const bounds = data.routeBounds;
      return bounds ? [
        [bounds.minLng, bounds.minLat] as [number, number],
        [bounds.maxLng, bounds.maxLat] as [number, number],
      ] : [];
    }));
  }

  /** Station bounds can frame a rail line even when its tiles are offscreen. */
  getRailLineFocusCoordinates(lineId: string): Observable<[number, number][]> {
    const lineCode = parseRailLineCode(lineId);
    if (lineCode === undefined) return of([]);
    return this.executeGraphQL<{ railStations: {
      lines: string[] | null;
      latitude: number;
      longitude: number;
    }[] }>(`
      query RailLineFocusCoordinates {
        railStations { lines latitude longitude }
      }
    `).pipe(map((data) => data.railStations
      .filter((station) => station.lines?.some((line) => parseRailLineCode(line) === lineCode))
      .map((station) => [station.longitude, station.latitude] as [number, number]),
    ));
  }

  // Bus Routes
  getAllBusRoutes(): Observable<BusRouteGraphQL[]> {
    const query = `
      query GetAllBusRoutes {
        busRoutes {
          id
          routeId
          shortName
          longName
          color
          textColor
          sourceAgency
          sourceId
          supportsRealtime
          fares {
            price
            currency
          }
        }
      }
    `;

    return this.executeGraphQL<{ busRoutes: BusRouteGraphQL[] }>(query).pipe(
      map((data) => {
        this.busRoutesSubject.next(data.busRoutes);
        return data.busRoutes;
      }),
    );
  }

  getBusRouteDirections(ids: string[], stopId?: string): Observable<BusRouteGraphQL[]> {
    return this.executeGraphQL<{ busRouteDirections: BusRouteGraphQL[] }>(`
      query BusRouteDirections($ids: [ID!]!, $stopId: ID) {
        busRouteDirections(ids: $ids, stopId: $stopId) { ${ROUTE_FIELDS} }
      }
    `, { ids, stopId }).pipe(map((data) => data.busRouteDirections));
  }

  getFavoriteBusDirections(codes: string[]): Observable<BusRouteGraphQL[]> {
    return this.executeGraphQL<{ favoriteBusDirections: BusRouteGraphQL[] }>(`
      query FavoriteBusDirections($codes: [String!]!) {
        favoriteBusDirections(codes: $codes) { ${ROUTE_FIELDS} }
      }
    `, { codes }).pipe(map((data) => data.favoriteBusDirections));
  }

  getBusRoute(id: string): Observable<BusRouteGraphQL | null> {
    if (isBusDirectionFavorite(id) || isBusLineFavorite(id)) {
      return this.getFavoriteBusDirections([id]).pipe(map((directions) => {
        const route = directions[0];
        if (!route) return null;
        return isBusLineFavorite(id) ? {
          ...route,
          favoriteCode: id,
          destination: directions.length === 1 ? route.destination : undefined,
          directionId: directions.length === 1 ? route.directionId : undefined,
        } : route;
      }));
    }
    const query = `
      query GetBusRoute($id: ID!) {
        busRoute(id: $id) {
          id
          routeId
          shortName
          longName
          color
          textColor
          sourceAgency
          sourceId
          supportsRealtime
          fares {
            price
            currency
          }
        }
      }
    `;

    return this.executeGraphQL<{ busRoute: BusRouteGraphQL | null }>(query, {
      id,
    }).pipe(map((data) => data.busRoute));
  }

  // Bus Shapes
  getAllBusShapes(): Observable<BusShapeGraphQL[]> {
    const query = `
      query GetAllBusShapes {
        busShapes {
          id
          shapeId
          geometry {
            type
            coordinates
          }
        }
      }
    `;

    return this.executeGraphQL<{ busShapes: BusShapeGraphQL[] }>(query).pipe(
      map((data) => {
        this.busShapesSubject.next(data.busShapes);
        return data.busShapes;
      }),
    );
  }

  getBusShape(shapeId: string): Observable<BusShapeGraphQL | null> {
    const query = `
      query GetBusShape($shapeId: String!) {
        busShape(shapeId: $shapeId) {
          id
          shapeId
          geometry {
            type
            coordinates
          }
        }
      }
    `;

    return this.executeGraphQL<{ busShape: BusShapeGraphQL | null }>(query, {
      shapeId,
    }).pipe(map((data) => data.busShape));
  }

  // Trips
  getTripsForRoute(routeId: string): Observable<TripGraphQL[]> {
    const query = `
      query GetTripsForRoute($routeId: String!) {
        tripsForRoute(routeId: $routeId) {
          id
          routeId
          serviceId
          tripId
          tripHeadsign
          directionId
          shapeId
        }
      }
    `;

    return this.executeGraphQL<{ tripsForRoute: TripGraphQL[] }>(query, {
      routeId,
    }).pipe(map((data) => data.tripsForRoute));
  }

  // Utility methods
  getStopsBounds(): Observable<BoundingBox | null> {
    const query = `
      query GetStopsBounds {
        stopsBounds {
          minLat
          maxLat
          minLng
          maxLng
        }
      }
    `;

    return this.executeGraphQL<{ stopsBounds: BoundingBox | null }>(query).pipe(
      map((data) => data.stopsBounds),
    );
  }

  // Get stops for a specific route
  getStopsForRoute(routeId: string): Observable<BusStopGraphQL[]> {
    const query = `
      query GetStopsForRoute($routeId: String!) {
        stopsForRoute(routeId: $routeId) {
          ${STOP_FIELDS}
        }
      }
    `;

    return this.executeGraphQL<{ stopsForRoute: BusStopGraphQL[] }>(query, {
      routeId,
    }).pipe(map((data) => data?.stopsForRoute || []));
  }

  // Get routes for a specific stop
  getRoutesForStop(stopId: string): Observable<BusRouteGraphQL[]> {
    return this.executeGraphQL<{ busStopDirections: BusRouteGraphQL[] }>(`
      query GetRoutesForStop($stopId: ID!) {
        busStopDirections(stopId: $stopId) { ${ROUTE_FIELDS} }
      }
    `, { stopId }).pipe(map((data) => data.busStopDirections));
  }

  // Batch get route short names for multiple stops - single network request
  getBatchRoutesForStops(stopIds: string[]): Observable<Map<string, string[]>> {
    if (stopIds.length === 0) {
      return of(new Map());
    }

    const query = `
      query GetBatchRoutesForStops($stopIds: [String!]!) {
        batchRoutesForStops(stopIds: $stopIds) {
          stopId
          routeShortNames
        }
      }
    `;

    return this.executeGraphQL<{
      batchRoutesForStops: Array<{ stopId: string; routeShortNames: string[] }>;
    }>(query, { stopIds }).pipe(
      map((data) => {
        const resultMap = new Map<string, string[]>();
        for (const item of data?.batchRoutesForStops || []) {
          resultMap.set(item.stopId, item.routeShortNames);
        }
        return resultMap;
      }),
    );
  }

  /**
   * Get complete route data (route info, trips, shapes, stops) in a single request.
   * Use this instead of separate getTripsForRoute, getBusShape, getStopsForRoute calls.
   */
  getRouteFullData(routeId: string): Observable<RouteFullDataGraphQL | null> {
    if (isBusDirectionFavorite(routeId) || isBusLineFavorite(routeId)) {
      return this.getBusRoute(routeId).pipe(map((route) => route ? { route } : null));
    }
    const query = `
      query GetRouteFullData($routeId: String!) {
        routeFullData(routeId: $routeId) {
          route {
            ${ROUTE_FIELDS}
          }
        }
      }
    `;

    return this.executeGraphQL<{ routeFullData: RouteFullDataGraphQL | null }>(
      query,
      { routeId },
    ).pipe(map((data) => data?.routeFullData || null));
  }

  /** Emits the stop first, then its related routes from the same query. */
  watchStopFullData(stopId: string): Observable<StopFullDataSnapshot> {
    return defer(() => {
      const activeRequest = this.stopFullDataRequests.get(stopId);
      if (activeRequest) {
        return activeRequest;
      }

      const query = `
        query GetStopFullData($stopId: String!) {
          stopFullData(stopId: $stopId) {
            stop {
              ${STOP_FIELDS}
            }
            ... @defer(label: "stopRoutes") {
              routes {
                route {
                  ${ROUTE_FIELDS}
                }
              }
            }
          }
        }
      `;

      const sharedRequest = this.incrementalGraphqlClient
        .query<{
          stopFullData?: {
            stop?: BusStopGraphQL | null;
            routes?: RouteFullDataGraphQL[] | null;
          } | null;
        }>(query, { stopId })
        .pipe(
          map((result) => {
            const stopFullData = result.data?.stopFullData;
            return {
              stop: stopFullData?.stop ?? null,
              ...(stopFullData && 'routes' in stopFullData
                ? { routes: stopFullData.routes ?? [] }
                : {}),
              hasNext: result.hasNext,
              ...(result.errors ? { errors: result.errors } : {}),
            };
          }),
          finalize(() => {
            if (this.stopFullDataRequests.get(stopId) === sharedRequest) {
              this.stopFullDataRequests.delete(stopId);
            }
          }),
          shareReplay({ bufferSize: 1, refCount: true }),
        );
      this.stopFullDataRequests.set(stopId, sharedRequest);
      return sharedRequest;
    });
  }

  getRouteRailConnectionsForStop(
    stopId: string,
    routeIds: string[],
  ): Observable<RouteRailConnectionGraphQL[]> {
    if (routeIds.length === 0) {
      return of([]);
    }

    const query = `
      query GetRouteRailConnectionsForStop(
        $stopId: String!
        $routeIds: [String!]!
      ) {
        routeRailConnectionsForStop(
          stopId: $stopId
          routeIds: $routeIds
        ) {
          routeId
          routeShortName
          directions {
            directionId
            headsign
            stations {
              id
              name
              lines
              distanceMeters
              stopsUntil
            }
          }
        }
      }
    `;

    return this.executeGraphQL<{
      routeRailConnectionsForStop: RouteRailConnectionGraphQL[];
    }>(query, {
      stopId,
      routeIds,
    }).pipe(map((data) => data?.routeRailConnectionsForStop || []));
  }

  getScheduledBusDepartures(
    stopId: string,
    limit = 5,
  ): Observable<ScheduledBusDepartureGraphQL[]> {
    const query = `
      query ScheduledBusDepartures($stopId: String!, $limit: Int!) {
        scheduledBusDepartures(stopId: $stopId, perRouteLimit: $limit) {
          routeId
          routeShortName
          tripId
          headsign
          directionId
          departureTime
          platformCode
        }
      }
    `;

    return this.executeGraphQL<{
      scheduledBusDepartures: ScheduledBusDepartureGraphQL[];
    }>(query, { stopId, limit }).pipe(
      map((data) => data?.scheduledBusDepartures || []),
    );
  }

  // Convert from backend format to map service format
  convertToBusStop(graphqlStop: BusStopGraphQL): MapFeature {
    return convertToBusStop(graphqlStop);
  }

  convertToBusRoute(graphqlRoute: BusRouteGraphQL): MapFeature {
    return convertToBusRoute(graphqlRoute);
  }

  convertToBusShape(graphqlShape: BusShapeGraphQL): MapFeature {
    return convertToBusShape(graphqlShape);
  }
}
