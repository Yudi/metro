import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RailStationProcessorService } from './rail-station-processor.service';
import {
  ImportLockService,
  TRANSIT_CATALOG_IMPORT_LOCK,
} from '../../common/import-lock.service';

/**
 * Service responsible for refreshing rail data MVT materialized views.
 *
 * The views are created by migration and recreated after GeoSampa WFS import.
 * Views: mvt_rail_stations, mvt_rail_routes
 */
@Injectable()
export class RailVectorTileService {
  private readonly logger = new Logger(RailVectorTileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly railStationProcessor: RailStationProcessorService,
    private readonly importLockService: ImportLockService,
  ) {}

  /**
   * Refresh all rail MVT materialized views
   * Call this after GeoSampa WFS data import
   */
  async refreshMvtViews(): Promise<void> {
    await this.importLockService.withLock(
      TRANSIT_CATALOG_IMPORT_LOCK,
      'GeoSampa rail materialized-view refresh',
      () => this.refreshMvtViewsWithinImport(),
    );
  }

  async refreshMvtViewsWithinImport(): Promise<void> {
    this.logger.debug('Refreshing rail MVT views...');

    try {
      const tablesExist = await this.checkRailTablesExist();
      if (!tablesExist) {
        this.logger.warn(
          'GeoSampa rail tables do not exist yet, skipping MVT view refresh',
        );
        return;
      }

      // First, process and merge stations
      this.logger.debug('Processing and merging rail stations...');
      await this.railStationProcessor.refreshMergedStationsWithinImport();

      await this.refreshExistingMvtViews();

      this.logger.debug('Rail MVT views refreshed successfully');
    } catch (error) {
      this.logger.error('Failed to refresh rail MVT views:', error);
      throw error;
    }
  }

  private async refreshExistingMvtViews(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'REFRESH MATERIALIZED VIEW "public"."mvt_rail_stations"',
    );
    await this.prisma.$executeRawUnsafe(
      'REFRESH MATERIALIZED VIEW "public"."mvt_rail_routes"',
    );

    this.logger.debug('Rail MVT views refreshed successfully');
  }

  /**
   * Check if GeoSampa rail tables exist in the database
   */
  private async checkRailTablesExist(): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count
        FROM information_schema.tables 
        WHERE table_schema = 'external_gpkg'
        AND table_name IN ('metro_station', 'trem_station', 'metro_line', 'trem_line')
      `;
      return Number(result[0]?.count) >= 4;
    } catch {
      return false;
    }
  }

  /**
   * Get record counts from rail tables
   */
  async getRecordCounts(): Promise<{
    metroStations: number;
    metroLines: number;
    tremStations: number;
    tremLines: number;
  }> {
    try {
      const [metroStations, metroLines, tremStations, tremLines] =
        await Promise.all([
          this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM external_gpkg.metro_station
          `,
          this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM external_gpkg.metro_line
          `,
          this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM external_gpkg.trem_station
          `,
          this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM external_gpkg.trem_line
          `,
        ]);

      return {
        metroStations: Number(metroStations[0]?.count ?? 0),
        metroLines: Number(metroLines[0]?.count ?? 0),
        tremStations: Number(tremStations[0]?.count ?? 0),
        tremLines: Number(tremLines[0]?.count ?? 0),
      };
    } catch (error) {
      this.logger.error('Failed to get record counts:', error);
      return {
        metroStations: 0,
        metroLines: 0,
        tremStations: 0,
        tremLines: 0,
      };
    }
  }
}
