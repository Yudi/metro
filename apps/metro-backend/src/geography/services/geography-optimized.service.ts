import { Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PostGISService } from './postgis.service';
import { BusStopServiceOptimized } from './bus-stop-optimized.service';
import { SubwayStationService } from './subway-station.service';
import { BusRouteServiceOptimized } from './bus-route-optimized.service';
import { TripServiceOptimized } from './trip-optimized.service';
import {
  BusStop,
  BusRoute,
  BusShape,
  Trip,
  BoundingBox,
  RouteFullData,
  StopFullData,
  RouteRailConnection,
} from '../entities/geography.entity';
import { BoundingBoxInput, StopSearchInput } from '../dto/geography.input';

const MAX_BUS_STOP_LIMIT = 25_000;
const MAX_BUS_ROUTE_LIMIT = 10_000;
const MAX_BUS_SHAPE_LIMIT = 500;
const MAX_BATCH_IDS = 500;
const MAX_ROUTE_RAIL_CONNECTION_ROUTES = 100;
const MAX_STOP_FULL_DATA_ROUTES = 100;
// Limit nested route expansions to avoid exhausting the database pool.
const STOP_FULL_DATA_CONCURRENCY = 2;

export interface RouteFullDataOptions {
  includeTrips?: boolean;
  includeShapes?: boolean;
  includeStops?: boolean;
}

/**
 * Optimized Geography Service
 * Uses optimized sub-services with better query patterns
 */
@Injectable()
export class GeographyServiceOptimized {
  private readonly logger = new Logger(GeographyServiceOptimized.name);

  constructor(
    private prisma: PrismaService,
    private postGIS: PostGISService,
    private busStopService: BusStopServiceOptimized,
    private subwayStationService: SubwayStationService,
    private busRouteService: BusRouteServiceOptimized,
    private tripService: TripServiceOptimized,
  ) {}

  // Bus Stops - delegated to optimized BusStopService
  async searchBusStops(input?: StopSearchInput): Promise<BusStop[]> {
    return this.busStopService.searchBusStops(input);
  }

  async getAllBusStops(limit = MAX_BUS_STOP_LIMIT): Promise<BusStop[]> {
    return this.busStopService.searchBusStops({
      limit: this.clampLimit(limit, MAX_BUS_STOP_LIMIT),
    });
  }

  async getBusStopsInBounds(
    bounds: BoundingBoxInput,
    limit = MAX_BUS_STOP_LIMIT,
  ): Promise<BusStop[]> {
    return this.busStopService.searchBusStops({
      bounds,
      limit: this.clampLimit(limit, MAX_BUS_STOP_LIMIT),
    });
  }

  async getBusStop(id: string): Promise<BusStop | null> {
    return this.busStopService.getBusStop(id);
  }

  async getMultipleBusStops(ids: string[]): Promise<BusStop[]> {
    return this.busStopService.getMultipleStops(this.normalizeIds(ids));
  }

  async getMultipleBusRoutes(ids: string[]): Promise<BusRoute[]> {
    return this.busRouteService.getMultipleBusRoutes(this.normalizeIds(ids));
  }

  async getRoutesForMultipleStops(
    stopIds: string[],
  ): Promise<Map<string, BusRoute[]>> {
    return this.queryRoutesForMultipleStops(this.normalizeIds(stopIds));
  }

  // Subway Stations - delegated to SubwayStationService
  async getSubwayStations(): Promise<BusStop[]> {
    return this.subwayStationService.getSubwayStations();
  }

  // Bus Routes - delegated to optimized BusRouteService
  async getAllBusRoutes(limit = MAX_BUS_ROUTE_LIMIT): Promise<BusRoute[]> {
    // For now, delegate to PostGIS (can be optimized further if needed)
    const routes = await this.postGIS.getAllRoutes(
      this.clampLimit(limit, MAX_BUS_ROUTE_LIMIT),
    );

    const results: BusRoute[] = [];
    for (const route of routes) {
      results.push({
        id: route.route_id,
        routeId: route.route_id,
        shortName: route.route_short_name,
        longName: route.route_long_name,
        routeType: route.route_type,
        color: route.route_color,
        textColor: route.route_text_color,
      });
    }

    return results;
  }

  async getBusRoute(id: string): Promise<BusRoute | null> {
    return this.busRouteService.getBusRoute(id);
  }

