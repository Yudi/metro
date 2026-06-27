import { Injectable, Logger } from '@nestjs/common';
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
const MIN_ROUTE_RAIL_CONNECTION_RADIUS_METERS = 50;
const MAX_ROUTE_RAIL_CONNECTION_RADIUS_METERS = 5_000;

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

  /**
   * Get complete route data in a single request.
   * Fetches route info, trips, shapes, and stops all at once.
   */
  async getRouteFullData(routeId: string): Promise<RouteFullData | null> {
    this.logger.debug(`Getting full data for route: ${routeId}`);

    // Get route info first
    const route = await this.getBusRoute(routeId);
    if (!route) {
      return null;
    }

    // Fetch trips, and stops in parallel
    const [trips, stops] = await Promise.all([
      this.getTripsForRoute(routeId),
      this.getStopsForRoute(routeId),
    ]);

    this.logger.debug(
      `Route ${routeId}: ${trips.length} trips, ${stops.length} stops`,
    );

    return {
      route,
      trips,
      shapes: [],
      stops,
    };
  }

  /**
   * Get complete stop data in a single request.
   * Fetches stop info and full data for all routes passing through it.
   */
  async getStopFullData(stopId: string): Promise<StopFullData | null> {
    this.logger.debug(`Getting full data for stop: ${stopId}`);

    // Get stop info first
    const stop = await this.getBusStop(stopId);
    if (!stop) {
      return null;
    }

    // Get routes passing through this stop
    const routesInfo = await this.getRoutesForStop(stopId);

    // Fetch full data for each route in parallel
    const routeFullDataPromises = routesInfo.map((route) =>
      this.getRouteFullData(route.routeId),
    );
    const routeFullDataResults = await Promise.all(routeFullDataPromises);
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
    radiusMeters = 150,
  ): Promise<RouteRailConnection[]> {
    const uniqueRouteIds = Array.from(
      new Set(routeIds.map((routeId) => routeId.trim()).filter(Boolean)),
    ).slice(0, MAX_ROUTE_RAIL_CONNECTION_ROUTES);
    const safeRadiusMeters = this.clampLimit(
      radiusMeters,
      MAX_ROUTE_RAIL_CONNECTION_RADIUS_METERS,
      MIN_ROUTE_RAIL_CONNECTION_RADIUS_METERS,
    );

    if (!stopId || uniqueRouteIds.length === 0) {
      return [];
    }

    const routes = await this.prisma.$queryRaw<
      Array<{
        route_id: string;
        route_short_name: string;
        route_long_name: string;
      }>
    >`
      SELECT DISTINCT
        r.route_id,
        r.route_short_name,
        r.route_long_name
      FROM "SPTrans_Route" r
      WHERE r.route_id = ANY(${uniqueRouteIds}::text[])
      ORDER BY r.route_short_name
    `;

    if (routes.length === 0) {
      return [];
    }

    const routeIdsForQuery = routes.map((route) => route.route_id);
    const stationRows = await this.prisma.$queryRaw<
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
      WITH trip_current AS (
        SELECT
          t.route_id,
          t.direction_id,
          t.trip_headsign,
          t.trip_id,
          st.stop_sequence,
          ROW_NUMBER() OVER (
            PARTITION BY t.route_id, t.direction_id, t.trip_headsign
            ORDER BY t.trip_id
          ) AS trip_rank
        FROM "SPTrans_Trip" t
        INNER JOIN "SPTrans_StopTime" st ON st.trip_id = t.trip_id
        WHERE t.route_id = ANY(${routeIdsForQuery}::text[])
          AND st.stop_id = ${stopId}
      ),
      next_stops AS (
        SELECT
          tc.route_id,
          tc.direction_id,
          tc.trip_headsign,
          ns.stop_id,
          ns.stop_sequence,
          s.stop_name,
          s.stop_lat,
          s.stop_lon
        FROM trip_current tc
        INNER JOIN "SPTrans_StopTime" ns ON ns.trip_id = tc.trip_id
        INNER JOIN "SPTrans_Stop" s ON s.stop_id = ns.stop_id
        WHERE tc.trip_rank = 1
          AND ns.stop_sequence > tc.stop_sequence
      ),
      station_hits AS (
        SELECT DISTINCT ON (
	          ns.route_id,
	          ns.direction_id,
	          ns.trip_headsign,
	          station."primaryId"
	        )
          ns.route_id,
          r.route_short_name,
          r.route_long_name,
          ns.direction_id,
          ns.trip_headsign,
          ns.stop_id,
          ns.stop_name,
          ns.stop_sequence,
	          station."primaryId" AS station_id,
          station.name AS station_name,
          station.agencies,
          station.lines,
          ST_Distance(
            ST_SetSRID(ST_MakePoint(ns.stop_lon, ns.stop_lat), 4326)::geography,
            ST_SetSRID(ST_MakePoint(station.longitude, station.latitude), 4326)::geography
          )::double precision AS distance_meters
        FROM next_stops ns
        INNER JOIN "SPTrans_Route" r ON r.route_id = ns.route_id
        INNER JOIN merged_rail_stations station ON ST_DWithin(
	          ST_SetSRID(ST_MakePoint(ns.stop_lon, ns.stop_lat), 4326)::geography,
	          ST_SetSRID(ST_MakePoint(station.longitude, station.latitude), 4326)::geography,
	          ${safeRadiusMeters}
	        )
        ORDER BY
	          ns.route_id,
	          ns.direction_id,
	          ns.trip_headsign,
	          station."primaryId",
          ns.stop_sequence,
          distance_meters
      )
      SELECT *
      FROM station_hits
      ORDER BY route_short_name, direction_id, trip_headsign, stop_sequence
    `;

    const connections = new Map<string, RouteRailConnection>();

    for (const route of routes) {
      connections.set(route.route_id, {
        routeId: route.route_id,
        routeShortName: route.route_short_name,
        routeLongName: route.route_long_name,
        directions: [],
      });
    }

    for (const row of stationRows) {
      const connection = connections.get(row.route_id);
      if (!connection) {
        continue;
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
