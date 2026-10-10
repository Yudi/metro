import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { haversineDistanceKm } from '../../common/utils/geo-distance.util';
import { SAO_PAULO_CITY } from '@metro/shared/cities';
import {
  getStationDisplayName,
  getCanonicalRailStationName,
  hardNormalizeString,
  isStationMergeException,
  normalizeStationName,
  shouldMergeStations,
  LINE_AGENCY_MAPPING,
  getRailLineByCode,
  parseRailLineCode,
} from '@metro/shared/utils';
import { TransitDataPrecomputeService } from '../../transit-data/transit-data-precompute.service';
import {
  ImportLockService,
  TRANSIT_CATALOG_IMPORT_LOCK,
} from '../../common/import-lock.service';
import { RAIL_DATASETS } from '../../rail-import/config/rail-datasets.config';
import {
  type DatasetRailStation as RawRailStation,
  selectRailStations,
} from '../../rail-import/services/rail-station-interop.utils';

/**
 * Raw station data from the local GeoSampa rail tables.
 */
interface RawRailStationRow {
  id: number;
  name: string;
  line: string;
  line_number: number | null;
  latitude: number;
  longitude: number;
}

/**
 * Processed station ready for database insertion
 */
interface ProcessedRailStation {
  primaryId: number;
  mergedIds: number[];
  name: string;
  originalName: string;
  latitude: number;
  longitude: number;
  agencies: string[];
  lines: string[];
}

@Injectable()
export class RailStationProcessorService {
  private readonly logger = new Logger(RailStationProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transitDataPrecompute: TransitDataPrecomputeService,
    private readonly importLockService: ImportLockService,
  ) {}

  /** Refresh the catalog after a rail dataset import. */
  async refreshMergedStations(): Promise<void> {
    await this.importLockService.withLock(
      TRANSIT_CATALOG_IMPORT_LOCK,
      'GeoSampa rail station refresh',
      () => this.refreshMergedStationsWithinImport(),
    );
  }

  async refreshMergedStationsWithinImport(): Promise<void> {
    this.logger.debug('Starting rail station processing...');

    try {
      const rawStations = await this.fetchRawRailStations();
      this.logger.debug(`Fetched ${rawStations.length} raw rail stations`);

      const mergedStations = this.mergeStations(rawStations);
      this.logger.debug(`Merged into ${mergedStations.length} unique stations`);

      const existingStations = await this.getAllStations();
      if (!this.haveSameStations(existingStations, mergedStations)) {
        await this.persistMergedStations(mergedStations);
      } else {
        this.logger.debug('Merged rail stations are unchanged');
      }

      // This signature-gated refresh also recovers failed post-processing.
      await this.transitDataPrecompute.refreshRouteRailConnections();

      this.logger.debug('Rail station processing completed successfully');
    } catch (error) {
      this.logger.error('Failed to process rail stations:', error);
      throw error;
    }
  }

  /** Select each line's source before merging interchanges. */
  private async fetchRawRailStations(): Promise<RawRailStation[]> {
    const [geosampa, sptrans] = await Promise.all([
      this.fetchGeosampaStations(),
      this.fetchSptransStations(),
    ]);
    return selectRailStations(geosampa, sptrans);
  }

  private async fetchGeosampaStations(): Promise<RawRailStation[]> {
    const stations = await this.prisma.$queryRaw<RawRailStationRow[]>`
      WITH metro_stations AS (
        SELECT 
          ROW_NUMBER() OVER (ORDER BY primaryindex)::INTEGER AS id,
          emt_nome AS name,
          COALESCE(emt_linha, 'UNKNOWN') AS line,
          NULL::SMALLINT AS line_number,
          ST_Y(ST_Transform(geom, 4326)) AS latitude,
          ST_X(ST_Transform(geom, 4326)) AS longitude
        FROM external_gpkg.metro_station
        WHERE emt_situac = 'OPERANDO' OR emt_situac IS NULL
      ),
      trem_stations AS (
        SELECT 
          (100000 + ROW_NUMBER() OVER (ORDER BY primaryindex))::INTEGER AS id,
          estacao AS name,
          COALESCE(nm_linha, nr_linha::TEXT, 'UNKNOWN') AS line,
          nr_linha AS line_number,
          ST_Y(ST_Transform(geom, 4326)) AS latitude,
          ST_X(ST_Transform(geom, 4326)) AS longitude
        FROM external_gpkg.trem_station
        WHERE situacao = 'OPERANDO' OR situacao IS NULL
      )
      SELECT * FROM metro_stations
      UNION ALL
      SELECT * FROM trem_stations
      ORDER BY name
    `;

    return stations.map((station) => ({
      id: station.id,
      name: station.name,
      line: station.line,
      lineCode: parseRailLineCode(station.line, station.line_number) ?? null,
      latitude: station.latitude,
      longitude: station.longitude,
    }));
  }