  async getSubwayRoutes(): Promise<BusRoute[]> {
    return this.busRouteService.getSubwayRoutes();
  }

  // Bus Shapes - delegated to optimized BusRouteService
  async getBusShape(shapeId: string): Promise<BusShape | null> {
    return this.busRouteService.getBusShape(shapeId);
  }

  async getAllBusShapes(limit = MAX_BUS_SHAPE_LIMIT): Promise<BusShape[]> {
    const safeLimit = this.clampLimit(limit, MAX_BUS_SHAPE_LIMIT);

    const shapes = await this.prisma.$queryRaw<
      Array<{
        shape_id: string;
        coordinates: number[][];
      }>
    >`
      SELECT
        shape_id,
        ST_AsGeoJSON(geom)::json->'coordinates' as coordinates
      FROM "SPTrans_Shape"
      WHERE geom IS NOT NULL
      ORDER BY shape_id
      LIMIT ${safeLimit}
    `;

    return shapes.map((shape) => ({
      id: shape.shape_id,
      shapeId: shape.shape_id,
      geometry: {
        type: 'LineString',
        coordinates: shape.coordinates,
      },
    }));
  }

  // Trips and Route-Stop relationships - delegated to optimized TripService
  async getTripsForRoute(routeId: string): Promise<Trip[]> {
    return this.tripService.getTripsForRoute(routeId);
  }

  async getStopsForRoute(routeId: string): Promise<BusStop[]> {
    return this.tripService.getStopsForRoute(routeId);
  }

  async getRoutesForStop(stopId: string): Promise<BusRoute[]> {
    return this.tripService.getRoutesForStop(stopId);
  }

  async getBatchRoutesForStops(
    stopIds: string[],
  ): Promise<Map<string, string[]>> {
    return this.tripService.getBatchRoutesForStops(stopIds);
  }

  async getRouteFullData(
    routeId: string,
    options: RouteFullDataOptions = {},
  ): Promise<RouteFullData | null> {
    this.logger.debug(`Getting full data for route: ${routeId}`);

    // Get route info first
    const route = await this.getBusRoute(routeId);
    if (!route) {
      return null;
    }

    const includeTrips = options.includeTrips ?? true;
    const includeShapes = options.includeShapes ?? true;
    const includeStops = options.includeStops ?? true;

    const tripsPromise = includeTrips
      ? this.getTripsForRoute(routeId)
      : Promise.resolve<Trip[]>([]);
    const shapesPromise = includeShapes
      ? this.busRouteService.getRouteShapesForRoute(route.routeId)
      : Promise.resolve<Array<{ shape_id: string; coordinates: number[][] }>>(
          [],
        );
    const stopsPromise = includeStops
      ? this.getStopsForRoute(routeId)
      : Promise.resolve<BusStop[]>([]);
    const [trips, shapes, stops] = await Promise.all([
      tripsPromise,
      shapesPromise,
      stopsPromise,
    ]);

    this.logger.debug(
      `Route ${routeId}: ${trips.length} trips, ${stops.length} stops`,
    );

    return {
      route,
      trips,
      shapes: shapes.map((shape) => ({
        id: shape.shape_id,
        shapeId: shape.shape_id,
        geometry: {
          type: 'LineString',
          coordinates: shape.coordinates,
        },
      })),
      stops,
    };
  }

  /**
   * Get complete stop data in a single request.
   * Fetches stop info and full data for all routes passing through it.
   */
  async getStopFullData(
    stopId: string,
    includeRouteDetails = true,
  ): Promise<StopFullData | null> {
    this.logger.debug(`Getting full data for stop: ${stopId}`);

    // Get stop info first
    const stop = await this.getBusStop(stopId);
    if (!stop) {
      return null;
    }

    // Get routes passing through this stop
    const routesInfo = await this.getRoutesForStop(stopId);

    if (routesInfo.length > MAX_STOP_FULL_DATA_ROUTES) {
      throw new PayloadTooLargeException(
        `Stop route details exceed the maximum of ${MAX_STOP_FULL_DATA_ROUTES}`,
      );
    }

    if (!includeRouteDetails) {
      return {
        stop,
        routes: routesInfo.map((route) => ({
          route,
          trips: [],
          shapes: [],
          stops: [],
        })),
      };
    }

    const routeFullDataResults: Array<RouteFullData | null> = [];
    for (
      let index = 0;
      index < routesInfo.length;
      index += STOP_FULL_DATA_CONCURRENCY
    ) {
      const batch = routesInfo.slice(index, index + STOP_FULL_DATA_CONCURRENCY);
      routeFullDataResults.push(
        ...(await Promise.all(
          batch.map((route) => this.getRouteFullData(route.routeId)),
        )),
      );
    }
    const routes = routeFullDataResults.filter(
      (r): r is RouteFullData => r !== null,
    );

    this.logger.debug(`Stop ${stopId}: ${routes.length} routes with full data`);

    return {
      stop,
      routes,
    };
  }

