import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PostGISService } from './postgis.service';
import { BusStop } from '../entities/geography.entity';
import { BoundingBoxInput, StopSearchInput } from '../dto/geography.input';
import { getUniqueAgencies } from '@metro/shared/utils';

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
    // Check if this stop serves any subway routes (METRÔ or CPTM)
    const subwayRoutes = await this.prisma.$queryRaw<
      Array<{ route_id: string }>
    >`
      SELECT DISTINCT r.route_id
      FROM "SPTrans_Route" r
      INNER JOIN "SPTrans_Trip" t ON r.route_id = t.route_id
      INNER JOIN "SPTrans_StopTime" st ON t.trip_id = st.trip_id
      WHERE st.stop_id = ${stopId}
      AND (r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')
      LIMIT 1
    `;

    return subwayRoutes.length > 0;
  }

  async batchCheckSubwayStations(stopIds: string[]): Promise<Set<string>> {
    if (stopIds.length === 0) {
      return new Set();
    }

    // Efficiently check which stops serve subway routes in a single query
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
   * Gets the agencies serving each stop in a batch (for backward compatibility)
   * @param stopIds - Array of stop IDs to check
   * @returns Map of stop_id to array of agency identifiers
   */
  async batchGetStopAgencies(
    stopIds: string[],
  ): Promise<Map<string, string[]>> {
    const routeInfo = await this.batchGetStopRouteInfo(stopIds);
    const result = new Map<string, string[]>();
    for (const [stopId, info] of routeInfo) {
      result.set(stopId, info.agencies);
    }
    return result;
  }

  /**
   * Gets the agencies and route short names serving each stop in a batch
   * @param stopIds - Array of stop IDs to check
   * @returns Map of stop_id to { agencies, routeShortNames }
   */
  async batchGetStopRouteInfo(
    stopIds: string[],
  ): Promise<Map<string, { agencies: string[]; routeShortNames: string[] }>> {
    if (stopIds.length === 0) {
      return new Map();
    }

    // Get all routes serving these stops
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

    const resultMap = new Map<
      string,
      { agencies: string[]; routeShortNames: string[] }
    >();

    // Group by stop_id
    for (const row of stopRoutes) {
      if (!resultMap.has(row.stop_id)) {
        resultMap.set(row.stop_id, { agencies: [], routeShortNames: [] });
      }
    }

    for (const [stopId] of resultMap) {
      const routesForStop = stopRoutes
        .filter((r) => r.stop_id === stopId)
        .map((r) => r.route_short_name);

      const uniqueRoutes = [...new Set(routesForStop)];
      const agencies = getUniqueAgencies(routesForStop);

      resultMap.set(stopId, {
        agencies,
        routeShortNames: uniqueRoutes,
      });
    }

    return resultMap;
  }
}
