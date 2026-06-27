import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { MapFeature } from './map.service';

export interface BusStopGraphQL {
  id: string;
  stopId: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  isSubwayStation: boolean;
  agencies?: string[];
  routeShortNames?: string[];
  geometry?: {
    type: string;
    coordinates: number[][];
  };
}

export interface BusRouteGraphQL {
  id: string;
  routeId: string;
  shortName: string;
  longName: string;
  routeType: number;
  color: string;
  textColor: string;
  geometry?: {
    type: string;
    coordinates: number[][];
  };
}

export interface BusShapeGraphQL {
  id: string;
  shapeId: string;
  geometry: {
    type: string;
    coordinates: number[][];
  };
}

export interface TripGraphQL {
  id: string;
  routeId: string;
  serviceId: string;
  tripId: string;
  tripHeadsign: string;
  directionId: number;
  shapeId: string;
}

/**
 * Combined route data from a single GraphQL query.
 * Reduces multiple roundtrips when loading a route.
 */
export interface RouteFullDataGraphQL {
  route: BusRouteGraphQL;
  trips?: TripGraphQL[];
  shapes?: BusShapeGraphQL[];
  stops?: BusStopGraphQL[];
}

export interface RouteRailConnectionStationGraphQL {
  id: string;
  name: string;
  agencies: string[];
  lines: string[];
  distanceMeters: number;
  nearStopId: string;
  nearStopName: string;
  stopSequence: number;
}

export interface RouteRailConnectionDirectionGraphQL {
  directionId: number;
  headsign: string;
  stations: RouteRailConnectionStationGraphQL[];
}

export interface RouteRailConnectionGraphQL {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  directions: RouteRailConnectionDirectionGraphQL[];
}

/**
 * Combined stop data from a single GraphQL query.
 * Reduces multiple roundtrips when loading a stop and its routes.
 */
export interface StopFullDataGraphQL {
  stop: BusStopGraphQL;
  routes: RouteFullDataGraphQL[];
}

export interface StopSearchInput {
  searchTerm?: string;
  bounds?: BoundingBox;
  limit?: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

@Injectable({
  providedIn: 'root',
})
export class GeographyGraphQLService {
  private http = inject(HttpClient);
  private readonly graphqlEndpoint = '/api/graphql';

  // State management
  private busStopsSubject = new BehaviorSubject<BusStopGraphQL[]>([]);
  private busRoutesSubject = new BehaviorSubject<BusRouteGraphQL[]>([]);
  private busShapesSubject = new BehaviorSubject<BusShapeGraphQL[]>([]);

  readonly busStops$ = this.busStopsSubject.asObservable();
  readonly busRoutes$ = this.busRoutesSubject.asObservable();
  readonly busShapes$ = this.busShapesSubject.asObservable();