  async getRouteRailConnectionsForStop(
    stopId: string,
    routeIds: string[],
  ): Promise<RouteRailConnection[]> {
    const uniqueRouteIds = Array.from(
      new Set(routeIds.map((routeId) => routeId.trim()).filter(Boolean)),
    ).sort();
    const normalizedStopId = stopId.trim();

    if (!normalizedStopId || uniqueRouteIds.length === 0) {
      return [];
    }
    if (uniqueRouteIds.length > MAX_ROUTE_RAIL_CONNECTION_ROUTES) {
      throw new PayloadTooLargeException(
        `Route rail connections support at most ${MAX_ROUTE_RAIL_CONNECTION_ROUTES} routes`,
      );
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        route_id: string;
        route_short_name: string;
        route_long_name: string;
        direction_id: number;
        trip_headsign: string;
        stop_id: string;
        stop_name: string;
        stop_sequence: number;
        station_id: number;
        station_name: string;
        agencies: string[];
        lines: string[];
        distance_meters: number;
      }>
    >`
      SELECT
        hit.route_id,
        hit.route_short_name,
        hit.route_long_name,
        hit.direction_id,
        hit.trip_headsign,
        hit.near_stop_id AS stop_id,
        hit.near_stop_name AS stop_name,
        hit.near_stop_sequence AS stop_sequence,
        hit.station_id,
        hit.station_name,
        hit.agencies,
        hit.lines,
        hit.distance_meters
      FROM "public"."route_rail_connection_hits" hit
      WHERE hit.from_stop_id = ${normalizedStopId}
        AND hit.route_id = ANY(${uniqueRouteIds}::TEXT[])
      ORDER BY
        hit.route_short_name,
        hit.direction_id,
        hit.trip_headsign,
        hit.near_stop_sequence
    `;

    const connections = new Map<string, RouteRailConnection>();

    for (const row of rows) {
      let connection = connections.get(row.route_id);
      if (!connection) {
        connection = {
          routeId: row.route_id,
          routeShortName: row.route_short_name,
          routeLongName: row.route_long_name,
          directions: [],
        };
        connections.set(row.route_id, connection);
      }

      let direction = connection.directions.find(
        (item) =>
          item.directionId === row.direction_id &&
          item.headsign === row.trip_headsign,
      );

      if (!direction) {
        direction = {
          directionId: row.direction_id,
          headsign: row.trip_headsign,
          stations: [],
        };
        connection.directions.push(direction);
      }

      direction.stations.push({
        id: row.station_id.toString(),
        name: row.station_name,
        agencies: row.agencies,
        lines: row.lines,
        distanceMeters: Math.round(row.distance_meters),
        nearStopId: row.stop_id,
        nearStopName: row.stop_name,
        stopSequence: row.stop_sequence,
      });
    }

    return Array.from(connections.values());
  }

  // Utility methods
  async getStopsBounds(): Promise<BoundingBox | null> {
    return this.postGIS.getStopsBounds();
  }

  async testDatabaseConnection() {
    return this.postGIS.testDatabaseConnection();
  }

  private normalizeIds(ids: string[]): string[] {
    return Array.from(
      new Set(
        ids
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
          .slice(0, MAX_BATCH_IDS),
      ),
    );
  }

  private clampLimit(limit: number, max: number, min = 1): number {
    if (!Number.isFinite(limit)) {
      return max;
    }

    return Math.min(Math.max(Math.trunc(limit), min), max);
  }

  private async queryRoutesForMultipleStops(
    stopIds: string[],
  ): Promise<Map<string, BusRoute[]>> {
    return this.tripService.getRoutesForMultipleStops(stopIds);
  }
}
