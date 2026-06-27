import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { haversineDistanceKm } from '../../common/utils/geo-distance.util';
import { BusStop } from '../entities/geography.entity';
import { BusStopService } from './bus-stop.service';
import {
  normalizeStationName,
  SAO_PAULO_CITY_CENTER,
  shouldMergeStations,
} from '@metro/shared/utils';

@Injectable()
export class SubwayStationService {
  private readonly logger = new Logger(SubwayStationService.name);

  constructor(
    private prisma: PrismaService,
    private busStopService: BusStopService
  ) {}

  async getSubwayStations(): Promise<BusStop[]> {
    this.logger.debug(
      'getSubwayStations called - using GTFS route relationships'
    );

    // First, let's see what subway/metro routes exist
    const subwayRoutes = await this.prisma.$queryRaw<
      Array<{
        route_id: string;
        route_short_name: string;
        route_long_name: string;
      }>
    >`
      SELECT DISTINCT route_id, route_short_name, route_long_name
      FROM "SPTrans_Route"
      WHERE (route_id LIKE 'METRÔ%' OR route_id LIKE 'CPTM%')
      ORDER BY route_short_name
    `;
    this.logger.debug(
      `Found subway/metro routes: ${JSON.stringify(subwayRoutes)}`
    );

    // Query for subway/metro stations by finding stops that serve routes with "METRÔ" or "CPTM" prefixes
    const stopData = await this.prisma.$queryRaw<
      Array<{
        id: number;
        stop_id: string;
        stop_name: string;
        stop_desc: string | null;
        stop_lat: number;
        stop_lon: number;
      }>
    >`
      SELECT DISTINCT s.id, s.stop_id, s.stop_name, s.stop_desc, s.stop_lat, s.stop_lon
      FROM "SPTrans_Stop" s
      INNER JOIN "SPTrans_StopTime" st ON s.stop_id = st.stop_id
      INNER JOIN "SPTrans_Trip" t ON st.trip_id = t.trip_id
      INNER JOIN "SPTrans_Route" r ON t.route_id = r.route_id
      WHERE (r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')
      ORDER BY s.stop_name
    `;

    // Transform the data to match BusStop interface
    const stopIdList = stopData.map((s) => s.stop_id);
    const stopRouteInfo = await this.busStopService.batchGetStopRouteInfo(
      stopIdList
    );

    const rawStations: BusStop[] = stopData.map((stop) => {
      const info = stopRouteInfo.get(stop.stop_id);
      return {
        id: stop.stop_id,
        stopId: stop.stop_id,
        name: stop.stop_name,
        description: stop.stop_desc || undefined,
        latitude: stop.stop_lat,
        longitude: stop.stop_lon,
        isSubwayStation: true,
        agencies: info?.agencies,
        routeShortNames: info?.routeShortNames,
        geometry: {
          type: 'Point',
          coordinates: [[stop.stop_lon, stop.stop_lat]],
        },
      };
    });

    // Merge stations with identical names (intermodal stations)
    const mergedStations = this.mergeIdenticalStations(
      rawStations,
      SAO_PAULO_CITY_CENTER.latitude,
      SAO_PAULO_CITY_CENTER.longitude
    );

    return mergedStations;
  }

  private mergeIdenticalStations(
    stations: BusStop[],
    referenceLat: number,
    referenceLon: number
  ): BusStop[] {
    // Group stations by flexible name matching
    const stationGroups = new Map<string, BusStop[]>();

    stations.forEach((station) => {
      const normalizedName = this.normalizeStationNameLocal(station.name);

      // Check if this station should be grouped with an existing group
      let groupKey: string | null = null;

      for (const [existingKey, existingGroup] of stationGroups.entries()) {
        const existingStation = existingGroup[0];
        if (shouldMergeStations(station.name, existingStation.name)) {
          groupKey = existingKey;
          break;
        }
      }

      // If no matching group found, create a new key. When the normalized name
      // is already in use by a non-mergeable station, disambiguate the key so
      // the stations remain separate.
      if (!groupKey) {
        groupKey = normalizedName;

        if (stationGroups.has(groupKey)) {
          let suffix = 2;
          while (stationGroups.has(`${normalizedName}::${suffix}`)) {
            suffix += 1;
          }
          groupKey = `${normalizedName}::${suffix}`;
        }
      }

      if (!stationGroups.has(groupKey)) {
        stationGroups.set(groupKey, []);
      }
      const group = stationGroups.get(groupKey);
      if (group) {
        group.push(station);
      }
    });

    const mergedStations: BusStop[] = [];

    stationGroups.forEach((group) => {
      if (group.length === 1) {
        // Single station, no merging needed
        mergedStations.push(group[0]);
      } else {
        // Multiple stations with same name - merge them

        // Find the station closest to reference coordinates
        const closestStation = group.reduce((closest, current) => {
          const closestDistance = haversineDistanceKm(
            closest.latitude,
            closest.longitude,
            referenceLat,
            referenceLon
          );
          const currentDistance = haversineDistanceKm(
            current.latitude,
            current.longitude,
            referenceLat,
            referenceLon
          );
          return currentDistance < closestDistance ? current : closest;
        });

        // Merge agencies from all stations in the group
        const allAgencies = new Set<string>();
        group.forEach((station) => {
          if (station.agencies && station.agencies.length > 0) {
            station.agencies.forEach((agency) => allAgencies.add(agency));
          }
        });

        // Merge routeShortNames from all stations in the group
        const allRouteShortNames = new Set<string>();
        group.forEach((station) => {
          if (station.routeShortNames && station.routeShortNames.length > 0) {
            station.routeShortNames.forEach((name) =>
              allRouteShortNames.add(name)
            );
          }
        });

        // Create merged station with combined agencies and routeShortNames
        const mergedStation: BusStop = {
          ...closestStation,
          agencies: Array.from(allAgencies).sort(),
          routeShortNames: Array.from(allRouteShortNames).sort(),
        };

        // Use the merged station as the representative
        mergedStations.push(mergedStation);
      }
    });

    return mergedStations;
  }

  /**
   * Normalizes a station name for comparison by removing common suffixes and trimming
   */
  private normalizeStationNameLocal(name: string): string {
    return normalizeStationName(name).toLowerCase();
  }

}
