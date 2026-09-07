import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as path from 'path';
import { FileOperationsService } from './services/file-operations.service';
import { ZipProcessingService } from './services/zip-processing.service';
import { GTFSDatabaseService } from './services/gtfs-database.service';
import { CsvProcessingService } from './services/csv-processing.service';
import { RustGtfsService } from './services/rust-gtfs.service';
import { DataImportHooksService } from './services/data-import-hooks.service';
import { GTFSConfig, GTFSFeed } from './config/gtfs.config';
import { ImportProgress, GTFSProcessingResult } from './types/gtfs.types';
import { ImportStatusDto } from './dto/gtfs-dataset.dto';
import {
  ImportLockService,
  TRANSIT_CATALOG_IMPORT_LOCK,
} from '../common/import-lock.service';
import type { ImportLockOptions } from '../common/import-lock.service';
import { GtfsFeedImportFacade } from './gtfs-feed-import.facade';

class ImportFailureError extends Error {
  constructor(readonly result: GTFSProcessingResult) {
    super(`GTFS import failed: ${result.errors.join('; ')}`);
    this.name = 'ImportFailureError';
  }
}

@Injectable()
export class DataImportService implements OnModuleInit {
  private readonly logger = new Logger(DataImportService.name);
  private readonly tempDir = path.join(process.cwd(), GTFSConfig.TEMP_DIR);
  private readonly importLockName = TRANSIT_CATALOG_IMPORT_LOCK;
  private currentImportStatus: ImportProgress = {
    status: 'idle',
    progress: 0,
    message: 'Ready to import',
  };
  private currentImportRunId = 0;
  private statusResetTimer?: ReturnType<typeof setTimeout>;
  private readonly feedImportFacade: GtfsFeedImportFacade;

  constructor(
    private readonly fileOperationsService: FileOperationsService,
    private readonly zipProcessingService: ZipProcessingService,
    private readonly gtfsDatabaseService: GTFSDatabaseService,
    private readonly csvProcessingService: CsvProcessingService,
    private readonly rustGtfsService: RustGtfsService,
    private readonly dataImportHooksService: DataImportHooksService,
    private readonly importLockService: ImportLockService,
  ) {
    this.feedImportFacade = new GtfsFeedImportFacade({
      fileOperationsService: this.fileOperationsService,
      zipProcessingService: this.zipProcessingService,
      gtfsDatabaseService: this.gtfsDatabaseService,
      csvProcessingService: this.csvProcessingService,
      rustGtfsService: this.rustGtfsService,
      tempDir: this.tempDir,
      logger: this.logger,
      getImportStatus: () => this.currentImportStatus,
      updateImportStatus: this.updateImportStatus.bind(this),
      withTimeout: this.withTimeout.bind(this),
      getRustDatabaseUrl: this.getRustDatabaseUrl.bind(this),
    });
  }

  async onModuleInit() {
    await this.ensureTempDir();

    // Check if Rust tool is available
    const rustToolAvailable = await this.rustGtfsService.checkRustTool();
    if (!rustToolAvailable) {
      this.logger.warn(
        'Rust GTFS tool not available - shapes.txt processing will be skipped',
      );
    } else {
      const version = await this.rustGtfsService.getRustToolVersion();
      this.logger.debug(`Rust GTFS tool available: ${version}`);
    }

    // Start initial import on startup
    this.logger.debug('Starting initial GTFS import on startup...');
    this.startImportInBackground().catch((error) => {
      this.logger.error(`Initial import failed: ${errorMessage(error)}`);
    });
  }

  private async ensureTempDir(): Promise<void> {
    await this.fileOperationsService.ensureDirectory(this.tempDir);
  }

