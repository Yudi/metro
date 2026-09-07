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
import {
  GTFSFileInfo,
  ImportProgress,
  GTFSProcessingResult,
} from './types/gtfs.types';
import { ImportStatusDto } from './dto/gtfs-dataset.dto';
import {
  ImportLockService,
  TRANSIT_CATALOG_IMPORT_LOCK,
} from '../common/import-lock.service';
import type { ImportLockOptions } from '../common/import-lock.service';

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

  constructor(
    private readonly fileOperationsService: FileOperationsService,
    private readonly zipProcessingService: ZipProcessingService,
    private readonly gtfsDatabaseService: GTFSDatabaseService,
    private readonly csvProcessingService: CsvProcessingService,
    private readonly rustGtfsService: RustGtfsService,
    private readonly dataImportHooksService: DataImportHooksService,
    private readonly importLockService: ImportLockService,
  ) {}

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
    return this.withImportLock(
      'GTFS import',
      () => this.startImportLocked(),
      {
        waitForLock: true,
        timeoutMs: GTFSConfig.IMPORT_LOCK_TIMEOUT_MS,
      },
    );
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
        const message = error instanceof Error ? error.message : 'Unknown error';
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
    const feedDefinition = GTFSConfig.getFeedDefinition(feed);
    const feedTempDir = path.join(this.tempDir, feed);
    const zipFileName = `${feed}.zip`;
    const zipFilePath = path.join(feedTempDir, zipFileName);
    const extractDir = path.join(feedTempDir, 'extracted');
    let sourceDir: string | undefined;
    let shouldCleanupTemp = true;
    let catalogMutationStarted = false;
    let candidateSignature: string | undefined;

    try {
      // Prefer an explicitly configured local snapshot when present. The
      // default production path resolves the remote feed each run.
      const localSnapshotPath = feedDefinition.localSnapshotPath;
      const hasLocalSnapshot = localSnapshotPath
        ? await this.fileOperationsService.fileExists(
            path.join(localSnapshotPath, 'agency.txt'),
          )
        : false;
      if (localSnapshotPath && !hasLocalSnapshot) {
        throw new Error(
          `Configured ${feed} GTFS snapshot is missing agency.txt: ${localSnapshotPath}`,
        );
      }

      let fileHash: string;
      let fileSize: number;
      let extractedFiles: GTFSFileInfo[];

      if (hasLocalSnapshot && localSnapshotPath) {
        sourceDir = localSnapshotPath;
        shouldCleanupTemp = false;
        this.updateImportStatus(
          'processing',
          10,
          `Reading ${feed} GTFS snapshot...`,
        );
        [fileHash, fileSize, extractedFiles] = await Promise.all([
          this.fileOperationsService.calculateDirectoryHash(sourceDir),
          this.fileOperationsService.getDirectorySize(sourceDir),
          this.zipProcessingService.analyzeDirectory(sourceDir),
        ]);
      } else {
        const downloadUrl =
          feed === 'artesp'
            ? await this.fileOperationsService.resolveCkanResourceUrl(
                GTFSConfig.ARTESP_CKAN_PACKAGE_URL,
              )
            : feedDefinition.downloadUrl;
        if (!downloadUrl) {
          throw new Error(`No GTFS download URL configured for ${feed}`);
        }

        // Step 1: Download GTFS file
        this.updateImportStatus(
          'downloading',
          10,
          `Downloading ${feed} GTFS data...`,
        );
        await this.withTimeout(
          (signal) =>
            this.fileOperationsService.downloadFile(
              downloadUrl,
              zipFilePath,
              GTFSConfig.DOWNLOAD_TIMEOUT_MS,
              GTFSConfig.MAX_GTFS_ZIP_BYTES,
              signal,
            ),
          GTFSConfig.DOWNLOAD_TIMEOUT_MS,
          `${feed} download timeout`,
        );

        // Step 2: Calculate file hash
        this.updateImportStatus(
          'processing',
          20,
          `Calculating ${feed} GTFS file hash...`,
        );
        [fileHash, fileSize] = await Promise.all([
          this.fileOperationsService.calculateFileHash(zipFilePath),
          this.fileOperationsService.getFileSize(zipFilePath),
        ]);

        // Step 3: Extract and analyze files
        this.updateImportStatus(
          'processing',
          40,
          `Extracting ${feed} GTFS ZIP file...`,
        );
        extractedFiles = await this.zipProcessingService.extractAndAnalyzeFiles(
          zipFilePath,
          extractDir,
        );
        sourceDir = extractDir;
      }

      this.logger.debug(
        `${feed} GTFS source: ${(fileSize / 1024 / 1024).toFixed(
          2,
        )} MB, hash: ${fileHash.substring(0, 8)}...`,
      );
      candidateSignature = fileHash;

      // Step 4: Check if we already have this version
      const isCurrentHash = forceReimport
        ? false
        : await this.gtfsDatabaseService.isCurrentHash(fileHash, feed);
      if (isCurrentHash) {
        this.logger.debug(`${feed} GTFS data unchanged, skipping import`);
        if (shouldCleanupTemp) {
          await this.fileOperationsService.cleanup(zipFilePath, extractDir);
        }

        return {
          success: true,
          filesProcessed: 0,
          recordsImported: 0,
          skippedFiles: ['All files (no changes detected)'],
          errors: [],
          dataChanged: false,
          sourceSignature: fileHash,
          feed,
        };
      }

      // Step 5: Create/update dataset record before mutating raw tables.
      this.updateImportStatus(
        'processing',
        30,
        `Updating ${feed} dataset record...`,
      );
      const dataset = await this.gtfsDatabaseService.createOrUpdateDataset({
        fileHash,
        fileSize,
        version: new Date().toISOString().split('T')[0], // Use date as version
      }, feed);
      catalogMutationStarted = true;

      await this.gtfsDatabaseService.prepareDatasetForImport(
        dataset.id,
        extractedFiles.map((file) => file.fileName),
        feed,
      );

      // Save file information to database
      await this.gtfsDatabaseService.upsertDatasetFiles(
        dataset.id,
        extractedFiles,
        feed,
      );
      await this.gtfsDatabaseService.clearOptionalTables(
        feed,
        extractedFiles.map((file) => file.fileName),
      );

      // Step 6: Process files intelligently
      this.updateImportStatus(
        'processing',
        50,
        `Processing ${feed} GTFS files...`,
      );
      const result = await this.processGTFSFiles(
        dataset.id,
        sourceDir ?? extractDir,
        extractedFiles,
        feed,
      );

      result.dataChanged = true;
      result.sourceSignature = fileHash;
      result.feed = feed;

      if (result.success) {
        await this.gtfsDatabaseService.completeDataset(feed);
      }

      // Step 7: Cleanup
      if (shouldCleanupTemp) {
        this.updateImportStatus(
          'processing',
          90,
          `Cleaning up ${feed} temporary files...`,
        );
        await this.fileOperationsService.cleanup(zipFilePath, extractDir);
      }

      this.logger.debug(`${feed} GTFS import completed successfully`);
      return result;
    } catch (error) {
      // Cleanup on error
      if (shouldCleanupTemp) {
        await this.fileOperationsService.cleanup(zipFilePath, extractDir);
      }
      if (catalogMutationStarted) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          success: false,
          filesProcessed: 0,
          recordsImported: 0,
          skippedFiles: [],
          errors: [`${feed}: ${message}`],
          dataChanged: true,
          sourceSignature: candidateSignature,
          feed,
        };
      }
      throw error;
    }
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
    const result: GTFSProcessingResult = {
      success: true,
      filesProcessed: 0,
      recordsImported: 0,
      skippedFiles: [],
      errors: [],
    };

    // Get processing order
    const processingOrder = GTFSConfig.getProcessingOrder();
    const filesToProcess = processingOrder.filter((fileName) =>
      extractedFiles.some((f) => f.fileName === fileName),
    );

    const extractedFileNames = new Set(
      extractedFiles.map((file) => file.fileName),
    );
    for (const requiredFile of GTFSConfig.getRequiredFiles(feed)) {
      if (!extractedFileNames.has(requiredFile)) {
        result.success = false;
        result.errors.push(`Missing required GTFS file: ${requiredFile}`);
      }
    }

    this.currentImportStatus.totalFiles =
      filesToProcess.length +
      GTFSConfig.getRequiredFiles(feed).filter(
        (fileName) => !extractedFileNames.has(fileName),
      ).length;
    this.currentImportStatus.processedFiles = 0;

    for (const fileName of filesToProcess) {
      const fileInfo = extractedFiles.find((f) => f.fileName === fileName);
      if (!fileInfo) continue;

      try {
        this.currentImportStatus.currentFile = fileName;
        this.updateImportStatus(
          'processing',
          50 +
            (this.currentImportStatus.processedFiles / filesToProcess.length) *
              40,
          `Processing ${fileName}...`,
        );

        // Process every file in a changed feed. A matching file hash from a
        // historical dataset does not prove that its rows are present in the
        // currently active physical tables.
        const filePath = path.join(extractDir, fileName);
        let recordCount = 0;

        // Check if this file should be processed with Rust tool
        if (GTFSConfig.isRustProcessed(fileName)) {
          this.logger.debug(`Processing ${fileName} with Rust tool...`);

          // Get database URL from environment (needed for Rust tool)
          const dbUrl = process.env.DATABASE_URL;
          if (!dbUrl) {
            throw new Error('DATABASE_URL environment variable not set');
          }

          // Prisma's `schema` URL option is not understood by the Rust
          // importer. Preserve every other option (including sslmode and
          // application settings) so both clients use the same connection
          // security and database parameters.
          const rustDbUrl = this.getRustDatabaseUrl(dbUrl);

          // Process shapes with Rust tool directly to PostGIS
          await this.rustGtfsService.processShapes(filePath, rustDbUrl, 4326, feed);

          // Count records in the file for reporting
          recordCount =
            await this.csvProcessingService.countCsvRecords(filePath);

          this.logger.debug(
            `Rust tool processed ${fileName}: ${recordCount} records`,
          );
        } else {
          // Process with regular CSV processing service
          recordCount = await this.csvProcessingService.processCsvFile(
            filePath,
            fileName,
            feed,
          );
        }

        // Update file record
        await this.gtfsDatabaseService.updateFileRecord(
          datasetId,
          fileName,
          recordCount,
          feed,
        );

        result.filesProcessed++;
        result.recordsImported += recordCount;
        this.currentImportStatus.processedFiles++;

        this.logger.debug(`Processed ${fileName}: ${recordCount} records`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        if (GTFSConfig.isRequiredFile(fileName, feed)) {
          this.logger.error(`Failed to process ${fileName}:`, errorMessage);
          result.errors.push(`${fileName}: ${errorMessage}`);
          result.success = false;
        } else {
          this.logger.warn(
            `Skipping optional ${fileName} after processing failure: ${errorMessage}`,
          );
          try {
            await this.gtfsDatabaseService.clearOptionalTable(fileName, feed);
            result.skippedFiles.push(fileName);
          } catch (clearError) {
            const clearMessage =
              clearError instanceof Error
                ? clearError.message
                : 'Unknown clear error';
            result.success = false;
            result.errors.push(
              `${fileName}: failed to clear stale optional table: ${clearMessage}`,
            );
          }
        }
      }
    }

    return result;
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
