import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryOptimizationService } from './query-optimization.service';
import { BusStop, BusRoute, Trip } from '../entities/geography.entity';
import { mapBusStop } from './bus-catalog.utils';

/**
 * Optimized Trip Service
 * Uses efficient JOIN queries instead of N+1 patterns
 */
@Injectable()
export class TripServiceOptimized {
  private readonly logger = new Logger(TripServiceOptimized.name);

  constructor(
    private prisma: PrismaService,
    private queryOptimization: QueryOptimizationService,
  ) {}

  async getTripsForRoute(routeId: string): Promise<Trip[]> {
    const route =
      await this.queryOptimization.findRouteByMultipleCriteria(routeId);

    if (!route) {
      return [];
    }

    const trips = await this.prisma.$queryRaw<
      Array<{
        id: number;
        route_id: string;
        service_id: string;
        trip_id: string;
        trip_headsign: string;
        direction_id: number;
        shape_id: string;
      }>
    >`
      SELECT DISTINCT ON (direction_id, trip_headsign, shape_id)
        id, route_id, service_id, trip_id, trip_headsign, direction_id, shape_id
      FROM "public"."Gtfs_Trip"
      WHERE route_id = ${route.route_id}
      ORDER BY direction_id, trip_headsign, shape_id, trip_id
    `;

    return trips.map((trip) => ({
      id: trip.trip_id,
      routeId: trip.route_id,
      serviceId: trip.service_id,
      tripId: trip.trip_id,
      tripHeadsign: trip.trip_headsign,
      directionId: trip.direction_id,
      shapeId: trip.shape_id,
    }));
  }

  async getStopsForRoute(routeId: string): Promise<BusStop[]> {
    const route =
      await this.queryOptimization.findRouteByMultipleCriteria(routeId);

    if (!route) {
      return [];
    }

    // Use optimized single-query approach
    const stops = await this.queryOptimization.getStopsForRouteOptimized(
      route.route_id,
    );

    if (stops.length === 0) {
      return [];
    }

    const stopIdList = stops.map((s) => s.physical_stop_id || s.stop_id);
    const serviceInfo =
      await this.queryOptimization.batchGetStopServiceInfo(stopIdList);

    return stops.map((stop) => {
      const physicalStopId = stop.physical_stop_id || stop.stop_id;
      return mapBusStop(stop, serviceInfo.get(physicalStopId));
    });
  }

  async getRoutesForStop(stopId: string): Promise<BusRoute[]> {
    const stop =
      await this.queryOptimization.findStopByMultipleCriteria(stopId);

    if (!stop) {
      return [];
    }

    // Use optimized single-query approach
    const routes = await this.queryOptimization.getRoutesForStopOptimized(
      stop.stop_id,
    );

    return routes;
  }

  /**
   * Batch get route short names for multiple stops - optimized single query
   */
  async getBatchRoutesForStops(
    stopIds: string[],
  ): Promise<Map<string, string[]>> {
    return this.queryOptimization.getBatchRoutesForStops(stopIds);
  }

  async getRoutesForMultipleStops(
    stopIds: string[],
  ): Promise<Map<string, BusRoute[]>> {
    return this.queryOptimization.getRoutesForMultipleStops(stopIds);
  }
}
