import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ProcessedStation,
  RawStation,
  mergeSubwayStations,
} from './subway-station-merge.utils';

/**
 * Service responsible for processing and merging subway stations.
 *
 * This service:
 * 1. Creates/refreshes MVT materialized views on startup
 * 2. Fetches raw subway station data from GTFS tables
 * 3. Merges stations with similar names (intermodal stations)
 * 4. Stores the merged results in the MergedSubwayStation table
 *
 * The merging logic follows specific rules:
 * - Stations with the same normalized name are merged
 * - Known exceptions (Lapa, Mooca) are never merged
 * - "Morumbi" and "São Paulo - Morumbi" are kept separate
 * - The closest station to city center is used as primary
 */
@Injectable()
export class SubwayStationProcessorService implements OnModuleInit {
  private readonly logger = new Logger(SubwayStationProcessorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initialize MVT views on module startup
   */
  async onModuleInit(): Promise<void> {
    this.logger.debug('Initializing subway station processor...');

    try {
      // Ensure MVT views exist
      await this.ensureMvtViewsExist();

      // Check if we have GTFS data and process stations
      const hasData = await this.checkGtfsDataExists();
      if (hasData) {
        await this.refreshMergedStations();
      } else {
        this.logger.warn('No GTFS data found, skipping station processing');
      }
    } catch (error) {
      this.logger.error(
        'Failed to initialize subway station processor:',
        error,
      );
      // Don't throw - let the app continue starting
    }
  }

  /**
   * Check if GTFS data exists in the database
   */
  private async checkGtfsDataExists(): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "SPTrans_Route" 
        WHERE route_id LIKE 'METRÔ%' OR route_id LIKE 'CPTM%'
      `;
      return Number(result[0]?.count || 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Ensure MVT materialized views exist in the database.
   * Creates them if they don't exist.
   */
  async ensureMvtViewsExist(): Promise<void> {
    this.logger.debug('Ensuring MVT views exist...');

    try {
      // Check if merged_subway_stations table exists
      const tableExists = await this.prisma.$queryRaw<[{ exists: boolean }]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'merged_subway_stations'
        ) AS exists
      `;

      if (!tableExists[0]?.exists) {
        this.logger.warn('merged_subway_stations table does not exist yet');
        return;
      }

      // Create or replace the MVT views
      await this.createMvtViews();
      this.logger.debug('MVT views ensured');
    } catch (error) {
      this.logger.error('Failed to ensure MVT views:', error);
      throw error;
    }
  }

  /**
   * Create or recreate MVT materialized views
   */
  private async createMvtViews(): Promise<void> {
    // Drop existing views first (if they exist)
    await this.prisma.$executeRawUnsafe(`
      DROP MATERIALIZED VIEW IF EXISTS mvt_subway_stations CASCADE
    `);

    await this.prisma.$executeRawUnsafe(`
      DROP MATERIALIZED VIEW IF EXISTS mvt_subway_routes CASCADE
    `);

    // Create subway stations MVT view from merged_subway_stations table
    await this.prisma.$executeRawUnsafe(`
      CREATE MATERIALIZED VIEW mvt_subway_stations AS
      SELECT 
        id,
        "stopId" AS stop_id,
        name,
        latitude,
        longitude,
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geom,
        agencies,
        "routeShortNames" AS route_short_names
      FROM merged_subway_stations
    `);

    // Create spatial index
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_mvt_subway_stations_geom 
      ON mvt_subway_stations USING GIST (geom)
    `);

    // Create unique index for concurrent refresh
    await this.prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mvt_subway_stations_id 
      ON mvt_subway_stations (id)
    `);

    // Create subway routes MVT view
    await this.prisma.$executeRawUnsafe(`
      CREATE MATERIALIZED VIEW mvt_subway_routes AS
      WITH route_shapes AS (
        SELECT DISTINCT ON (r.route_id)
          r.id,
          r.route_id,
          r.route_short_name,
          r.route_long_name,
          r.route_color,
          r.route_text_color,
          sh.geom
        FROM "SPTrans_Route" r
        INNER JOIN "SPTrans_Trip" t ON r.route_id = t.route_id
        INNER JOIN "SPTrans_Shape" sh ON t.shape_id = sh.shape_id
        WHERE (r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')
          AND sh.geom IS NOT NULL
        ORDER BY r.route_id, t.trip_id
      )
      SELECT 
        id,
        route_id,
        route_short_name AS short_name,
        route_long_name AS long_name,
        route_color AS color,
        route_text_color AS text_color,
        geom
      FROM route_shapes
    `);

    // Create spatial index for routes
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_mvt_subway_routes_geom 
      ON mvt_subway_routes USING GIST (geom)
    `);

    // Create unique index for concurrent refresh
    await this.prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mvt_subway_routes_id 
      ON mvt_subway_routes (id)
    `);

    this.logger.debug('MVT views created successfully');
  }

  /**
   * Process and refresh all merged subway stations.
   * This should be called after GTFS data import.
   */
  async refreshMergedStations(): Promise<void> {
    this.logger.debug('Starting subway station processing...');

    try {
      // Step 1: Fetch raw station data with agencies and routes
      const rawStations = await this.fetchRawStations();
      this.logger.debug(`Fetched ${rawStations.length} raw subway stations`);

      if (rawStations.length === 0) {
        this.logger.warn('No raw subway stations found');
        return;
      }

      // Step 2: Merge stations with identical names
      const mergedStations = mergeSubwayStations(rawStations);
      this.logger.debug(`Merged into ${mergedStations.length} unique stations`);

      // Step 3: Persist to database (replace existing data)
      await this.persistMergedStations(mergedStations);

      // Step 4: Recreate and refresh MVT materialized views
      await this.createMvtViews();

      this.logger.debug('Subway station processing completed successfully');
    } catch (error) {
      this.logger.error('Failed to process subway stations:', error);
      throw error;
    }
  }

  /**
   * Fetch raw subway stations from GTFS tables
   */
  private async fetchRawStations(): Promise<RawStation[]> {
    const stations = await this.prisma.$queryRaw<RawStation[]>`
      SELECT 
        s.id,
        s.stop_id,
        s.stop_name,
        s.stop_lat,
        s.stop_lon,
        array_agg(DISTINCT 
          CASE 
            WHEN r.route_id LIKE 'METRÔ%' THEN 'METRO'
            WHEN r.route_id LIKE 'CPTM%' THEN 'CPTM'
            ELSE 'OTHER'
          END
        ) FILTER (WHERE r.route_id IS NOT NULL) AS agencies,
        array_agg(DISTINCT r.route_short_name ORDER BY r.route_short_name) 
          FILTER (WHERE r.route_short_name IS NOT NULL) AS route_short_names
      FROM "SPTrans_Stop" s
      INNER JOIN "SPTrans_StopTime" st ON s.stop_id = st.stop_id
      INNER JOIN "SPTrans_Trip" t ON st.trip_id = t.trip_id
      INNER JOIN "SPTrans_Route" r ON t.route_id = r.route_id
      WHERE r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%'
      GROUP BY s.id, s.stop_id, s.stop_name, s.stop_lat, s.stop_lon
      ORDER BY s.stop_name
    `;

    return stations;
  }

  /**
   * Persist merged stations to database (replace existing data)
   */
  private async persistMergedStations(
    stations: ProcessedStation[],
  ): Promise<void> {
    // Use transaction to ensure atomicity
    await this.prisma.$transaction(async (tx) => {
      // Clear existing data
      await tx.mergedSubwayStation.deleteMany({});

      // Insert new merged stations
      await tx.mergedSubwayStation.createMany({
        data: stations.map((s) => ({
          stopId: s.stopId,
          mergedStopIds: s.mergedStopIds,
          name: s.name,
          originalName: s.originalName,
          latitude: s.latitude,
          longitude: s.longitude,
          agencies: s.agencies,
          lines: s.lines,
          routeShortNames: s.routeShortNames,
        })),
      });
    });

    this.logger.debug(
      `Persisted ${stations.length} merged stations to database`,
    );
  }

  /**
   * Get a merged station by any of its stop IDs
   */
  async getStationByStopId(stopId: string) {
    return this.prisma.mergedSubwayStation.findFirst({
      where: {
        OR: [{ stopId }, { mergedStopIds: { has: stopId } }],
      },
    });
  }

  /**
   * Get all merged stations
   */
  async getAllStations() {
    return this.prisma.mergedSubwayStation.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
