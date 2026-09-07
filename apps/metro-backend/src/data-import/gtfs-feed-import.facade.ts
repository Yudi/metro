import * as path from 'path';
import { Logger } from '@nestjs/common';
import { FileOperationsService } from './services/file-operations.service';
import { ZipProcessingService } from './services/zip-processing.service';
import { GTFSDatabaseService } from './services/gtfs-database.service';
import { CsvProcessingService } from './services/csv-processing.service';
import { RustGtfsService } from './services/rust-gtfs.service';
import { GTFSConfig, GTFSFeed } from './config/gtfs.config';
import type {
  GTFSFileInfo,
  GTFSProcessingResult,
  ImportProgress,
} from './types/gtfs.types';

export interface GtfsFeedImportContext {
  fileOperationsService: FileOperationsService;
  zipProcessingService: ZipProcessingService;
  gtfsDatabaseService: GTFSDatabaseService;
  csvProcessingService: CsvProcessingService;
  rustGtfsService: RustGtfsService;
  tempDir: string;
  logger: Logger;
  getImportStatus: () => ImportProgress;
  updateImportStatus: (
    status: ImportProgress['status'],
    progress: number,
    message: string,
  ) => void;
  withTimeout: <T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ) => Promise<T>;
  getRustDatabaseUrl: (databaseUrl: string) => string;
}

/**
 * Runs one provider feed from source acquisition through raw-table import.
 * DataImportService owns the cross-feed lock and lifecycle status; this
 * facade keeps provider-specific download, file, and table processing grouped.
 */
export class GtfsFeedImportFacade {
  constructor(private readonly context: GtfsFeedImportContext) {}

