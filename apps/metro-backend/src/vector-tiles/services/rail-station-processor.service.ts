import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { haversineDistanceKm } from '../../common/utils/geo-distance.util';
import {
  getStationDisplayName,
  isStationMergeException,
  normalizeStationName,
  shouldMergeStations,
  LINE_AGENCY_MAPPING,
  getRailLineByCode,
  parseRailLineCode,
  SAO_PAULO_CITY_CENTER,
} from '@metro/shared/utils';

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

interface RawRailStation {
  id: number;
  name: string;
  line: string;
  lineCode: number | null;
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

/**
 * Service responsible for processing and merging rail stations from GeoSampa WFS data.
 *
 * This service:
 * 1. Fetches raw rail station data from provider-shaped PostGIS tables
 * 2. Merges stations with similar names (intermodal stations)
 * 3. Stores the merged results in the merged_rail_stations table
 *
 * The merging logic follows the same rules as GTFS:
 * - Stations with the same normalized name are merged
 * - Known exceptions (Lapa, Mooca) are never merged
 * - "Morumbi" and "São Paulo - Morumbi" are kept separate
 * - The closest station to city center is used as primary
 */
@Injectable()
export class RailStationProcessorService implements OnModuleInit {
  private readonly logger = new Logger(RailStationProcessorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initialize on module startup - check if data exists
   */
  async onModuleInit(): Promise<void> {
    this.logger.debug('Initializing rail station processor...');

    try {
      const hasData = await this.checkRailDataExists();
      if (hasData) {
        await this.refreshMergedStations();
      } else {
        this.logger.warn(
          'No GeoSampa rail data found, skipping station processing',
        );
      }
    } catch (error) {
      this.logger.error('Failed to initialize rail station processor:', error);
      // Don't throw - let the app continue starting
    }
  }

  /**
   * Check if GeoSampa rail data exists in the database
   */
  private async checkRailDataExists(): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'external_gpkg'
        AND table_name IN ('metro_station', 'trem_station')
      `;
      return Number(result[0]?.count || 0) >= 2;
    } catch {
      return false;
    }
  }

  /**
   * Process and refresh all merged rail stations.
   * This should be called after GeoSampa WFS data import.
   */
  async refreshMergedStations(): Promise<void> {
    this.logger.debug('Starting rail station processing...');

    try {
      // Step 1: Fetch raw station data
      const rawStations = await this.fetchRawRailStations();
      this.logger.debug(`Fetched ${rawStations.length} raw rail stations`);

      if (rawStations.length === 0) {
        this.logger.warn('No raw rail stations found');
        return;
      }

      // Step 2: Merge stations with identical names
      const mergedStations = this.mergeStations(rawStations);
      this.logger.debug(`Merged into ${mergedStations.length} unique stations`);

      // Step 3: Persist to database (replace existing data)
      await this.persistMergedStations(mergedStations);

      this.logger.debug('Rail station processing completed successfully');
    } catch (error) {
      this.logger.error('Failed to process rail stations:', error);
      throw error;
    }
  }

  /**
   * Fetch raw rail stations from local GeoSampa tables
   */
  private async fetchRawRailStations(): Promise<RawRailStation[]> {
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

  /**
   * Merge stations with identical normalized names
   */
  private mergeStations(stations: RawRailStation[]): ProcessedRailStation[] {
    // Group stations by mergeable name
    const stationGroups = new Map<string, RawRailStation[]>();

    for (const station of stations) {
      const normalizedName = normalizeStationName(station.name).toLowerCase();

      if (isStationMergeException(station.name)) {
        const groupKey = this.getExceptionStationGroupKey(
          normalizedName,
          station.lineCode,
        );
        const group = stationGroups.get(groupKey);

        if (group) {
          group.push(station);
        } else {
          stationGroups.set(groupKey, [station]);
        }

        continue;
      }

      // Find existing group that should be merged with this station
      let groupKey: string | null = null;

      for (const [existingKey, existingGroup] of stationGroups.entries()) {
        const existingStation = existingGroup[0];
        if (shouldMergeStations(station.name, existingStation.name)) {
          groupKey = existingKey;
          break;
        }
      }

      // Use normalized name as key if no existing group found
      if (!groupKey) {
        groupKey = normalizedName;
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
          mergedIds: [station.id],
          name: getStationDisplayName(
            station.name,
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
    // Find the station closest to city center (primary station)
    const primaryStation = group.reduce((closest, current) => {
      const closestDistance = haversineDistanceKm(
        closest.latitude,
        closest.longitude,
        SAO_PAULO_CITY_CENTER.latitude,
        SAO_PAULO_CITY_CENTER.longitude,
      );
      const currentDistance = haversineDistanceKm(
        current.latitude,
        current.longitude,
        SAO_PAULO_CITY_CENTER.latitude,
        SAO_PAULO_CITY_CENTER.longitude,
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
      mergedIds: group.map((s) => s.id),
      name: getStationDisplayName(
        primaryStation.name,
        primaryStation.lineCode ?? undefined,
      ),
      originalName: primaryStation.name,
      latitude: primaryStation.latitude,
      longitude: primaryStation.longitude,
      agencies: Array.from(allAgencies).sort(),
      lines: Array.from(allLines).sort(),
    };
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
