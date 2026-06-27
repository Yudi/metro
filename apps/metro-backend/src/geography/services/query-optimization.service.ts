import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getUniqueAgencies } from '@metro/shared/utils';
import { BusRoute, BusStop } from '../entities/geography.entity';

/**
 * Optimized query service for common database operations
 * Implements batching and efficient query patterns
 */
@Injectable()
export class QueryOptimizationService {
  private readonly logger = new Logger(QueryOptimizationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Batch check which stops are subway stations (single query)
   */
  async batchCheckSubwayStations(stopIds: string[]): Promise<Set<string>> {
    if (stopIds.length === 0) {
      return new Set();
    }

    const subwayStops = await this.prisma.$queryRaw<Array<{ stop_id: string }>>`
      SELECT DISTINCT st.stop_id
      FROM "SPTrans_StopTime" st
      INNER JOIN "SPTrans_Trip" t ON st.trip_id = t.trip_id
      INNER JOIN "SPTrans_Route" r ON t.route_id = r.route_id
      WHERE st.stop_id = ANY(${stopIds}::text[])
      AND (r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')
    `;

    return new Set(subwayStops.map((s) => s.stop_id));
  }

  /**
   * Get stops that serve ONLY GTFS rail routes (METRÔ/CPTM)
   * These stops should be excluded from bus queries since we use GeoSampa for rail
   */
  async getRailOnlyStops(stopIds: string[]): Promise<Set<string>> {
    if (stopIds.length === 0) {
      return new Set();
    }

    // Get all stops that serve at least one non-rail route
    const busStops = await this.prisma.$queryRaw<Array<{ stop_id: string }>>`
      SELECT DISTINCT st.stop_id
      FROM "SPTrans_StopTime" st
      INNER JOIN "SPTrans_Trip" t ON st.trip_id = t.trip_id
      INNER JOIN "SPTrans_Route" r ON t.route_id = r.route_id
      WHERE st.stop_id = ANY(${stopIds}::text[])
      AND r.route_id NOT LIKE 'METRÔ%'
      AND r.route_id NOT LIKE 'CPTM%'
    `;

    const busStopIdSet = new Set(busStops.map((s) => s.stop_id));

    // Get all stops that serve rail routes
    const railStops = await this.prisma.$queryRaw<Array<{ stop_id: string }>>`
      SELECT DISTINCT st.stop_id
      FROM "SPTrans_StopTime" st
      INNER JOIN "SPTrans_Trip" t ON st.trip_id = t.trip_id
      INNER JOIN "SPTrans_Route" r ON t.route_id = r.route_id
      WHERE st.stop_id = ANY(${stopIds}::text[])
      AND (r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')
    `;

    // Rail-only stops are those that serve rail but NOT bus
    const railOnlyStops = new Set<string>();
    for (const stop of railStops) {
      if (!busStopIdSet.has(stop.stop_id)) {
        railOnlyStops.add(stop.stop_id);
      }
    }

    return railOnlyStops;
  }

  /**
   * Batch get agencies for stops (single query)
   */
  async batchGetStopAgencies(
    stopIds: string[],
  ): Promise<Map<string, string[]>> {
    if (stopIds.length === 0) {
      return new Map();
    }

    const stopRoutes = await this.prisma.$queryRaw<
      Array<{ stop_id: string; route_short_name: string }>
    >`
      SELECT DISTINCT st.stop_id, r.route_short_name
      FROM "SPTrans_StopTime" st
      INNER JOIN "SPTrans_Trip" t ON st.trip_id = t.trip_id
      INNER JOIN "SPTrans_Route" r ON t.route_id = r.route_id
      WHERE st.stop_id = ANY(${stopIds}::text[])
      AND (r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')
    `;

    // Group routes by stop
    const stopAgenciesMap = new Map<string, string[]>();

    for (const stopId of stopIds) {
      const routesForStop = stopRoutes
        .filter((r) => r.stop_id === stopId)
        .map((r) => r.route_short_name);

      if (routesForStop.length > 0) {
        const agencies = getUniqueAgencies(routesForStop);
        stopAgenciesMap.set(stopId, agencies);
      }
    }

    return stopAgenciesMap;
  }

  /**
   * Find route by stable GTFS route_id.
   */
  async findRouteByMultipleCriteria(routeId: string) {
    const routes = await this.prisma.$queryRaw<
      Array<{
        id: number;
        route_id: string;
        agency_id: string;
        route_short_name: string;
        route_long_name: string;
        route_type: number;
        route_color: string;
        route_text_color: string;
      }>
    >`
      SELECT id, route_id, agency_id, route_short_name, route_long_name, route_type, route_color, route_text_color
      FROM "SPTrans_Route"
      WHERE route_id = ${routeId}
      LIMIT 1
    `;

    return routes[0] ?? null;
  }

  /**
   * Find stop by stable GTFS stop_id.
   */
  async findStopByMultipleCriteria(stopId: string) {
    const stops = await this.prisma.$queryRaw<
      Array<{
        id: number;
        stop_id: string;
        stop_name: string;
        stop_desc: string | null;
        stop_lat: number;
        stop_lon: number;
      }>
    >`
      SELECT id, stop_id, stop_name, stop_desc, stop_lat, stop_lon
      FROM "SPTrans_Stop"
      WHERE stop_id = ${stopId}
      LIMIT 1
    `;

    return stops[0] ?? null;
  }

  /**
   * Get route shapes efficiently - using JOIN instead of N+1 queries
   */
  async getRouteShapesOptimized(
    routeId: string,
  ): Promise<Array<{ shape_id: string; coordinates: number[][] }>> {
    // Use raw SQL to get all shape coordinates for a route in a single query
    // with PostGIS geometry functions
    // Note: Using DISTINCT ON (shape_id) to avoid JSON comparison issues
    const result = await this.prisma.$queryRaw<
      Array<{ shape_id: string; coordinates: string }>
    >`
      SELECT DISTINCT ON (t.shape_id)
        t.shape_id,
        ST_AsGeoJSON(s.geom)::text as coordinates
      FROM "SPTrans_Trip" t
      INNER JOIN "SPTrans_Shape" s ON t.shape_id = s.shape_id
      WHERE t.route_id = ${routeId}
    `;

    // Parse the GeoJSON text to extract coordinates
    return result.map((row) => ({
      shape_id: row.shape_id,
      coordinates: JSON.parse(row.coordinates).coordinates as number[][],
    }));
  }

  /**
   * Get stops for route efficiently - using single query with JOIN
   */
  async getStopsForRouteOptimized(routeId: string) {
    const stops = await this.prisma.$queryRaw<
      Array<{
        id: number;
        stop_id: string;
        stop_name: string;
        stop_desc: string | null;
        stop_lat: number;
        stop_lon: number;
      }>
    >`
      SELECT DISTINCT 
        s.id, 
        s.stop_id, 
        s.stop_name, 
        s.stop_desc, 
        s.stop_lat, 
        s.stop_lon
      FROM "SPTrans_Stop" s
      INNER JOIN "SPTrans_StopTime" st ON s.stop_id = st.stop_id
      INNER JOIN "SPTrans_Trip" t ON st.trip_id = t.trip_id
      WHERE t.route_id = ${routeId}
      ORDER BY s.stop_name
    `;

    return stops;
  }

  /**
   * Get routes for stop efficiently - using single query with JOIN
   */
  async getRoutesForStopOptimized(stopId: string) {
    const routes = await this.prisma.$queryRaw<
      Array<{
        id: number;
        route_id: string;
        route_short_name: string;
        route_long_name: string;
        route_type: number;
        route_color: string;
        route_text_color: string;
      }>
    >`
      SELECT DISTINCT 
        r.id, 
        r.route_id, 
        r.route_short_name, 
        r.route_long_name, 
        r.route_type, 
        r.route_color, 
        r.route_text_color
      FROM "SPTrans_Route" r
      INNER JOIN "SPTrans_Trip" t ON r.route_id = t.route_id
      INNER JOIN "SPTrans_StopTime" st ON t.trip_id = st.trip_id
      WHERE st.stop_id = ${stopId}
      ORDER BY r.route_short_name
    `;

    return routes;
  }

  async getRoutesForMultipleStops(
    stopIds: string[],
  ): Promise<Map<string, BusRoute[]>> {
    if (stopIds.length === 0) {
      return new Map();
    }

    const routes = await this.prisma.$queryRaw<
      Array<{
        stop_id: string;
        id: number;
        route_id: string;
        route_short_name: string;
        route_long_name: string;
        route_type: number;
        route_color: string;
        route_text_color: string;
      }>
    >`
      SELECT DISTINCT 
        st.stop_id,
        r.id, 
        r.route_id, 
        r.route_short_name, 
        r.route_long_name, 
        r.route_type, 
        r.route_color, 
        r.route_text_color
      FROM "SPTrans_Route" r
      INNER JOIN "SPTrans_Trip" t ON r.route_id = t.route_id
      INNER JOIN "SPTrans_StopTime" st ON t.trip_id = st.trip_id
      WHERE st.stop_id = ANY(${stopIds}::text[])
      ORDER BY st.stop_id, r.route_short_name
    `;

    const resultMap = routes.reduce((map, row) => {
      const busRoute: BusRoute = {
        id: row.route_id,
        routeId: row.route_id,
        shortName: row.route_short_name,
        longName: row.route_long_name,
        routeType: row.route_type,
        color: row.route_color,
        textColor: row.route_text_color,
      };

      const existingRoutes = map.get(row.stop_id) ?? [];
      existingRoutes.push(busRoute);
      map.set(row.stop_id, existingRoutes);

      return map;
    }, new Map<string, BusRoute[]>());

    stopIds.forEach((id) => {
      if (!resultMap.has(id)) {
        resultMap.set(id, []);
      }
    });

    return resultMap;
  }

  async getRoutesById(route_id: string[]): Promise<BusRoute[]> {
    // Optimized query to get multiple routes by stable GTFS route_id values.
    const routes = await this.prisma.$queryRaw<
      Array<{
        id: number;
        route_id: string;
        route_short_name: string;
        route_long_name: string;
        route_type: number;
        route_color: string;
        route_text_color: string;
        shape_id: string | null;
        coordinates: number[][] | null;
      }>
    >`
      SELECT DISTINCT ON (r.route_id)
        r.id,
        r.route_id,
        r.route_short_name,
        r.route_long_name,
        r.route_type,
        r.route_color,
        r.route_text_color,
        t.shape_id,
        ST_AsGeoJSON(s.geom)::json->'coordinates' as coordinates
      FROM "SPTrans_Route" r
      LEFT JOIN "SPTrans_Trip" t ON r.route_id = t.route_id
      LEFT JOIN "SPTrans_Shape" s ON t.shape_id = s.shape_id AND s.geom IS NOT NULL
      WHERE r.route_id = ANY(${route_id}::text[])
      ORDER BY r.route_id, t.shape_id
    `;

    return routes.map((route) => ({
      id: route.route_id,
      routeId: route.route_id,
      shortName: route.route_short_name,
      longName: route.route_long_name,
      routeType: route.route_type,
      color: route.route_color,
      textColor: route.route_text_color,
      geometry: route.coordinates
        ? { type: 'LineString', coordinates: route.coordinates }
        : undefined,
    }));
  }

  async getStopsById(stop_id: string[]): Promise<BusStop[]> {
    const stops = await this.prisma.$queryRaw<
      Array<{
        id: number;
        stop_id: string;
        stop_name: string;
        stop_desc: string | null;
        stop_lat: number;
        stop_lon: number;
      }>
    >`
      SELECT DISTINCT 
        s.id, 
        s.stop_id, 
        s.stop_name, 
        s.stop_desc, 
        s.stop_lat, 
        s.stop_lon
      FROM "SPTrans_Stop" s
      WHERE s.stop_id = ANY(${stop_id}::text[])
      ORDER BY s.stop_name
    `;

    return stops.map((stop) => ({
      id: stop.stop_id,
      stopId: stop.stop_id,
      name: stop.stop_name,
      description: stop.stop_desc || undefined,
      latitude: stop.stop_lat,
      longitude: stop.stop_lon,
      isSubwayStation: false,
    }));
  }

  /**
   * Batch get route short names for multiple stops - single query
   */
  async getBatchRoutesForStops(
    stopIds: string[],
  ): Promise<Map<string, string[]>> {
    if (stopIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ stop_id: string; route_short_name: string }>
    >`
    SELECT DISTINCT st.stop_id, r.route_short_name
    FROM "SPTrans_StopTime" st
    INNER JOIN "SPTrans_Trip" t ON st.trip_id = t.trip_id
    INNER JOIN "SPTrans_Route" r ON t.route_id = r.route_id
    WHERE st.stop_id = ANY(${stopIds}::text[])
    ORDER BY st.stop_id, r.route_short_name
  `;

    const resultMap = new Map<string, string[]>();

    // Ensure every requested stop exists in the map
    for (const id of stopIds) {
      resultMap.set(id, []);
    }

    // Populate results
    for (const row of rows) {
      resultMap.get(row.stop_id)?.push(row.route_short_name);
    }

    return resultMap;
  }
}