  private async fetchSptransStations(): Promise<RawRailStation[]> {
    const lineByRouteId = new Map(
      RAIL_DATASETS.flatMap((line) =>
        line.gtfsRouteIds.map((routeId) => [routeId, line.lineCode] as const),
      ),
    );
    const routeIds = [...lineByRouteId.keys()];
    const rows = await this.prisma.$queryRaw<
      Array<{
        stop_id: string;
        stop_name: string;
        stop_lat: number;
        stop_lon: number;
        route_id: string;
      }>
    >`
      SELECT DISTINCT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, t.route_id
      FROM "public"."SPTrans_Stop" s
      INNER JOIN "public"."SPTrans_StopTime" st ON st.stop_id = s.stop_id
      INNER JOIN "public"."SPTrans_Trip" t ON t.trip_id = st.trip_id
      WHERE t.route_id = ANY(${routeIds}::text[])
      ORDER BY s.stop_id, t.route_id
    `;

    // Hash stable provider IDs into a numeric range reserved for SPTrans IDs.
    const stopIdByNumericId = new Map<number, string>();
    return rows.map((row) => {
      const hash = createHash('sha256').update(`sptrans:${row.stop_id}`).digest();
      const id = 1_000_000_000 + (hash.readUInt32BE(0) % 1_000_000_000);
      const existingStopId = stopIdByNumericId.get(id);
      if (existingStopId && existingStopId !== row.stop_id) {
        throw new Error('SPTrans rail station identifier collision');
      }
      stopIdByNumericId.set(id, row.stop_id);
      const lineCode = lineByRouteId.get(row.route_id) ?? null;
      return {
        id,
        name: row.stop_name,
        line: getRailLineByCode(lineCode ?? 0)?.colorName ?? row.route_id,
        lineCode,
        latitude: row.stop_lat,
        longitude: row.stop_lon,
      };
    });
  }

  /**
   * Merge stations with identical normalized names
   */
  private mergeStations(stations: RawRailStation[]): ProcessedRailStation[] {
    // Group stations by mergeable name
    const stationGroups = new Map<string, RawRailStation[]>();

    for (const station of stations) {
      const canonicalName = this.getCanonicalName(station);
      const normalizedName = hardNormalizeString(normalizeStationName(canonicalName));

      if (isStationMergeException(canonicalName)) {
        const groupKey = this.getExceptionStationGroupKey(
          normalizedName,
          station.lineCode,
        );
        const group = stationGroups.get(groupKey);

        if (
          group &&
          haversineDistanceKm(
            station.latitude,
            station.longitude,
            group[0].latitude,
            group[0].longitude,
          ) <= 0.5
        ) {
          group.push(station);
        } else {
          stationGroups.set(
            group ? `${groupKey}::station:${station.id}` : groupKey,
            [station],
          );
        }

        continue;
      }

      // Find existing group that should be merged with this station
      let groupKey: string | null = null;

      for (const [existingKey, existingGroup] of stationGroups.entries()) {
        const existingStation = existingGroup[0];
        if (
          shouldMergeStations(canonicalName, this.getCanonicalName(existingStation)) &&
          haversineDistanceKm(
            station.latitude,
            station.longitude,
            existingStation.latitude,
            existingStation.longitude,
          ) <= 0.5
        ) {
          groupKey = existingKey;
          break;
        }
      }

      // Use normalized name as key if no existing group found
      if (!groupKey) {
        groupKey = normalizedName;
        if (stationGroups.has(groupKey)) {
          groupKey = `${normalizedName}::station:${station.id}`;
        }
      }

      const group = stationGroups.get(groupKey);
      if (group) {
        group.push(station);
      } else {
        stationGroups.set(groupKey, [station]);
      }
    }

    // Process each group into a merged station
    const mergedStations: ProcessedRailStation[] = [];

    for (const group of stationGroups.values()) {
      if (group.length === 1) {
        // Single station, no merging needed
        const station = group[0];
        const agency = station.lineCode
          ? LINE_AGENCY_MAPPING[station.lineCode]
          : null;

        // Convert line code to color name if possible, otherwise use raw line value
        const lineName = station.lineCode
          ? (getRailLineByCode(station.lineCode)?.colorName ?? station.line)
          : station.line;

        mergedStations.push({
          primaryId: station.id,
          mergedIds: station.mergedIds ?? [station.id],
          name: getStationDisplayName(
            this.getCanonicalName(station),
            station.lineCode ?? undefined,
          ),
          originalName: station.name,
          latitude: station.latitude,
          longitude: station.longitude,
          agencies: agency ? [agency] : [],
          lines: [lineName],
        });
      } else {
        // Multiple stations - merge them
        const merged = this.mergeStationGroup(group);
        mergedStations.push(merged);
      }
    }

    return mergedStations;
  }