  async performFeedImport(
    feed: GTFSFeed,
    forceReimport = false,
  ): Promise<GTFSProcessingResult> {
    const feedDefinition = GTFSConfig.getFeedDefinition(feed);
    const feedTempDir = path.join(this.context.tempDir, feed);
    const zipFileName = `${feed}.zip`;
    const zipFilePath = path.join(feedTempDir, zipFileName);
    const extractDir = path.join(feedTempDir, 'extracted');
    let sourceDir: string | undefined;
    let shouldCleanupTemp = true;
    let catalogMutationStarted = false;
    let candidateSignature: string | undefined;

    try {
      const localSnapshotPath = feedDefinition.localSnapshotPath;
      const hasLocalSnapshot = localSnapshotPath
        ? await this.context.fileOperationsService.fileExists(
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
        this.context.updateImportStatus(
          'processing',
          10,
          `Reading ${feed} GTFS snapshot...`,
        );
        [fileHash, fileSize, extractedFiles] = await Promise.all([
          this.context.fileOperationsService.calculateDirectoryHash(sourceDir),
          this.context.fileOperationsService.getDirectorySize(sourceDir),
          this.context.zipProcessingService.analyzeDirectory(sourceDir),
        ]);
      } else {
        const downloadUrl =
          feed === 'artesp'
            ? await this.context.fileOperationsService.resolveCkanResourceUrl(
                GTFSConfig.ARTESP_CKAN_PACKAGE_URL,
              )
            : feedDefinition.downloadUrl;
        if (!downloadUrl) {
          throw new Error(`No GTFS download URL configured for ${feed}`);
        }

        this.context.updateImportStatus(
          'downloading',
          10,
          `Downloading ${feed} GTFS data...`,
        );
        await this.context.withTimeout(
          (signal) =>
            this.context.fileOperationsService.downloadFile(
              downloadUrl,
              zipFilePath,
              GTFSConfig.DOWNLOAD_TIMEOUT_MS,
              GTFSConfig.MAX_GTFS_ZIP_BYTES,
              signal,
            ),
          GTFSConfig.DOWNLOAD_TIMEOUT_MS,
          `${feed} download timeout`,
        );

        this.context.updateImportStatus(
          'processing',
          20,
          `Calculating ${feed} GTFS file hash...`,
        );
        [fileHash, fileSize] = await Promise.all([
          this.context.fileOperationsService.calculateFileHash(zipFilePath),
          this.context.fileOperationsService.getFileSize(zipFilePath),
        ]);

        this.context.updateImportStatus(
          'processing',
          40,
          `Extracting ${feed} GTFS ZIP file...`,
        );
        extractedFiles =
          await this.context.zipProcessingService.extractAndAnalyzeFiles(
            zipFilePath,
            extractDir,
          );
        sourceDir = extractDir;
      }

      this.context.logger.debug(
        `${feed} GTFS source: ${(fileSize / 1024 / 1024).toFixed(
          2,
        )} MB, hash: ${fileHash.substring(0, 8)}...`,
      );
      candidateSignature = fileHash;

      const isCurrentHash = forceReimport
        ? false
        : await this.context.gtfsDatabaseService.isCurrentHash(fileHash, feed);
      if (isCurrentHash) {
        this.context.logger.debug(
          `${feed} GTFS data unchanged, skipping import`,
        );
        if (shouldCleanupTemp) {
          await this.context.fileOperationsService.cleanup(
            zipFilePath,
            extractDir,
          );
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

      this.context.updateImportStatus(
        'processing',
        30,
        `Updating ${feed} dataset record...`,
      );
      const dataset =
        await this.context.gtfsDatabaseService.createOrUpdateDataset(
          {
            fileHash,
            fileSize,
            version: new Date().toISOString().split('T')[0],
          },
          feed,
        );
      catalogMutationStarted = true;

      await this.context.gtfsDatabaseService.prepareDatasetForImport(
        dataset.id,
        extractedFiles.map((file) => file.fileName),
        feed,
      );
      await this.context.gtfsDatabaseService.upsertDatasetFiles(
        dataset.id,
        extractedFiles,
        feed,
      );
      await this.context.gtfsDatabaseService.clearOptionalTables(
        feed,
        extractedFiles.map((file) => file.fileName),
      );

      this.context.updateImportStatus(
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
        await this.context.gtfsDatabaseService.completeDataset(feed);
      }

      if (shouldCleanupTemp) {
        this.context.updateImportStatus(
          'processing',
          90,
          `Cleaning up ${feed} temporary files...`,
        );
        await this.context.fileOperationsService.cleanup(
          zipFilePath,
          extractDir,
        );
      }

      this.context.logger.debug(`${feed} GTFS import completed successfully`);
      return result;
    } catch (error) {
      if (shouldCleanupTemp) {
        await this.context.fileOperationsService.cleanup(
          zipFilePath,
          extractDir,
        );
      }
      if (catalogMutationStarted) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
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

  async processGTFSFiles(
    datasetId: string,
    extractDir: string,
    extractedFiles: GTFSFileInfo[],
    feed: GTFSFeed = 'sptrans',
  ): Promise<GTFSProcessingResult> {
    const result: GTFSProcessingResult = {
      success: true,
      filesProcessed: 0,
      recordsImported: 0,
      skippedFiles: [],
      errors: [],
    };

    const processingOrder = GTFSConfig.getProcessingOrder();
    const filesToProcess = processingOrder.filter((fileName) =>
      extractedFiles.some((file) => file.fileName === fileName),
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

    const importStatus = this.context.getImportStatus();
    importStatus.totalFiles =
      filesToProcess.length +
      GTFSConfig.getRequiredFiles(feed).filter(
        (fileName) => !extractedFileNames.has(fileName),
      ).length;
    importStatus.processedFiles = 0;

    for (const fileName of filesToProcess) {
      const fileInfo = extractedFiles.find(
        (file) => file.fileName === fileName,
      );
      if (!fileInfo) continue;

      try {
        const currentStatus = this.context.getImportStatus();
        currentStatus.currentFile = fileName;
        this.context.updateImportStatus(
          'processing',
          50 +
            ((currentStatus.processedFiles ?? 0) / filesToProcess.length) * 40,
          `Processing ${fileName}...`,
        );

        const filePath = path.join(extractDir, fileName);
        let recordCount = 0;
        if (GTFSConfig.isRustProcessed(fileName)) {
          this.context.logger.debug(`Processing ${fileName} with Rust tool...`);
          const dbUrl = process.env.DATABASE_URL;
          if (!dbUrl) {
            throw new Error('DATABASE_URL environment variable not set');
          }

          await this.context.rustGtfsService.processShapes(
            filePath,
            this.context.getRustDatabaseUrl(dbUrl),
            4326,
            feed,
          );
          recordCount =
            await this.context.csvProcessingService.countCsvRecords(filePath);
          this.context.logger.debug(
            `Rust tool processed ${fileName}: ${recordCount} records`,
          );
        } else {
          recordCount = await this.context.csvProcessingService.processCsvFile(
            filePath,
            fileName,
            feed,
          );
        }

        await this.context.gtfsDatabaseService.updateFileRecord(
          datasetId,
          fileName,
          recordCount,
          feed,
        );
        result.filesProcessed++;
        result.recordsImported += recordCount;
        const updatedStatus = this.context.getImportStatus();
        updatedStatus.processedFiles = (updatedStatus.processedFiles ?? 0) + 1;
        this.context.logger.debug(
          `Processed ${fileName}: ${recordCount} records`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        if (GTFSConfig.isRequiredFile(fileName, feed)) {
          this.context.logger.error(`Failed to process ${fileName}:`, message);
          result.errors.push(`${fileName}: ${message}`);
          result.success = false;
        } else {
          this.context.logger.warn(
            `Skipping optional ${fileName} after processing failure: ${message}`,
          );
          try {
            await this.context.gtfsDatabaseService.clearOptionalTable(
              fileName,
              feed,
            );
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
}
