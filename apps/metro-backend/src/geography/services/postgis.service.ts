import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BusRouteRow } from './bus-catalog.utils';

export interface GeometryData {
  type: string;
  coordinates: number[][];
}

@Injectable()
export class PostGISService {
  private readonly logger = new Logger(PostGISService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get geometry for a shape (route)
   */
  async getShapeGeometry(shapeId: string): Promise<GeometryData | null> {
    this.logger.debug(`Getting geometry for shape: ${shapeId}`);
    const result = await this.prisma.$queryRaw<
      Array<{
        coordinates: number[][];
      }>
    >`
      SELECT ST_AsGeoJSON(geom)::json->'coordinates' as coordinates
      FROM "public"."Gtfs_Shape"
      WHERE shape_id = ${shapeId}
      AND geom IS NOT NULL
    `;

    if (!result || result.length === 0) {
      this.logger.debug(`No geometry found for shape: ${shapeId}`);
      return null;
    }

    this.logger.debug(
      `Found geometry for shape ${shapeId} with ${result[0].coordinates.length} coordinate points`,
    );

    // Check which routes use this shape (for information only - shapes can be shared between routes)
    const routeCheck = await this.prisma.$queryRaw<
      Array<{
        route_id: string;
        route_short_name: string;
        count: number;
      }>
    >`
      SELECT DISTINCT t.route_id, r.route_short_name, COUNT(*) as count
      FROM "public"."Gtfs_Trip" t
      JOIN "public"."Gtfs_Route" r ON t.route_id = r.route_id
      WHERE t.shape_id = ${shapeId}
      GROUP BY t.route_id, r.route_short_name
    `;

    this.logger.debug(
      `Shape ${shapeId} is shared by ${routeCheck.length} route${
        routeCheck.length === 1 ? '' : 's'
      }: ${routeCheck.map((r) => r.route_short_name).join(', ')}`,
    );

    return {
      type: 'LineString',
      coordinates: result[0].coordinates,
    };
  }

  /**
   * Test database connection and table existence
   */
  async testDatabaseConnection(): Promise<{
    tablesExist: boolean;
    stopsCount: number;
    hasGeometry: boolean;
    error?: string;
  }> {
    try {
      // Test if tables exist and have data
      const stopsResult = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) as count FROM "public"."Gtfs_Stop"
      `;
      const stopsCount = Number(stopsResult[0]?.count || 0);

      // Test if geometry columns exist
      let hasGeometry = false;
      try {
        await this.prisma.$queryRaw`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'Gtfs_Stop'
          AND column_name IN ('location', 'geom')
        `;
        hasGeometry = true;
      } catch (error) {
        this.logger.warn('Geometry columns not found', error);
      }

      return {
        tablesExist: stopsCount > 0,
        stopsCount,
        hasGeometry,
      };
    } catch (error) {
      this.logger.error('Database connection test failed', error);
      return {
        tablesExist: false,
        stopsCount: 0,
        hasGeometry: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find bus stops within a bounding box
   */
  async findStopsInBounds(
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number,
    limit = 100,
  ): Promise<
    Array<{
      id: number;
      stop_id: string;
      stop_name: string;
      stop_desc: string | null;
      stop_lat: number;
      stop_lon: number;
    }>
  > {
    const result = await this.prisma.$queryRaw<
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
      FROM "public"."Gtfs_Stop"
      WHERE stop_lat BETWEEN ${minLat} AND ${maxLat}
      AND stop_lon BETWEEN ${minLng} AND ${maxLng}
      ORDER BY stop_name
      LIMIT ${limit}
    `;

    return result;
  }

  /**
   * Find bus stops by search term
   */
  async searchStops(
    searchTerm: string,
    limit = 50,
  ): Promise<
    Array<{
      id: number;
      stop_id: string;
      stop_name: string;
      stop_desc: string | null;
      stop_lat: number;
      stop_lon: number;
    }>
  > {
    const result = await this.prisma.$queryRaw<
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
      FROM "public"."Gtfs_Stop"
      WHERE stop_name ILIKE ${`%${searchTerm}%`}
      OR stop_id ILIKE ${`%${searchTerm}%`}
      ORDER BY 
        CASE 
          WHEN stop_name ILIKE ${`${searchTerm}%`} THEN 1
          WHEN stop_name ILIKE ${`%${searchTerm}%`} THEN 2
          ELSE 3
        END,
        stop_name
      LIMIT ${limit}
    `;

    return result;
  }

  /**
   * Get all bus routes
   */
  async getAllRoutes(limit = 10_000): Promise<BusRouteRow[]> {
    const result = await this.prisma.$queryRaw<BusRouteRow[]>`
      SELECT
        route.id,
        route.route_id,
        route.agency_id,
        route.route_short_name,
        route.route_long_name,
        route.route_type,
        route.route_color,
        route.route_text_color,
        route.source_agency,
        route.source_id,
        COALESCE(fares.fares, '[]'::jsonb) AS fares
      FROM "public"."Gtfs_Route" route
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object('price', fare.price, 'currency', fare.currency_type)
          ORDER BY fare.price, fare.currency_type
        ) AS fares
        FROM (
          SELECT DISTINCT attribute.price, attribute.currency_type
          FROM "public"."Gtfs_FareRule" rule
          INNER JOIN "public"."Gtfs_FareAttribute" attribute
            ON attribute.fare_id = rule.fare_id
          WHERE rule.route_id = route.route_id
        ) fare
      ) fares ON TRUE
      ORDER BY
        CASE WHEN LOWER(COALESCE(route.source_agency, '')) = 'sptrans' THEN 0 ELSE 1 END,
        route.route_short_name,
        route.route_id
      LIMIT ${limit}
    `;

    return result;
  }

  /**
   * Get route shapes for a specific route
   */
  async getRouteShapes(routeId: string): Promise<
    Array<{
      shape_id: string;
      geometry: GeometryData | null;
    }>
  > {
    const shapes = await this.prisma.$queryRaw<Array<{ shape_id: string }>>`
      SELECT DISTINCT t.shape_id
      FROM "public"."Gtfs_Trip" t
      WHERE t.route_id = ${routeId}
      AND t.shape_id IS NOT NULL
      AND t.shape_id != ''
    `;

    const result = [];
    for (const shape of shapes) {
      const geometry = await this.getShapeGeometry(shape.shape_id);
      result.push({
        shape_id: shape.shape_id,
        geometry,
      });
    }

    return result;
  }

  /**
   * Get stops bounds for map fitting
   */
  async getStopsBounds(): Promise<{
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } | null> {
    const result = await this.prisma.$queryRaw<
      Array<{
        min_lat: number;
        max_lat: number;
        min_lng: number;
        max_lng: number;
      }>
    >`
      SELECT 
        MIN(stop_lat) as min_lat,
        MAX(stop_lat) as max_lat,
        MIN(stop_lon) as min_lng,
        MAX(stop_lon) as max_lng
      FROM "public"."Gtfs_Stop"
      WHERE stop_lat IS NOT NULL 
      AND stop_lon IS NOT NULL
    `;

    if (!result || result.length === 0 || !result[0].min_lat) {
      return null;
    }

    const bounds = result[0];
    return {
      minLat: bounds.min_lat,
      maxLat: bounds.max_lat,
      minLng: bounds.min_lng,
      maxLng: bounds.max_lng,
    };
  }

  /**
   * Calculate distance between two points
   */
  async calculateDistance(
    lng1: number,
    lat1: number,
    lng2: number,
    lat2: number,
  ): Promise<number> {
    const result = await this.prisma.$queryRaw<Array<{ distance: number }>>`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${lng1}, ${lat1}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${lng2}, ${lat2}), 4326)::geography
      ) as distance
    `;

    return result[0]?.distance || 0;
  }
}