  /**
   * Merge a group of stations into a single processed station
   */
  private mergeStationGroup(group: RawRailStation[]): ProcessedRailStation {
    // Preserve GeoSampa IDs for interchanges; use proximity within each source.
    const primaryStation = group.reduce((closest, current) => {
      const closestIsGtfsOnly = closest.id >= 1_000_000_000;
      const currentIsGtfsOnly = current.id >= 1_000_000_000;
      if (closestIsGtfsOnly !== currentIsGtfsOnly) {
        return closestIsGtfsOnly ? current : closest;
      }
      const closestDistance = haversineDistanceKm(
        closest.latitude,
        closest.longitude,
        SAO_PAULO_CITY.map.center.latitude,
        SAO_PAULO_CITY.map.center.longitude,
      );
      const currentDistance = haversineDistanceKm(
        current.latitude,
        current.longitude,
        SAO_PAULO_CITY.map.center.latitude,
        SAO_PAULO_CITY.map.center.longitude,
      );
      return currentDistance < closestDistance ? current : closest;
    });

    // Aggregate all agencies based on line codes (use LINE_AGENCY_MAPPING)
    const allAgencies = new Set<string>();
    for (const station of group) {
      if (station.lineCode) {
        const agency = LINE_AGENCY_MAPPING[station.lineCode];
        if (agency) {
          allAgencies.add(agency);
        }
      }
    }

    // Aggregate all lines, converting line codes to color names
    const allLines = new Set<string>();
    for (const station of group) {
      // Convert line code to color name if possible, otherwise use raw line value
      const lineName = station.lineCode
        ? (getRailLineByCode(station.lineCode)?.colorName ?? station.line)
        : station.line;
      allLines.add(lineName);
    }

    return {
      primaryId: primaryStation.id,
      mergedIds: [...new Set(group.flatMap((s) => s.mergedIds ?? [s.id]))],
      name: getStationDisplayName(
        this.getCanonicalName(primaryStation),
        primaryStation.lineCode ?? undefined,
      ),
      originalName: primaryStation.name,
      latitude: primaryStation.latitude,
      longitude: primaryStation.longitude,
      agencies: Array.from(allAgencies).sort(),
      lines: Array.from(allLines).sort(),
    };
  }

  private getCanonicalName(station: RawRailStation): string {
    return getCanonicalRailStationName(
      station.name,
      station.lineCode === null ? [] : [station.lineCode],
    );
  }

  private getExceptionStationGroupKey(
    normalizedName: string,
    lineCode: number | null,
  ): string {
    return `${normalizedName}::line:${lineCode ?? 'unknown'}`;
  }

  /**
   * Persist merged stations to database (replace existing data)
   */
  private async persistMergedStations(
    stations: ProcessedRailStation[],
  ): Promise<void> {
    // Use transaction to ensure atomicity
    await this.prisma.$transaction(async (tx) => {
      // Clear existing data
      await tx.$executeRawUnsafe('DELETE FROM merged_rail_stations');

      // Insert new merged stations
      for (const station of stations) {
        await tx.$executeRawUnsafe(
          `
          INSERT INTO merged_rail_stations 
            (id, "primaryId", "mergedIds", name, "originalName", latitude, longitude, agencies, lines, "updatedAt")
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())
          `,
          station.primaryId,
          station.mergedIds,
          station.name,
          station.originalName,
          station.latitude,
          station.longitude,
          station.agencies,
          station.lines,
        );
      }
    });

    this.logger.debug(
      `Persisted ${stations.length} merged stations to database`,
    );
  }

  private haveSameStations(
    existing: ProcessedRailStation[],
    next: ProcessedRailStation[],
  ): boolean {
    if (existing.length !== next.length) {
      return false;
    }

    const existingByPrimaryId = new Map(
      existing.map((station) => [station.primaryId, station]),
    );

    return next.every((station) => {
      const current = existingByPrimaryId.get(station.primaryId);
      return (
        current !== undefined &&
        current.name === station.name &&
        current.originalName === station.originalName &&
        current.latitude === station.latitude &&
        current.longitude === station.longitude &&
        this.haveSameArrayValues(current.mergedIds, station.mergedIds) &&
        this.haveSameArrayValues(current.agencies, station.agencies) &&
        this.haveSameArrayValues(current.lines, station.lines)
      );
    });
  }

  private haveSameArrayValues<T extends string | number>(
    current: T[],
    next: T[],
  ): boolean {
    if (current.length !== next.length) {
      return false;
    }

    const sortedCurrent = [...current].sort((a, b) =>
      String(a).localeCompare(String(b)),
    );
    const sortedNext = [...next].sort((a, b) =>
      String(a).localeCompare(String(b)),
    );
    return sortedCurrent.every((value, index) => value === sortedNext[index]);
  }

  /**
   * Get a merged station by any of its IDs
   */
  async getStationById(id: number) {
    const result = await this.prisma.$queryRaw<ProcessedRailStation[]>`
      SELECT * FROM merged_rail_stations
      WHERE "primaryId" = ${id} OR ${id} = ANY("mergedIds")
      LIMIT 1
    `;
    return result[0] || null;
  }

  /**
   * Get all merged stations
   */
  async getAllStations() {
    return this.prisma.$queryRaw<ProcessedRailStation[]>`
      SELECT * FROM merged_rail_stations
      ORDER BY name ASC
    `;
  }
}
