import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  formatTypesenseError,
  TypesenseService,
  BikeStationDocument,
  RouteDocument,
  StopDocument,
  LineDocument,
  StationDocument,
} from './typesense.service';
import { RailStationService } from '../../geography/services/rail-station.service';
import { QueryOptimizationService } from '../../geography/services/query-optimization.service';
import {
  getCanonicalRailStationName,
  getLineCodesFromColorNames,
  hardNormalizeString,
  RAIL_LINES,
} from '@metro/shared/utils';
import { BikePollingService } from '../../bike/services/bike-polling.service';
import {
  GPKG_LINES_COLLECTION_NAME,
  GPKG_STATIONS_COLLECTION_NAME,
} from './typesense-schemas';
import { railRoutesSql } from '../../rail-import/services/rail-route-interop.sql';

import {
  BusRouteRow,
  BusStopRow,
  mapBusRoute,
  mapBusStop,
} from '../../geography/services/bus-catalog.utils';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseService: TypesenseService,
    private readonly railStationService: RailStationService,
    private readonly queryOptimization: QueryOptimizationService,
    private readonly bikePollingService: BikePollingService,
  ) {}

  async indexAllData(): Promise<void> {
    this.logger.debug('Starting full data indexing...');

    await this.typesenseService.beginFullRebuild();
    try {
      await this.indexRoutes();
      await this.indexStops();
      await this.indexRailLines();
      await this.indexRailStations();
      await this.indexBikeStations();
      await this.typesenseService.finishFullRebuild();
      this.logger.debug('Full data indexing completed successfully');
    } catch (error) {
      await this.typesenseService.discardFullRebuild();
      this.logger.error(
        `Full data indexing failed: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async indexRoutes(): Promise<void> {
    try {
      // Rail routes are indexed through the selected rail catalog.
      const routes = await this.prisma.$queryRaw<BusRouteRow[]>`
        SELECT r.*,
          COALESCE((
            SELECT jsonb_agg(fare ORDER BY fare->>'currency', (fare->>'price')::numeric)
            FROM (
              SELECT DISTINCT jsonb_build_object('price', fa.price, 'currency', fa.currency_type) AS fare
              FROM public."Gtfs_FareRule" fr
              JOIN public."Gtfs_FareAttribute" fa ON fa.fare_id = fr.fare_id
              WHERE fr.route_id = r.route_id
            ) fares
          ), '[]'::jsonb) AS fares
        FROM public."Gtfs_Route" r
        WHERE r.route_type NOT IN (1, 2)
          AND r.route_id NOT LIKE 'METRÔ%' AND r.route_id NOT LIKE 'CPTM%'
        ORDER BY CASE r.source_agency WHEN 'sptrans' THEN 0 ELSE 1 END, r.route_id
      `;

      const routeDocuments: RouteDocument[] = routes.map((row) => {
        const route = mapBusRoute(row);
        return {
          id: route.routeId,
          route_id: route.routeId,
          agency_id: row.agency_id ?? '',
          sourceAgency: route.sourceAgency,
          sourceId: route.sourceId,
          supportsRealtime: route.supportsRealtime,
          faresJson: JSON.stringify(route.fares),
          route_short_name: route.shortName,
          route_long_name: route.longName,
          route_type: route.routeType,
          route_color: route.color,
          route_text_color: route.textColor,
        };
      });

      await this.typesenseService.indexRoutes(routeDocuments);
      this.logger.debug(
        `Indexed ${routeDocuments.length} bus routes (excluded GTFS rail)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to index routes: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async indexStops(): Promise<void> {
    try {
      const stops = await this.prisma.$queryRaw<BusStopRow[]>`
        SELECT s.*, COALESCE(members.ids, ARRAY[s.stop_id]) AS merged_stop_ids
        FROM public."Gtfs_Stop" s
        LEFT JOIN public.physical_stop_members membership ON membership.source_stop_id = s.stop_id
        LEFT JOIN LATERAL (
          SELECT array_agg(member.source_stop_id ORDER BY member.source_stop_id) AS ids
          FROM public.physical_stop_members member
          WHERE member.physical_stop_id = s.stop_id
        ) members ON true
        WHERE membership.physical_stop_id IS NULL OR membership.physical_stop_id = s.stop_id
      `;

      const stopIds = stops.map((s) => s.stop_id);
      const serviceInfo =
        await this.queryOptimization.batchGetStopServiceInfo(stopIds);

      // Filter out rail-only stops from indexing
      const stopsToIndex = stops.filter((stop) => {
        const info = serviceInfo.get(stop.stop_id);
        return !(info?.servesRail && !info.servesBus);
      });

      const stopDocuments: StopDocument[] = stopsToIndex.map((row) => {
        const stop = mapBusStop(row, serviceInfo.get(row.stop_id));
        return {
          id: stop.stopId,
          stop_id: stop.stopId,
          sourceAgency: stop.sourceAgency,
          sourceId: stop.sourceId,
          platformCode: stop.platformCode,
          mergedStopIds: stop.mergedStopIds,
          agencies: stop.agencies ?? [],
          stop_name: stop.name,
          stop_desc: stop.description,
          stop_lat: stop.latitude,
          stop_lon: stop.longitude,
          is_subway_station: stop.isSubwayStation,
        };
      });

      await this.typesenseService.indexStops(stopDocuments);
      this.logger.debug(
        `Indexed ${stopDocuments.length} stops (excluded ${stops.length - stopsToIndex.length} rail-only stops)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to index stops: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async indexBikeStations(): Promise<void> {
    try {
      const payload = await this.bikePollingService.getLatestPayload();
      const stationDocuments: BikeStationDocument[] = payload.stations.map(
        (station) => ({
          id: station.stationId,
          station_id: station.stationId,
          station_name: station.name,
          location: [station.latitude, station.longitude],
        }),
      );

      await this.typesenseService.indexBikeStations(stationDocuments);
      this.logger.debug(`Indexed ${stationDocuments.length} bike stations`);
    } catch (error) {
      this.logger.error(
        `Failed to index bike stations: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async searchRailStations(searchTerm: string, limit = 20) {
    try {
      return await this.railStationService.searchRailStations(
        searchTerm,
        limit,
      );
    } catch (error) {
      this.logger.error(
        `Failed to search rail stations: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async searchNearbyRailStations(
    latitude: number,
    longitude: number,
    radiusMeters = 1000,
    limit = 20,
  ) {
    try {
      return await this.railStationService.searchNearbyRailStations(
        latitude,
        longitude,
        radiusMeters,
        limit,
      );
    } catch (error) {
      this.logger.error(
        `Failed to search nearby rail stations: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async indexRailLines(): Promise<void> {
    try {
      const selectedLines = await this.prisma.$queryRaw<
        Array<{
          id: number;
          line_number: number;
          name: string;
          agency: string;
        }>
      >`
        ${railRoutesSql()}
        SELECT id, line_number, name, agency
        FROM selected_rail_routes
        ORDER BY line_number
      `;

      const lineDocuments: LineDocument[] = selectedLines.map((line) => ({
        id: String(line.id),
        line_code: String(line.line_number),
        line_fullname: line.name,
        agency: line.agency,
      }));

      await this.typesenseService.indexRailLines(lineDocuments);
      this.logger.debug(
        `Indexed ${lineDocuments.length} selected rail lines`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to index rail lines: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async rebuildRailData(): Promise<void> {
    await this.typesenseService.beginFullRebuild([
      GPKG_LINES_COLLECTION_NAME,
      GPKG_STATIONS_COLLECTION_NAME,
    ]);

    try {
      await this.indexRailLines();
      await this.indexRailStations();
      await this.typesenseService.finishFullRebuild();
      this.logger.debug('Selected rail search collections rebuilt');
    } catch (error) {
      await this.typesenseService.discardFullRebuild();
      this.logger.error(
        `Selected rail search rebuild failed: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async indexRailStations(): Promise<void> {
    try {
      const stations = await this.prisma.mergedRailStation.findMany();
      const stationDocuments: StationDocument[] = stations.map((station) => {
        const lineCodes = getLineCodesFromColorNames(station.lines);
        const selectedLines = RAIL_LINES.filter((line) =>
          lineCodes.includes(line.code),
        );
        const normalizedNames = new Set(
          [station.name, station.originalName].map(hardNormalizeString),
        );
        const matchingStaticStations = selectedLines.flatMap((line) =>
          line.stations.filter((staticStation) =>
            [staticStation.name, ...(staticStation.alternativeNames ?? [])]
              .map(hardNormalizeString)
              .some((name) => normalizedNames.has(name)),
          ),
        );
        const stationCode = station.primaryId.toString();
        const aliases = new Set([
          station.name,
          station.originalName,
          stationCode,
          ...station.mergedIds.map(String),
          ...station.lines,
          ...selectedLines.flatMap((line) => [
            line.colorName,
            line.lineId,
            line.fullName,
          ]),
          ...matchingStaticStations.flatMap((staticStation) => [
            staticStation.code,
            staticStation.name,
            ...(staticStation.alternativeNames ?? []),
          ]),
        ]);

        return {
          id: stationCode,
          station_code: stationCode,
          station_name:
            lineCodes.length > 0
              ? getCanonicalRailStationName(station.name, lineCodes)
              : station.name,
          station_aliases: Array.from(aliases),
          location: [station.latitude, station.longitude],
        };
      });

      await this.typesenseService.indexRailStations(stationDocuments);
      this.logger.debug(`Indexed ${stationDocuments.length} rail stations`);
    } catch (error) {
      this.logger.error(
        `Failed to index rail stations: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async clearIndex(): Promise<void> {
    await this.typesenseService.clearIndex();
  }
}
