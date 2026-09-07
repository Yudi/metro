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
  hardNormalizeString,
  RAIL_LINES,
  RailLineInfo,
  TransitAgency,
} from '@metro/shared/utils';
import { BikePollingService } from '../../bike/services/bike-polling.service';

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
      // Exclude GTFS rail routes (METRÔ% and CPTM%)
      // These are now handled by GeoSampa rail data
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

  /**
   * Search GeoSampa rail stations (wrapper for RailStationService)
   */
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

  /**
   * Search nearby GeoSampa rail stations (wrapper for RailStationService)
   */
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
      // Get all metro and train lines from db, remap to RouteDocument format, and index in Typesense
      const allMetroLines = await this.prisma.$queryRaw<
        Array<{
          lmt_nome: string | null;
          lmt_linom: string | null;
          lmt_empres: string | null;
          lmt_linha: number | null;
        }>
      >`
        SELECT lmt_nome, lmt_linom, lmt_empres, lmt_linha
        FROM external_gpkg.metro_line
      `;
      const allTrainLines = await this.prisma.$queryRaw<
        Array<{
          nr_linha: number | null;
          nm_linha: string | null;
          empresa: string | null;
        }>
      >`
        SELECT nr_linha, nm_linha, empresa
        FROM external_gpkg.trem_line
      `;
      const dbLines: RailLineInfo[] = [];

      allMetroLines.forEach((line) => {
        dbLines.push({
          code: line.lmt_linha || 0,
          lineId: line.lmt_linha ? line.lmt_linha.toString() : 'null',
          fullName: line.lmt_linom || 'null',
          colorHex: '#000000',
          colorName: line.lmt_nome || 'null',
          agency: (line.lmt_empres || 'null') as TransitAgency,
          stations: [],
          carCount: 0,
          carDoorCount: 0,
        });
      });

      allTrainLines.forEach((line) => {
        dbLines.push({
          code: line.nr_linha || 0,
          lineId: line.nr_linha ? line.nr_linha.toString() : 'null',
          fullName: `Linha ${line.nr_linha} - ${line.nr_linha}`,
          colorHex: '#000000',
          colorName: line.nm_linha || 'null',
          agency: (line.empresa || 'null') as TransitAgency,
          stations: [],
          carCount: 0,
          carDoorCount: 0,
        });
      });

      const finalRailLines = [...RAIL_LINES];
      dbLines.forEach((line) => {
        if (
          !finalRailLines.some(
            (existingLine) => existingLine.code === line.code,
          )
        ) {
          finalRailLines.push(line);
        }
      });

      const lineDocuments: LineDocument[] = finalRailLines.map((line) => ({
        id: line.code.toString(),
        line_code: line.code.toString(),
        line_fullname: line.fullName,
        agency: line.agency,
      }));

      await this.typesenseService.indexRailLines(lineDocuments);
      this.logger.debug(`Indexed ${lineDocuments.length} rail lines`);
    } catch (error) {
      this.logger.error(
        `Failed to index rail lines: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async indexRailStations(): Promise<void> {
    try {
      const stations = await this.railStationService.getAllRailStations();

      // Build a map from normalized station name to its Typesense document.
      // This lets us merge DB stations with the static list (RAIL_LINES) and
      // still index static-only stations.
      const stationDocsByNormalizedName = new Map<string, StationDocument>();

      // Start with stations present in the DB (have coordinates)
      stations.forEach((station) => {
        const normalizedName = hardNormalizeString(station.name);

        // Find matching static stations to attach aliases and codes
        const matchingStaticStations = RAIL_LINES.flatMap((line) =>
          line.stations.filter((staticStation) => {
            const normalizedStaticName = hardNormalizeString(
              staticStation.name,
            );
            const normalizedAlternativeNames = (
              staticStation.alternativeNames ?? []
            ).map(hardNormalizeString);

            return (
              normalizedName === normalizedStaticName ||
              normalizedAlternativeNames.includes(normalizedName)
            );
          }),
        );

        const stationCodes = Array.from(
          new Set(
            matchingStaticStations.map((staticStation) => staticStation.code),
          ),
        );
        const sortedStationCodes = [...stationCodes].sort();
        const matchingLineCodes = RAIL_LINES.filter((line) =>
          line.stations.some((staticStation) =>
            matchingStaticStations.includes(staticStation),
          ),
        ).map((line) => line.code);

        const aliases = Array.from(
          new Set([
            station.name,
            station.id,
            ...station.lines,
            ...sortedStationCodes,
            ...matchingStaticStations.flatMap((staticStation) => [
              staticStation.name,
              ...(staticStation.alternativeNames ?? []),
            ]),
            ...RAIL_LINES.filter((line) =>
              line.stations.some((staticStation) =>
                matchingStaticStations.includes(staticStation),
              ),
            ).flatMap((line) => [line.colorName, line.lineId, line.fullName]),
          ]),
        );

        const canonicalStationName = getCanonicalRailStationName(
          station.name,
          matchingLineCodes,
        );
        const stationKey = station.id;

        stationDocsByNormalizedName.set(normalizedName, {
          id: stationKey,
          station_code: stationKey,
          station_name: canonicalStationName,
          station_aliases: aliases,
          location: [station.latitude, station.longitude],
        });
      });

      // Add any static-only stations from RAIL_LINES that don't exist in the DB
      // When deciding whether a station already exists, consider the normalized
      // alternative names in RAIL_LINES too (so we don't duplicate stations when
      // the DB name matches a static station's alt name).
      RAIL_LINES.forEach((line) => {
        line.stations.forEach((staticStation) => {
          const normalizedStaticName = hardNormalizeString(staticStation.name);
          const normalizedAlternativeNames = (
            staticStation.alternativeNames ?? []
          ).map(hardNormalizeString);

          const alreadyIndexed = [
            normalizedStaticName,
            ...normalizedAlternativeNames,
          ].some((normalized) => stationDocsByNormalizedName.has(normalized));

          if (!alreadyIndexed) {
            stationDocsByNormalizedName.set(normalizedStaticName, {
              id: staticStation.code,
              station_code: staticStation.code,
              station_name: staticStation.name,
              station_aliases: [
                ...(staticStation.alternativeNames ?? []),
                line.colorName,
                line.lineId,
                line.fullName,
              ],
              // No location available for static-only stations
            });
          }
        });
      });

      const stationDocuments = Array.from(stationDocsByNormalizedName.values());

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
