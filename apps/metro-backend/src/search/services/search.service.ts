import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
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

interface GtfsRouteRow {
  id: number;
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

interface GtfsStopRow {
  id: number;
  stop_id: string;
  stop_name: string;
  stop_desc: string | null;
  stop_lat: number;
  stop_lon: number;
}

interface GtfsTripRow {
  id: number;
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign: string;
  direction_id: number;
  shape_id: string;
}

interface GtfsCalendarRow {
  id: number;
  service_id: string;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
  start_date: string;
  end_date: string;
}

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

    try {
      await this.typesenseService.clearTransitData();
      await this.indexRoutes();
      await this.indexStops();
      await this.indexRailLines();
      await this.indexRailStations();
      await this.indexBikeStations();
      this.logger.debug('Full data indexing completed successfully');
    } catch (error) {
      this.logger.error('Full data indexing failed:', error);
      throw error;
    }
  }

  async indexRoutes(): Promise<void> {
    try {
      // Exclude GTFS rail routes (METRÔ% and CPTM%)
      // These are now handled by GeoSampa rail data
      const routes = await this.prisma.$queryRaw<GtfsRouteRow[]>`
        SELECT id, route_id, agency_id, route_short_name, route_long_name, route_type, route_color, route_text_color
        FROM "SPTrans_Route"
        WHERE route_id NOT LIKE 'METRÔ%'
        AND route_id NOT LIKE 'CPTM%'
      `;

      const routeDocuments: RouteDocument[] = routes.map((route) => ({
        id: route.route_id,
        route_id: route.route_id,
        agency_id: route.agency_id,
        route_short_name: route.route_short_name,
        route_long_name: route.route_long_name,
        route_type: route.route_type,
        route_color: route.route_color,
        route_text_color: route.route_text_color,
      }));

      await this.typesenseService.indexRoutes(routeDocuments);
      this.logger.debug(
        `Indexed ${routeDocuments.length} bus routes (excluded GTFS rail)`,
      );
    } catch (error) {
      this.logger.error('Failed to index routes:', error);
      throw error;
    }
  }

  async indexStops(): Promise<void> {
    try {
      const stops = await this.prisma.$queryRaw<GtfsStopRow[]>`
        SELECT id, stop_id, stop_name, stop_desc, stop_lat, stop_lon
        FROM "SPTrans_Stop"
      `;

      const stopIds = stops.map((s) => s.stop_id);

      // Get stops that serve ONLY rail routes (to exclude them)
      const railOnlyStopIds =
        await this.queryOptimization.getRailOnlyStops(stopIds);

      // Batch check which stops are subway stations (for remaining stops)
      const subwayStopIds =
        await this.queryOptimization.batchCheckSubwayStations(stopIds);

      // Filter out rail-only stops from indexing
      const stopsToIndex = stops.filter(
        (stop) => !railOnlyStopIds.has(stop.stop_id),
      );

      const stopDocuments: StopDocument[] = stopsToIndex.map((stop) => ({
        id: stop.stop_id,
        stop_id: stop.stop_id,
        stop_name: stop.stop_name,
        stop_desc: stop.stop_desc || undefined,
        stop_lat: stop.stop_lat,
        stop_lon: stop.stop_lon,
        is_subway_station: subwayStopIds.has(stop.stop_id),
      }));

      await this.typesenseService.indexStops(stopDocuments);
      this.logger.debug(
        `Indexed ${stopDocuments.length} stops (excluded ${railOnlyStopIds.size} rail-only stops)`,
      );
    } catch (error) {
      this.logger.error('Failed to index stops:', error);
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
      this.logger.error('Failed to index bike stations:', error);
      throw error;
    }
  }

  async getRouteDetails(routeId: string) {
    try {
      const routes = await this.prisma.$queryRaw<GtfsRouteRow[]>`
        SELECT id, route_id, agency_id, route_short_name, route_long_name, route_type, route_color, route_text_color
        FROM "SPTrans_Route"
        WHERE route_id = ${routeId}
        LIMIT 1
      `;
      const route = routes[0];

      if (!route) {
        return null;
      }

      // Get all trips for this route
      const trips = await this.prisma.$queryRaw<GtfsTripRow[]>`
        SELECT id, route_id, service_id, trip_id, trip_headsign, direction_id, shape_id
        FROM "SPTrans_Trip"
        WHERE route_id = ${routeId}
      `;

      // Get calendar information for these trips
      const serviceIds = [...new Set(trips.map((trip) => trip.service_id))];
      const calendars = await this.prisma.$queryRaw<GtfsCalendarRow[]>`
        SELECT id, service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date
        FROM "SPTrans_Calendar"
        WHERE service_id = ANY(${serviceIds}::text[])
      `;

      // Group trips by direction and service
      const tripsByDirection = trips.reduce(
        (acc, trip) => {
          const key = `${trip.direction_id}-${trip.service_id}`;
          if (!acc[key]) {
            acc[key] = [];
          }
          acc[key].push(trip);
          return acc;
        },
        {} as Record<string, typeof trips>,
      );

      return {
        route,
        trips: tripsByDirection,
        calendars,
        totalTrips: trips.length,
      };
    } catch (error) {
      this.logger.error(`Failed to get route details for ${routeId}:`, error);
      throw error;
    }
  }

  async getStopDetails(stopId: string) {
    try {
      const stops = await this.prisma.$queryRaw<GtfsStopRow[]>`
        SELECT id, stop_id, stop_name, stop_desc, stop_lat, stop_lon
        FROM "SPTrans_Stop"
        WHERE stop_id = ${stopId}
        LIMIT 1
      `;
      const stop = stops[0];

      if (!stop) {
        return null;
      }

      // Get all stop times for this stop
      const stopTimes = await this.prisma.$queryRaw<
        Array<{
          id: number;
          trip_id: string;
          arrival_time: string;
          departure_time: string;
          stop_id: string;
          stop_sequence: number;
        }>
      >`
        SELECT id, trip_id, arrival_time, departure_time, stop_id, stop_sequence
        FROM "SPTrans_StopTime"
        WHERE stop_id = ${stopId}
        LIMIT 100
      `;

      // Get unique trip IDs
      const tripIds = [...new Set(stopTimes.map((st) => st.trip_id))];

      // Get trips for the stop
      const trips = await this.prisma.$queryRaw<GtfsTripRow[]>`
        SELECT id, route_id, service_id, trip_id, trip_headsign, direction_id, shape_id
        FROM "SPTrans_Trip"
        WHERE trip_id = ANY(${tripIds}::text[])
      `;

      // Get calendar information
      const serviceIds = [...new Set(trips.map((trip) => trip.service_id))];
      const calendars = await this.prisma.$queryRaw<GtfsCalendarRow[]>`
        SELECT id, service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date
        FROM "SPTrans_Calendar"
        WHERE service_id = ANY(${serviceIds}::text[])
      `;

      return {
        stop,
        trips,
        calendars,
        stopTimes: stopTimes.slice(0, 20), // Limit displayed stop times
      };
    } catch (error) {
      this.logger.error(`Failed to get stop details for ${stopId}:`, error);
      throw error;
    }
  }

  async getRouteShape(routeId: string) {
    try {
      // Get trips for this route to find shape IDs
      const trips = await this.prisma.$queryRaw<Array<{ shape_id: string }>>`
        SELECT DISTINCT shape_id
        FROM "SPTrans_Trip"
        WHERE route_id = ${routeId}
      `;

      if (trips.length === 0) {
        return null;
      }

      // Get shape data from PostGIS
      const shapeIds = trips.map((trip) => trip.shape_id);
      const shapes = (await this.prisma.$queryRaw`
        SELECT shape_id, ST_AsGeoJSON(geom) as geojson
        FROM "SPTrans_Shape"
        WHERE shape_id = ANY(${shapeIds})
      `) as Array<{ shape_id: string; geojson: string }>;

      return shapes.map((shape) => ({
        shape_id: shape.shape_id,
        geometry: JSON.parse(shape.geojson),
      }));
    } catch (error) {
      this.logger.error(`Failed to get route shape for ${routeId}:`, error);
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
      this.logger.error(`Failed to search rail stations:`, error);
      return [];
    }
  }

  /**
   * Search rail lines by name, color, or line ID
   * Returns matching rail lines from RAIL_LINES constant
   */
  async searchRailLines(searchTerm: string) {
    try {
      const lowerSearchTerm = searchTerm.toLowerCase().trim();

      // Search in fullName, colorName, lineId
      return RAIL_LINES.filter((line) => {
        return (
          line.fullName.toLowerCase().includes(lowerSearchTerm) ||
          line.colorName.toLowerCase().includes(lowerSearchTerm) ||
          line.lineId.toLowerCase().includes(lowerSearchTerm) ||
          line.code.toString() === lowerSearchTerm
        );
      });
    } catch (error) {
      this.logger.error(`Failed to search rail lines:`, error);
      return [];
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
      this.logger.error(`Failed to search nearby rail stations:`, error);
      return [];
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
      this.logger.error('Failed to index rail lines:', error);
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
      this.logger.error('Failed to index rail stations:', error);
    }
  }

  async clearIndex(): Promise<void> {
    await this.typesenseService.clearIndex();
  }
}
