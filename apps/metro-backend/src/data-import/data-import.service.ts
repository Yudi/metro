import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as path from 'path';
import { FileOperationsService } from './services/file-operations.service';
import { ZipProcessingService } from './services/zip-processing.service';
import { GTFSDatabaseService } from './services/gtfs-database.service';
import { CsvProcessingService } from './services/csv-processing.service';
import { RustGtfsService } from './services/rust-gtfs.service';
import { DataImportHooksService } from './services/data-import-hooks.service';
import { GTFSConfig } from './config/gtfs.config';
import { ImportProgress, GTFSProcessingResult } from './types/gtfs.types';
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
      this.logger.error('Initial import failed:', error);
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
      { waitForLock: true },
    );
  }

  private async startImportLocked(): Promise<GTFSProcessingResult> {
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
      const result = await this.performImport();
      if (!result.success) {
        throw new ImportFailureError(result);
      }

      // Post-import work is part of readiness.  A successful data import must
      // not be reported as complete while search/vector views are stale.
      await this.dataImportHooksService.onDataImportComplete();
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
      this.logger.error('Scheduled import failed:', error);
    }
  }

  /**
   * Main import logic
   */
  private async performImport(): Promise<GTFSProcessingResult> {
    const zipFileName = 'gtfs.zip';
    const zipFilePath = path.join(this.tempDir, zipFileName);
    const extractDir = path.join(this.tempDir, 'extracted');

    try {
      // Step 1: Download GTFS file
      this.updateImportStatus('downloading', 10, 'Downloading GTFS data...');
      await this.withTimeout(
        (signal) =>
          this.fileOperationsService.downloadFile(
            GTFSConfig.SPTRANS_GTFS_URL,
            zipFilePath,
            GTFSConfig.DOWNLOAD_TIMEOUT_MS,
            GTFSConfig.MAX_GTFS_ZIP_BYTES,
            signal,
          ),
        GTFSConfig.DOWNLOAD_TIMEOUT_MS,
        'Download timeout',
      );

      // Step 2: Calculate file hash
      this.updateImportStatus('processing', 20, 'Calculating file hash...');
      const [fileHash, fileSize] = await Promise.all([
        this.fileOperationsService.calculateFileHash(zipFilePath),
        this.fileOperationsService.getFileSize(zipFilePath),
      ]);

      this.logger.debug(
        `Downloaded GTFS file: ${(fileSize / 1024 / 1024).toFixed(
          2,
        )} MB, hash: ${fileHash.substring(0, 8)}...`,
      );

      // Step 3: Check if we already have this version
      const isCurrentHash =
        await this.gtfsDatabaseService.isCurrentHash(fileHash);
      if (isCurrentHash) {
        this.logger.debug('GTFS data unchanged, skipping import');
        await this.fileOperationsService.cleanup(zipFilePath);

        return {
          success: true,
          filesProcessed: 0,
          recordsImported: 0,
          skippedFiles: ['All files (no changes detected)'],
          errors: [],
        };
      }

      // Step 4: Create/update dataset record (replace existing)
      this.updateImportStatus('processing', 30, 'Updating dataset record...');
      const dataset = await this.gtfsDatabaseService.createOrUpdateDataset({
        fileHash,
        fileSize,
        version: new Date().toISOString().split('T')[0], // Use date as version
      });

      // Step 5: Extract and analyze files
      this.updateImportStatus('processing', 40, 'Extracting ZIP file...');
      const extractedFiles =
        await this.zipProcessingService.extractAndAnalyzeFiles(
          zipFilePath,
          extractDir,
        );

      // Save file information to database
      await this.gtfsDatabaseService.upsertDatasetFiles(
        dataset.id,
        extractedFiles,
      );

      // Step 6: Process files intelligently
      this.updateImportStatus('processing', 50, 'Processing GTFS files...');
      const result = await this.processGTFSFiles(
        dataset.id,
        extractDir,
        extractedFiles,
      );

      // Step 7: Cleanup
      this.updateImportStatus(
        'processing',
        90,
        'Cleaning up temporary files...',
      );
      await this.fileOperationsService.cleanup(zipFilePath, extractDir);

      this.logger.debug('GTFS import completed successfully');
      return result;
    } catch (error) {
      // Cleanup on error
      await this.fileOperationsService.cleanup(zipFilePath, extractDir);
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
    for (const requiredFile of GTFSConfig.getRequiredFiles()) {
      if (!extractedFileNames.has(requiredFile)) {
        result.success = false;
        result.errors.push(`Missing required GTFS file: ${requiredFile}`);
      }
    }

    this.currentImportStatus.totalFiles =
      filesToProcess.length +
      GTFSConfig.getRequiredFiles().filter(
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

        // Check if we already have this exact file processed successfully
        const existingFile = await this.gtfsDatabaseService.findFileByHash(
          fileInfo.fileHash,
        );
        if (
          existingFile &&
          existingFile.recordCount &&
          existingFile.recordCount > 0
        ) {
          this.logger.debug(
            `Skipping ${fileName} (already processed with same hash, ${existingFile.recordCount} records)`,
          );
          result.skippedFiles.push(fileName);

          // Update file record for this dataset
          await this.gtfsDatabaseService.updateFileRecord(
            datasetId,
            fileName,
            existingFile.recordCount,
          );

          // Delete the duplicate file
          const filePath = path.join(extractDir, fileName);
          await this.fileOperationsService.deleteFile(filePath);
          continue;
        } else if (existingFile) {
          this.logger.debug(
            `Reprocessing ${fileName} (previous import failed with 0 records)`,
          );
        }

        // Process new or changed file
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
          await this.rustGtfsService.processShapes(filePath, rustDbUrl);

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
          );
        }

        // Update file record
        await this.gtfsDatabaseService.updateFileRecord(
          datasetId,
          fileName,
          recordCount,
        );

        result.filesProcessed++;
        result.recordsImported += recordCount;
        this.currentImportStatus.processedFiles++;

        this.logger.debug(`Processed ${fileName}: ${recordCount} records`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        if (GTFSConfig.isRequiredFile(fileName)) {
          this.logger.error(`Failed to process ${fileName}:`, errorMessage);
          result.errors.push(`${fileName}: ${errorMessage}`);
          result.success = false;
        } else {
          this.logger.warn(
            `Skipping optional ${fileName} after processing failure: ${errorMessage}`,
          );
          result.skippedFiles.push(fileName);
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

    this.logger.debug('Clearing all GTFS data and starting fresh import...');

    try {
      // Clear all data and tracking
      await this.gtfsDatabaseService.clearAllGTFSData();

      // Start fresh import
      return await this.startImportLocked();
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
