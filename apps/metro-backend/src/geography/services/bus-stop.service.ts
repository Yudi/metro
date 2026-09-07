import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PostGISService } from './postgis.service';
import { BusStop } from '../entities/geography.entity';
import { BoundingBoxInput, StopSearchInput } from '../dto/geography.input';
import { QueryOptimizationService } from './query-optimization.service';
import { mapBusStop } from './bus-catalog.utils';

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
      sourceAgency: 'sptrans' as const,
      sourceId: stop.stop_id,
      name: stop.stop_name,
      description: stop.stop_desc || undefined,
      latitude: stop.stop_lat,
      longitude: stop.stop_lon,
      isSubwayStation: subwayStopIds.has(stop.stop_id),
      platformCode: undefined,
      mergedStopIds: [stop.stop_id],
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
    const stop = await this.queryOptimization.findStopByMultipleCriteria(id);
    if (!stop) {
      return null;
    }

    const physicalStopId = stop.physical_stop_id || stop.stop_id;
    const serviceInfo = await this.queryOptimization.batchGetStopServiceInfo([
      physicalStopId,
    ]);
    return mapBusStop(stop, serviceInfo.get(physicalStopId));
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