  // Reusable GraphQL fragment for stop fields
  private readonly stopFields = `
    id
    stopId
    name
    description
    latitude
    longitude
    isSubwayStation
    agencies
    routeShortNames
  `;

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
          ${this.stopFields}
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
          ${this.stopFields}
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
          ${this.stopFields}
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
          ${this.stopFields}
        }
      }
    `;

    return this.executeGraphQL<{ busStop: BusStopGraphQL | null }>(query, {
      id,
    }).pipe(map((data) => data.busStop));
  }

  getSubwayStations(): Observable<BusStopGraphQL[]> {
    const query = `
      query GetSubwayStations {
        subwayStations {
          ${this.stopFields}
        }
      }
    `;

    return this.executeGraphQL<{ subwayStations: BusStopGraphQL[] }>(
      query,
    ).pipe(map((data) => data.subwayStations));
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
          routeType
          color
          textColor
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

  getSubwayRoutes(): Observable<BusRouteGraphQL[]> {
    const query = `
      query GetSubwayRoutes {
        subwayRoutes {
          id
          routeId
          shortName
          longName
          routeType
          color
          textColor
        }
      }
    `;

    return this.executeGraphQL<{ subwayRoutes: BusRouteGraphQL[] }>(query).pipe(
      map((data) => data.subwayRoutes),
    );
  }

  getBusRoute(id: string): Observable<BusRouteGraphQL | null> {
    const query = `
      query GetBusRoute($id: ID!) {
        busRoute(id: $id) {
          id
          routeId
          shortName
          longName
          routeType
          color
          textColor
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
          ${this.stopFields}
        }
      }
    `;

    return this.executeGraphQL<{ stopsForRoute: BusStopGraphQL[] }>(query, {
      routeId,
    }).pipe(map((data) => data?.stopsForRoute || []));
  }

  // Get routes for a specific stop
  getRoutesForStop(stopId: string): Observable<BusRouteGraphQL[]> {
    const query = `
      query GetRoutesForStop($stopId: String!) {
        routesForStop(stopId: $stopId) {
          id
          routeId
          shortName
          longName
          routeType
          color
          textColor
        }
      }
    `;

    return this.executeGraphQL<{ routesForStop: BusRouteGraphQL[] }>(query, {
      stopId,
    }).pipe(map((data) => data?.routesForStop || []));
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

  // Reusable GraphQL fragment for route fields
  private readonly routeFields = `
    id
    routeId
    shortName
    longName
    routeType
    color
    textColor
  `;

  /**
   * Get complete route data (route info, trips, shapes, stops) in a single request.
   * Use this instead of separate getTripsForRoute, getBusShape, getStopsForRoute calls.
   */
  getRouteFullData(routeId: string): Observable<RouteFullDataGraphQL | null> {
    const query = `
      query GetRouteFullData($routeId: String!) {
        routeFullData(routeId: $routeId) {
          route {
            ${this.routeFields}
          }
        }
      }
    `;

    return this.executeGraphQL<{ routeFullData: RouteFullDataGraphQL | null }>(
      query,
      { routeId },
    ).pipe(map((data) => data?.routeFullData || null));
  }

  /**
   * Get complete stop data with all routes passing through it in a single request.
   * Use this instead of calling getRoutesForStop followed by multiple getRouteFullData calls.
   */
  getStopFullData(stopId: string): Observable<StopFullDataGraphQL | null> {
    const query = `
      query GetStopFullData($stopId: String!) {
        stopFullData(stopId: $stopId) {
          stop {
            ${this.stopFields}
          }
          routes {
            route {
              ${this.routeFields}
            }
          }
        }
      }
    `;

    return this.executeGraphQL<{ stopFullData: StopFullDataGraphQL | null }>(
      query,
      { stopId },
    ).pipe(map((data) => data?.stopFullData || null));
  }

  getRouteRailConnectionsForStop(
    stopId: string,
    routeIds: string[],
    radiusMeters = 150,
  ): Observable<RouteRailConnectionGraphQL[]> {
    if (routeIds.length === 0) {
      return of([]);
    }

    const query = `
      query GetRouteRailConnectionsForStop(
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

    return this.executeGraphQL<{
      routeRailConnectionsForStop: RouteRailConnectionGraphQL[];
    }>(query, {
      stopId,
      routeIds,
      radiusMeters,
    }).pipe(map((data) => data?.routeRailConnectionsForStop || []));
  }

  // Convert from backend format to map service format
  convertToBusStop(graphqlStop: BusStopGraphQL): MapFeature {
    return {
      id: graphqlStop.id,
      geometry: {
        type: 'Point' as const,
        coordinates: [[graphqlStop.longitude, graphqlStop.latitude]],
      },
      properties: {
        stopId: graphqlStop.stopId,
        name: graphqlStop.name,
        description: graphqlStop.description,
        latitude: graphqlStop.latitude,
        longitude: graphqlStop.longitude,
      },
    };
  }

  convertToBusRoute(graphqlRoute: BusRouteGraphQL): MapFeature {
    return {
      id: graphqlRoute.id,
      geometry: {
        type: 'LineString' as const,
        coordinates: graphqlRoute.geometry?.coordinates || [],
      },
      properties: {
        routeId: graphqlRoute.routeId,
        shortName: graphqlRoute.shortName,
        longName: graphqlRoute.longName,
        routeType: graphqlRoute.routeType,
        color: graphqlRoute.color,
        textColor: graphqlRoute.textColor,
      },
    };
  }

  convertToBusShape(graphqlShape: BusShapeGraphQL): MapFeature {
    return {
      id: graphqlShape.id,
      geometry: {
        type: 'LineString' as const,
        coordinates: graphqlShape.geometry.coordinates,
      },
      properties: {
        shapeId: graphqlShape.shapeId,
      },
    };
  }
}
