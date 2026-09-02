import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WFSProcessingService } from './services/wfs-processing.service';
import { WFSDatabaseService } from './services/wfs-database.service';
import { RailVectorTileService } from '../vector-tiles/services/rail-vector-tile.service';
import { VectorTilesService } from '../vector-tiles/vector-tiles.service';
import { WFSConfig } from './config/wfs.config';
import {
  ImportProgress,
  WFSProcessingResult,
  ImportStatus,
} from './types/wfs.types';
import { SearchService } from '../search/services/search.service';
import {
  ImportLockService,
  TRANSIT_CATALOG_IMPORT_LOCK,
} from '../common/import-lock.service';
import type { ImportLockOptions } from '../common/import-lock.service';

/**
 * Service for importing rail (Metro and CPTM) data from GeoSampa WFS layers.
 *
 * This service:
 * 1. Fetches GeoJSON features from GeoSampa WFS, never WMS
 * 2. Hashes the raw WFS response to skip unchanged layers
 * 3. Imports changed layers into local PostGIS tables in EPSG:3857
 * 4. Refreshes local MVT materialized views and search indexes
 * 5. Runs on startup and on a daily schedule
 */
@Injectable()
export class RailImportService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(RailImportService.name);
  private readonly importLockName = TRANSIT_CATALOG_IMPORT_LOCK;
  private canRunStartupImport = false;
  private currentImportStatus: ImportProgress = {
    status: 'idle',
    progress: 0,
    message: 'Ready to import',
  };
  private currentImportRunId = 0;
  private statusResetTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly wfsProcessingService: WFSProcessingService,
    private readonly wfsDatabaseService: WFSDatabaseService,
    private readonly railVectorTileService: RailVectorTileService,
    private readonly vectorTilesService: VectorTilesService,
    private readonly searchService: SearchService,
    private readonly importLockService: ImportLockService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureTargetTables();
      this.canRunStartupImport = true;
    } catch (error) {
      this.logger.error(
        `GeoSampa WFS import initialization failed: ${errorMessage(error)}`,
      );
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.canRunStartupImport) {
      return;
    }

    this.logger.debug(
      'Scheduling initial GeoSampa WFS import on backend startup...',
    );

    setImmediate(async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 3000));

        this.logger.debug(
          'Starting initial GeoSampa WFS import on backend startup...',
        );
        await this.startImportInBackground();
      } catch (error) {
        this.logger.error(
          `Initial GeoSampa WFS import failed: ${errorMessage(error)}`,
        );
      }
    });
  }

  private async ensureTargetTables(): Promise<void> {
    await this.wfsProcessingService.ensureTargetTables();
  }

  private updateImportStatus(
    status: ImportStatus,
    progress: number,
    message: string,
  ): void {
    this.currentImportStatus = {
      status,
      progress,
      message,
      currentSource: this.currentImportStatus.currentSource,
      totalSources: this.currentImportStatus.totalSources,
      processedSources: this.currentImportStatus.processedSources,
    };
    this.logger.debug(`[${progress}%] ${message}`);
  }

  /**
   * Get current import status
   */
  getImportStatus(): ImportProgress {
    return { ...this.currentImportStatus };
  }

  /**
   * Reset import status to idle (manual override)
   */
  resetStatus(): void {
    this.currentImportRunId++;
    this.clearStatusResetTimer();
    this.logger.debug('Manually resetting import status to idle');
    this.updateImportStatus('idle', 0, 'Ready to import');
  }

  /**
   * Manually trigger import
   */
  async startImport(): Promise<WFSProcessingResult> {
    return this.withImportLock('GeoSampa WFS import', () =>
      this.startImportLocked(),
    );
  }

  private async startImportInBackground(): Promise<WFSProcessingResult> {
    return this.withImportLock(
      'GeoSampa WFS import',
      () => this.startImportLocked(),
      { waitForLock: true },
    );
  }

  private async startImportLocked(): Promise<WFSProcessingResult> {
    if (
      this.currentImportStatus.status !== 'idle' &&
      this.currentImportStatus.status !== 'completed' &&
      this.currentImportStatus.status !== 'error'
    ) {
      throw new Error('Import already in progress');
    }

    const runId = ++this.currentImportRunId;
    this.clearStatusResetTimer();

    this.updateImportStatus(
      'downloading',
      0,
      'Starting GeoSampa WFS import...',
    );

    try {
      const result = await this.performImport();

      if (result.sourcesProcessed > 0) {
        this.logger.debug('Refreshing rail vector tile views...');
        await this.railVectorTileService.refreshMvtViewsWithinImport();
        await Promise.all([
          this.searchService.indexRailLines(),
          this.searchService.indexRailStations(),
        ]);

        this.vectorTilesService.clearCache();
      }

      this.updateImportStatus(
        'completed',
        100,
        this.getFinalImportMessage(result),
      );

      this.scheduleStatusReset(1000, runId);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.updateImportStatus('error', 0, `Import failed: ${errorMessage}`);

      this.scheduleStatusReset(5000, runId);

      throw error;
    }
  }

  private async withImportLock<T>(
    operation: string,
    action: () => Promise<T>,
    options?: ImportLockOptions,
  ): Promise<T> {
    if (options) {
      return await this.importLockService.withLock(
        this.importLockName,
        operation,
        action,
        options,
      );
    }

    return await this.importLockService.withLock(
      this.importLockName,
      operation,
      action,
    );
  }

  private scheduleStatusReset(delayMs: number, runId: number): void {
    this.clearStatusResetTimer();
    this.statusResetTimer = setTimeout(() => {
      this.statusResetTimer = undefined;
      if (runId !== this.currentImportRunId) {
        return;
      }

      this.updateImportStatus('idle', 0, 'Ready to import');
    }, delayMs);

    this.statusResetTimer.unref?.();
  }

  private clearStatusResetTimer(): void {
    if (this.statusResetTimer) {
      clearTimeout(this.statusResetTimer);
      this.statusResetTimer = undefined;
    }
  }

  private getFinalImportMessage(result: WFSProcessingResult): string {
    if (!result.success) {
      return `Import completed with errors: ${result.errors.join('; ')}`;
    }

    return result.sourcesProcessed > 0
      ? 'Import completed successfully'
      : 'GeoSampa WFS data unchanged';
  }

  /**
   * Scheduled daily import at 4 AM (after GTFS import)
   */
  @Cron(WFSConfig.DAILY_IMPORT_CRON)
  async scheduledImport(): Promise<void> {
    this.logger.debug('Starting scheduled GeoSampa WFS import...');

    try {
      await this.startImportInBackground();
      this.logger.debug('Scheduled GeoSampa WFS import completed successfully');
    } catch (error) {
      this.logger.error(
        `Scheduled GeoSampa WFS import failed: ${errorMessage(error)}`,
      );
    }
  }

  /**
   * Main import logic
   */
  private async performImport(): Promise<WFSProcessingResult> {
    const result: WFSProcessingResult = {
      success: true,
      sourcesProcessed: 0,
      recordsImported: 0,
      skippedSources: [],
      errors: [],
    };

    await this.ensureTargetTables();

    const sources = WFSConfig.getAllSources();
    this.currentImportStatus.totalSources = sources.length;
    this.currentImportStatus.processedSources = 0;

    for (const source of sources) {
      this.currentImportStatus.currentSource = source.source;
      const progressBase =
        (this.currentImportStatus.processedSources / sources.length) * 100;

      try {
        this.updateImportStatus(
          'downloading',
          progressBase,
          `Fetching ${source.typeName} from GeoSampa WFS...`,
        );

        const downloaded =
          await this.wfsProcessingService.downloadLayer(source);

        this.logger.debug(
          `Fetched ${source.source}: ${(downloaded.fileSize / 1024).toFixed(2)} KB, hash: ${downloaded.fileHash.substring(0, 8)}...`,
        );

        const isCurrentHash = await this.wfsDatabaseService.isCurrentHash(
          source.source,
          downloaded.fileHash,
        );

        if (isCurrentHash) {
          this.logger.debug(`${source.source} unchanged, skipping import`);
          result.skippedSources.push(source.source);
          this.currentImportStatus.processedSources++;
          await this.wfsProcessingService.delayBetweenRequests();
          continue;
        }

        this.updateImportStatus(
          'processing',
          progressBase + 20,
          `Importing ${source.source} into PostGIS...`,
        );

        const recordCount = await this.wfsProcessingService.replaceSourceTable(
          source,
          downloaded.featureCollection,
          downloaded.sourceSrid,
        );

        this.logger.debug(
          `Imported ${recordCount} records from ${source.source}`,
        );

        await this.wfsDatabaseService.createOrUpdateDataset({
          source: source.source,
          fileHash: downloaded.fileHash,
          fileSize: downloaded.fileSize,
        });

        result.sourcesProcessed++;
        result.recordsImported += recordCount;
        this.currentImportStatus.processedSources++;

        this.logger.debug(`Successfully processed ${source.source}`);
        await this.wfsProcessingService.delayBetweenRequests();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to process ${source.source}:`, errorMessage);
        result.errors.push(`${source.source}: ${errorMessage}`);
        result.success = false;

        // Continue with next source even if one fails
        this.currentImportStatus.processedSources++;
      }
    }

    return result;
  }

  /**
   * Clear all GeoSampa WFS data and force complete re-import
   */
  async clearAndReimport(): Promise<WFSProcessingResult> {
    return this.withImportLock('GeoSampa WFS clear and reimport', () =>
      this.clearAndReimportLocked(),
    );
  }

  private async clearAndReimportLocked(): Promise<WFSProcessingResult> {
    if (
      this.currentImportStatus.status !== 'idle' &&
      this.currentImportStatus.status !== 'completed' &&
      this.currentImportStatus.status !== 'error'
    ) {
      throw new Error('Import already in progress');
    }

    this.logger.debug(
      'Clearing all GeoSampa WFS rail data and starting fresh import...',
    );

    try {
      // Clear all data and tracking
      await this.wfsDatabaseService.clearAllRailData();

      // Start fresh import
      return await this.startImportLocked();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Clear and reimport failed:', errorMessage);
      throw error;
    }
  }

  /**
   * Get all dataset information
   */
  async getAllDatasets() {
    return await this.wfsDatabaseService.getAllDatasets();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
}
