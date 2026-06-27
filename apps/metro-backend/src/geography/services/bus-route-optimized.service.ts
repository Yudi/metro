import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryOptimizationService } from './query-optimization.service';
import { BusRoute, BusShape } from '../entities/geography.entity';

/**
 * Optimized Bus Route Service
 * Reduces N+1 queries by using JOINs and batch operations
 */
@Injectable()
export class BusRouteServiceOptimized {
  private readonly logger = new Logger(BusRouteServiceOptimized.name);

  constructor(
    private prisma: PrismaService,
    private queryOptimization: QueryOptimizationService,
  ) {}

  async getBusRoute(id: string): Promise<BusRoute | null> {
    const route = await this.queryOptimization.findRouteByMultipleCriteria(id);

    if (!route) {
      return null;
    }

    return {
      id: route.route_id,
      routeId: route.route_id,
      shortName: route.route_short_name,
      longName: route.route_long_name,
      routeType: route.route_type,
      color: route.route_color,
      textColor: route.route_text_color,
    };
  }

  async getMultipleBusRoutes(ids: string[]): Promise<BusRoute[]> {
    return this.queryOptimization.getRoutesById(ids);
  }


  async getSubwayRoutes(): Promise<BusRoute[]> {
    // Optimized query: Get routes and shapes in one go using JOIN
    const routesWithShapes = await this.prisma.$queryRaw<
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
      WHERE (r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')
      ORDER BY r.route_id, t.shape_id
    `;

    return routesWithShapes.map((route) => ({
      id: route.route_id,
      routeId: route.route_id,
      shortName: route.route_short_name,
      longName: route.route_long_name,
      routeType: route.route_type,
      color: route.route_color,
      textColor: route.route_text_color,
      geometry: route.coordinates
        ? {
            type: 'LineString' as const,
            coordinates: route.coordinates,
          }
        : undefined,
    }));
  }

  async getBusShape(shapeId: string): Promise<BusShape | null> {
    const result = await this.prisma.$queryRaw<
      Array<{
        coordinates: number[][];
      }>
    >`
      SELECT ST_AsGeoJSON(geom)::json->'coordinates' as coordinates
      FROM "SPTrans_Shape" 
      WHERE shape_id = ${shapeId}
      AND geom IS NOT NULL
    `;

    if (!result || result.length === 0) {
      return null;
    }

    return {
      id: shapeId,
      shapeId,
      geometry: {
        type: 'LineString',
        coordinates: result[0].coordinates,
      },
    };
  }
}
