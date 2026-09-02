import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryOptimizationService } from './query-optimization.service';
import { BusStop } from '../entities/geography.entity';
import { StopSearchInput } from '../dto/geography.input';

interface GtfsStopRow {
  id: number;
  stop_id: string;
  stop_name: string;
  stop_desc: string | null;
  stop_lat: number;
  stop_lon: number;
}

/**
 * Optimized Bus Stop Service
 * Reduces N+1 queries and implements efficient batching
 */
@Injectable()
export class BusStopServiceOptimized {
  private readonly logger = new Logger(BusStopServiceOptimized.name);

  constructor(
    private prisma: PrismaService,
    private queryOptimization: QueryOptimizationService,
  ) {}

  async searchBusStops(input?: StopSearchInput): Promise<BusStop[]> {
    const limit = this.normalizeLimit(input?.limit);
    let stops;

    if (input?.searchTerm) {
      stops = await this.searchStopsByTerm(input.searchTerm, limit);
    } else if (input?.bounds) {
      stops = await this.findStopsInBounds(
        input.bounds.minLat,
        input.bounds.maxLat,
        input.bounds.minLng,
        input.bounds.maxLng,
        limit,
      );
    } else {
      stops = await this.findAllStops(limit);
    }

    // Batch operations to avoid N+1 queries
    const stopIdList = stops.map((s) => s.stop_id);

    const serviceInfo =
      await this.queryOptimization.batchGetStopServiceInfo(stopIdList);

    // Filter out rail-only stops
    const busStops = stops.filter((stop) => {
      const info = serviceInfo.get(stop.stop_id);
      return !(info?.servesRail && !info.servesBus);
    });

    return busStops.map((stop) => {
      const info = serviceInfo.get(stop.stop_id);
      return {
        id: stop.stop_id,
        stopId: stop.stop_id,
        name: stop.stop_name,
        description: stop.stop_desc || undefined,
        latitude: stop.stop_lat,
        longitude: stop.stop_lon,
        isSubwayStation: info?.servesRail ?? false,
        agencies: info?.agencies,
        routeShortNames: info?.railRouteShortNames,
        geometry: {
          type: 'Point',
          coordinates: [[stop.stop_lon, stop.stop_lat]],
        },
      };
    });
  }

  async getBusStop(id: string): Promise<BusStop | null> {
    const stop = await this.queryOptimization.findStopByMultipleCriteria(id);

    if (!stop) {
      return null;
    }

    const serviceInfo = await this.queryOptimization.batchGetStopServiceInfo([
      stop.stop_id,
    ]);
    const info = serviceInfo.get(stop.stop_id);

    return {
      id: stop.stop_id,
      stopId: stop.stop_id,
      name: stop.stop_name,
      description: stop.stop_desc || undefined,
      latitude: stop.stop_lat,
      longitude: stop.stop_lon,
      isSubwayStation: info?.servesRail ?? false,
      agencies: info?.agencies,
      routeShortNames: info?.railRouteShortNames,
      geometry: {
        type: 'Point',
        coordinates: [[stop.stop_lon, stop.stop_lat]],
      },
    };
  }

  async getMultipleStops(ids: string[]): Promise<BusStop[]> {
    return this.queryOptimization.getStopsById(ids);
  }

  private async findAllStops(limit: number): Promise<GtfsStopRow[]> {
    return this.prisma.$queryRaw<GtfsStopRow[]>`
      SELECT id, stop_id, stop_name, stop_desc, stop_lat, stop_lon
      FROM "SPTrans_Stop"
      ORDER BY stop_name
      LIMIT ${limit}
    `;
  }

  private async findStopsInBounds(
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number,
    limit: number,
  ): Promise<GtfsStopRow[]> {
    return this.prisma.$queryRaw<GtfsStopRow[]>`
      SELECT id, stop_id, stop_name, stop_desc, stop_lat, stop_lon
      FROM "SPTrans_Stop"
      WHERE location IS NOT NULL
        AND location && ST_MakeEnvelope(
          ${minLng},
          ${minLat},
          ${maxLng},
          ${maxLat},
          4326
        )::geography
        AND stop_lat BETWEEN ${minLat} AND ${maxLat}
        AND stop_lon BETWEEN ${minLng} AND ${maxLng}
      ORDER BY stop_name
      LIMIT ${limit}
    `;
  }

  private async searchStopsByTerm(searchTerm: string, limit = 50) {
    return this.prisma.$queryRaw<
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
  }

  private normalizeLimit(limit: number | undefined): number {
    if (limit === undefined || !Number.isFinite(limit)) {
      return 25_000;
    }

    return Math.min(Math.max(Math.trunc(limit), 1), 25_000);
  }
}