  private async withTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const operationPromise = operation(controller.signal);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new Error(timeoutMessage));
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      });

      return await Promise.race([operationPromise, timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private updateImportStatus(
    status: ImportProgress['status'],
    progress: number,
    message: string,
  ): void {
    this.currentImportStatus = {
      status,
      progress,
      message,
      currentFile: this.currentImportStatus.currentFile,
      totalFiles: this.currentImportStatus.totalFiles,
      processedFiles: this.currentImportStatus.processedFiles,
    };
    this.logger.debug(`[${progress}%] ${message}`);
  }

  /**
   * Get current import status
   */
  getImportStatus(): ImportStatusDto {
    return {
      status: this.currentImportStatus.status,
      progress: this.currentImportStatus.progress,
      message: this.currentImportStatus.message,
      lastImport: undefined, // Will be populated from database if needed
    };
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
  async startImport(): Promise<GTFSProcessingResult> {
    return this.withImportLock('GTFS import', () => this.startImportLocked());
  }

  private async startImportInBackground(): Promise<GTFSProcessingResult> {
    return this.withImportLock('GTFS import', () => this.startImportLocked(), {
      waitForLock: true,
      timeoutMs: GTFSConfig.IMPORT_LOCK_TIMEOUT_MS,
    });
  }

  private async startImportLocked(
    forceReimport = false,
  ): Promise<GTFSProcessingResult> {
    if (
      this.currentImportStatus.status !== 'idle' &&
      this.currentImportStatus.status !== 'completed' &&
      this.currentImportStatus.status !== 'error'
    ) {
      throw new Error('Import already in progress');
    }

    const runId = ++this.currentImportRunId;
    this.clearStatusResetTimer();

    this.updateImportStatus('downloading', 0, 'Starting GTFS import...');

    try {
      const result = await this.performImport(forceReimport);
      if (!result.success) {
        // A feed can fail after another feed has already published new raw
        // rows. Refresh derived data for the feeds that did change so a
        // failed optional provider does not leave successful catalog updates
        // invisible. The overall run remains failed and is retried later.
        if (result.dataChanged) {
          await this.dataImportHooksService.onDataImportComplete({
            dataChanged: true,
            sourceSignature: result.sourceSignature,
            feeds: result.changedFeeds,
          });
        }
        throw new ImportFailureError(result);
      }

      // Post-import work is part of readiness.  A successful data import must
      // not be reported as complete while search/vector views are stale.
      await this.dataImportHooksService.onDataImportComplete({
        dataChanged: result.dataChanged,
        sourceSignature: result.sourceSignature,
        feeds: result.changedFeeds,
      });
      this.updateImportStatus(
        'completed',
        100,
        'Import completed successfully',
      );

      // Reset to idle after a brief moment
      this.scheduleStatusReset(1000, runId);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.updateImportStatus('error', 0, `Import failed: ${errorMessage}`);

      // Reset to idle after error as well
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
  }

  private clearStatusResetTimer(): void {
    if (this.statusResetTimer) {
      clearTimeout(this.statusResetTimer);
      this.statusResetTimer = undefined;
    }
  }

  /**
   * Scheduled daily import at 3 AM
   */
  @Cron(GTFSConfig.DAILY_IMPORT_CRON)
  async scheduledImport(): Promise<void> {
    this.logger.debug('Starting scheduled GTFS import...');

    try {
      await this.startImportInBackground();
      this.logger.debug('Scheduled import completed successfully');
    } catch (error) {
      this.logger.error(`Scheduled import failed: ${errorMessage(error)}`);
    }
  }

  /**
   * Main import logic
   */
  private async performImport(
    forceReimport = false,
  ): Promise<GTFSProcessingResult> {
    const feeds: GTFSFeed[] = ['sptrans', 'artesp'];
    const results: GTFSProcessingResult[] = [];

    for (const feed of feeds) {
      try {
        results.push(await this.performFeedImport(feed, forceReimport));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`${feed} GTFS import failed: ${message}`);
        results.push({
          success: false,
          filesProcessed: 0,
          recordsImported: 0,
          skippedFiles: [],
          errors: [`${feed}: ${message}`],
          dataChanged: false,
          feed,
        });
      }
    }

    const changedFeeds = results
      .filter((result) => result.dataChanged)
      .map((result) => result.feed)
      .filter((feed): feed is GTFSFeed => feed !== undefined);
    const signatures = results
      .filter((result) => result.success && result.sourceSignature)
      .map((result) => `${result.feed ?? 'sptrans'}:${result.sourceSignature}`)
      .sort();

    // If a feed failed before returning a successful result, include the last
    // completed metadata hash when available. This keeps post-processing
    // signatures representative of the catalog that is actually published.
    for (const feed of feeds) {
      if (signatures.some((signature) => signature.startsWith(`${feed}:`))) {
        continue;
      }
      try {
        const current = await this.gtfsDatabaseService.getCurrentDataset(feed);
        if (current) {
          signatures.push(`${feed}:${current.fileHash}`);
        }
      } catch (error) {
        this.logger.warn(
          `Unable to read last completed ${feed} dataset signature: ${errorMessage(error)}`,
        );
      }
    }
    signatures.sort();

    return {
      success: results.every((result) => result.success),
      filesProcessed: results.reduce(
        (total, result) => total + result.filesProcessed,
        0,
      ),
      recordsImported: results.reduce(
        (total, result) => total + result.recordsImported,
        0,
      ),
      skippedFiles: results.flatMap((result) =>
        result.feed
          ? result.skippedFiles.map((file) => `${result.feed}:${file}`)
          : result.skippedFiles,
      ),
      errors: results.flatMap((result) => result.errors),
      dataChanged: changedFeeds.length > 0,
      sourceSignature: signatures.length > 0 ? signatures.join('|') : undefined,
      changedFeeds,
    };
  }

  private async performFeedImport(
    feed: GTFSFeed,
    forceReimport = false,
  ): Promise<GTFSProcessingResult> {
    return this.feedImportFacade.performFeedImport(feed, forceReimport);
  }

  /**
   * Process GTFS files with intelligent duplicate detection
   */
  private async processGTFSFiles(
    datasetId: string,
    extractDir: string,
    extractedFiles: { fileName: string; fileHash: string; fileSize: number }[],
    feed: GTFSFeed = 'sptrans',
  ): Promise<GTFSProcessingResult> {
    return this.feedImportFacade.processGTFSFiles(
      datasetId,
      extractDir,
      extractedFiles,
      feed,
    );
  }

  /**
   * Get latest dataset information
   */
  async getLatestDataset() {
    return await this.gtfsDatabaseService.getLatestDataset();
  }

  /**
   * Get current dataset information
   */
  async getCurrentDatasetInfo() {
    return await this.gtfsDatabaseService.getCurrentDataset();
  }

  /**
   * Clear all GTFS data and force complete re-import
   */
  async clearAndReimport(): Promise<GTFSProcessingResult> {
    return this.withImportLock('GTFS clear and reimport', () =>
      this.clearAndReimportLocked(),
    );
  }

  private async clearAndReimportLocked(): Promise<GTFSProcessingResult> {
    if (
      this.currentImportStatus.status !== 'idle' &&
      this.currentImportStatus.status !== 'completed' &&
      this.currentImportStatus.status !== 'error'
    ) {
      throw new Error('Import already in progress');
    }

    this.logger.debug('Forcing a complete GTFS replacement import...');

    try {
      // Keep the healthy active tables in place while the replacement is
      // downloaded, validated, and processed. The forced flag bypasses only
      // the whole-feed hash shortcut; activation remains governed by the
      // normal import result/hooks.
      return await this.startImportLocked(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Clear and reimport failed:', errorMessage);
      throw error;
    }
  }

  private getRustDatabaseUrl(databaseUrl: string): string {
    try {
      const url = new URL(databaseUrl);
      url.searchParams.delete('schema');
      return url.toString();
    } catch {
      // Keep libpq-style connection strings intact. The Rust importer will
      // validate unsupported options and fail loudly rather than silently
      // dropping security settings.
      return databaseUrl;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
}
