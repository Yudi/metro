import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PostGISService } from './postgis.service';
import { BusRoute, BusShape } from '../entities/geography.entity';

interface GtfsRouteRow {
  id: number;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

@Injectable()
export class BusRouteService {
  private readonly logger = new Logger(BusRouteService.name);

  constructor(private prisma: PrismaService, private postGIS: PostGISService) {}

  async getAllBusRoutes(): Promise<BusRoute[]> {
    const routes = await this.postGIS.getAllRoutes();

    const results: BusRoute[] = [];
    for (const route of routes) {
      const shapes = await this.postGIS.getRouteShapes(route.route_id);
      const geometry = shapes.find((s) => s.geometry)?.geometry;

      results.push({
        id: route.route_id,
        routeId: route.route_id,
        shortName: route.route_short_name,
        longName: route.route_long_name,
        routeType: route.route_type,
        color: route.route_color,
        textColor: route.route_text_color,
        geometry: geometry || undefined,
      });
    }

    return results;
  }

  async getSubwayRoutes(): Promise<BusRoute[]> {
    this.logger.debug(
      'Backend: getSubwayRoutes called - filtering for METRÔ and CPTM routes'
    );

    // Query only routes that start with 'METRÔ' or 'CPTM' in their route_id
    const routes = await this.prisma.$queryRaw<GtfsRouteRow[]>`
      SELECT id, route_id, route_short_name, route_long_name, route_type, route_color, route_text_color
      FROM "SPTrans_Route"
      WHERE route_id LIKE 'METRÔ%'
      OR route_id LIKE 'CPTM%'
    `;

    this.logger.debug(`Backend: Found ${routes.length} subway routes`);

    const results: BusRoute[] = [];
    for (const route of routes) {
      const shapes = await this.postGIS.getRouteShapes(route.route_id);
      const geometry = shapes.find((s) => s.geometry)?.geometry;

      results.push({
        id: route.route_id,
        routeId: route.route_id,
        shortName: route.route_short_name,
        longName: route.route_long_name,
        routeType: route.route_type,
        color: route.route_color,
        textColor: route.route_text_color,
        geometry: geometry || undefined,
      });
    }

    this.logger.debug(
      `Backend: Returning ${results.length} subway routes with geometry`
    );
    return results;
  }

  async getBusRoute(id: string): Promise<BusRoute | null> {
    this.logger.debug(`Backend getBusRoute: Called with id="${id}"`);
    const route = await this.findRouteByRouteId(id);

    if (!route) {
      return null;
    }

    const shapes = await this.postGIS.getRouteShapes(route.route_id);
    const geometry = shapes.find((s) => s.geometry)?.geometry;

    return {
      id: route.route_id,
      routeId: route.route_id,
      shortName: route.route_short_name,
      longName: route.route_long_name,
      routeType: route.route_type,
      color: route.route_color,
      textColor: route.route_text_color,
      geometry: geometry || undefined,
    };
  }

  async getBusShape(shapeId: string): Promise<BusShape | null> {
    const geometry = await this.postGIS.getShapeGeometry(shapeId);

    if (!geometry) {
      return null;
    }

    return {
      id: shapeId,
      shapeId,
      geometry,
    };
  }

  async getAllBusShapes(): Promise<BusShape[]> {
    const shapes = await this.prisma.$queryRaw<Array<{ shape_id: string }>>`
      SELECT shape_id
      FROM "SPTrans_Shape"
      LIMIT 100
    `;

    const results: BusShape[] = [];
    for (const shape of shapes) {
      const geometry = await this.postGIS.getShapeGeometry(shape.shape_id);
      if (geometry) {
        results.push({
          id: shape.shape_id,
          shapeId: shape.shape_id,
          geometry,
        });
      }
    }

    return results;
  }

  private async findRouteByRouteId(
    routeId: string,
  ): Promise<GtfsRouteRow | undefined> {
    const routes = await this.prisma.$queryRaw<GtfsRouteRow[]>`
      SELECT id, route_id, route_short_name, route_long_name, route_type, route_color, route_text_color
      FROM "SPTrans_Route"
      WHERE route_id = ${routeId}
      LIMIT 1
    `;
    return routes[0];
  }
}
