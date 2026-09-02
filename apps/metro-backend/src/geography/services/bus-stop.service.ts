import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PostGISService } from './postgis.service';
import { BusStop } from '../entities/geography.entity';
import { BoundingBoxInput, StopSearchInput } from '../dto/geography.input';
import { QueryOptimizationService } from './query-optimization.service';

interface GtfsStopRow {
  id: number;
  stop_id: string;
  stop_name: string;
  stop_desc: string | null;
  stop_lat: number;
  stop_lon: number;
}

@Injectable()
export class BusStopService {
  private readonly logger = new Logger(BusStopService.name);

  constructor(
    private prisma: PrismaService,
    private postGIS: PostGISService,
    private queryOptimization: QueryOptimizationService,
  ) {}

  async searchBusStops(input?: StopSearchInput): Promise<BusStop[]> {
    let stops;

    if (input?.searchTerm) {
      stops = await this.postGIS.searchStops(
        input.searchTerm,
        input.limit || 50,
      );
    } else if (input?.bounds) {
      stops = await this.postGIS.findStopsInBounds(
        input.bounds.minLat,
        input.bounds.maxLat,
        input.bounds.minLng,
        input.bounds.maxLng,
        input.limit || 100,
      );
    } else {
      // Return a limited set of all stops
      stops = await this.postGIS.findStopsInBounds(-90, 90, -180, 180, 100);
    }

    // Batch check which stops are subway stations for efficiency
    const stopIdList = stops.map((s) => s.stop_id);
    const subwayStopIds = await this.batchCheckSubwayStations(stopIdList);
    const stopAgencies = await this.batchGetStopAgencies(stopIdList);

    return stops.map((stop) => ({
      id: stop.stop_id,
      stopId: stop.stop_id,
      name: stop.stop_name,
      description: stop.stop_desc || undefined,
      latitude: stop.stop_lat,
      longitude: stop.stop_lon,
      isSubwayStation: subwayStopIds.has(stop.stop_id),
      agencies: stopAgencies.get(stop.stop_id),
      geometry: {
        type: 'Point',
        coordinates: [[stop.stop_lon, stop.stop_lat]],
      },
    }));
  }

  async getAllBusStops(): Promise<BusStop[]> {
    return this.searchBusStops();
  }

  async getBusStopsInBounds(bounds: BoundingBoxInput): Promise<BusStop[]> {
    return this.searchBusStops({ bounds });
  }

  async getBusStop(id: string): Promise<BusStop | null> {
    this.logger.debug(`getBusStop called with stop_id: "${id}"`);
    this.logger.debug(`Trying to find by GTFS stop_id: "${id}"`);
    const stopsByStopId = await this.prisma.$queryRaw<GtfsStopRow[]>`
      SELECT id, stop_id, stop_name, stop_desc, stop_lat, stop_lon
      FROM "SPTrans_Stop"
      WHERE stop_id = ${id}
      LIMIT 1
    `;
    const stop = stopsByStopId[0];
    if (stop) {
      this.logger.debug(
        `Found by GTFS stop_id - stop_id: ${stop.stop_id}, name: "${stop.stop_name}"`,
      );
    }

    if (!stop) {
      return null;
    }

    // Determine if this is a subway station by checking if it serves subway routes
    const isSubwayStation = await this.isStopSubwayStation(stop.stop_id);

    // Get agencies and route short names if it's a subway station
    let agencies: string[] | undefined;
    let routeShortNames: string[] | undefined;
    if (isSubwayStation) {
      const routeInfoMap = await this.batchGetStopRouteInfo([stop.stop_id]);
      const info = routeInfoMap.get(stop.stop_id);
      if (info) {
        agencies = info.agencies;
        routeShortNames = info.routeShortNames;
      }
    }

    return {
      id: stop.stop_id,
      stopId: stop.stop_id,
      name: stop.stop_name,
      description: stop.stop_desc || undefined,
      latitude: stop.stop_lat,
      longitude: stop.stop_lon,
      isSubwayStation,
      agencies,
      routeShortNames,
      geometry: {
        type: 'Point',
        coordinates: [[stop.stop_lon, stop.stop_lat]],
      },
    };
  }

  async isStopSubwayStation(stopId: string): Promise<boolean> {
    const subwayStops = await this.batchCheckSubwayStations([stopId]);
    return subwayStops.has(stopId);
  }

  async batchCheckSubwayStations(stopIds: string[]): Promise<Set<string>> {
    return this.queryOptimization.batchCheckSubwayStations(stopIds);
  }

  /**
   * Gets the agencies serving each stop in a batch (for backward compatibility)
   * @param stopIds - Array of stop IDs to check
   * @returns Map of stop_id to array of agency identifiers
   */
  async batchGetStopAgencies(
    stopIds: string[],
  ): Promise<Map<string, string[]>> {
    return this.queryOptimization.batchGetStopAgencies(stopIds);
  }

  /**
   * Gets the agencies and route short names serving each stop in a batch
   * @param stopIds - Array of stop IDs to check
   * @returns Map of stop_id to { agencies, routeShortNames }
   */
  async batchGetStopRouteInfo(
    stopIds: string[],
  ): Promise<Map<string, { agencies: string[]; routeShortNames: string[] }>> {
    const serviceInfo =
      await this.queryOptimization.batchGetStopServiceInfo(stopIds);
    return new Map(
      Array.from(serviceInfo.entries())
        .filter(([, info]) => info.servesRail)
        .map(([stopId, info]) => [
          stopId,
          {
            agencies: info.agencies,
            routeShortNames: info.railRouteShortNames,
          },
        ]),
    );
  }
}
