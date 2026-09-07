import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GTFSFileInfo } from '../types/gtfs.types';
import { GTFSConfig, GTFSFeed } from '../config/gtfs.config';
import {
  CreateGTFSDatasetDto,
  GTFSDatasetResponseDto,
} from '../dto/gtfs-dataset.dto';

interface FeedDatasetRow {
  source: string;
  file_hash: string;
  file_size: number;
  version: string | null;
  last_updated: Date;
  completed: boolean;
}

interface FeedFileRow {
  file_name: string;
  record_count: number | null;
}

@Injectable()
export class GTFSDatabaseService {
  private readonly logger = new Logger(GTFSDatabaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get current dataset (there should only be one)
   */
  async getCurrentDataset(
    feed: GTFSFeed = 'sptrans',
  ): Promise<GTFSDatasetResponseDto | null> {
    const dataset = await this.findLatestCompleteDataset(feed);
    if (!dataset) return null;

    return this.toDatasetResponse(dataset);
  }

  /**
   * Check if current dataset hash matches the provided hash
   */
  async isCurrentHash(
    fileHash: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<boolean> {
    if (feed === 'artesp') {
      return this.isCurrentArtespHash(fileHash);
    }

    const dataset = await this.findLatestCompleteDataset();
    if (!dataset || dataset.fileHash !== fileHash) {
      return false;
    }

    const shapesFile = dataset.gtfsFiles.find(
      (file) => file.fileName === 'shapes.txt',
    );
    if (!shapesFile?.recordCount || shapesFile.recordCount <= 0) {
      this.logger.warn(
        'Current GTFS dataset has no successful shapes.txt import; forcing reimport',
      );
      return false;
    }

    const [shapeCount] = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM "external_gtfs"."SPTrans_Shape"
      WHERE geom IS NOT NULL
    `;

    if (!shapeCount || Number(shapeCount.count) === 0) {
      this.logger.warn(
        'Current GTFS dataset has no imported shape geometries; forcing reimport',
      );
      return false;
    }

    return true;
  }

  /**
   * Create or update GTFS dataset record (always replace with latest)
   */
  async createOrUpdateDataset(
    dto: CreateGTFSDatasetDto,
    feed: GTFSFeed = 'sptrans',
  ): Promise<GTFSDatasetResponseDto> {
    if (feed === 'artesp') {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO public.gtfs_feed_datasets
          (source, file_hash, file_size, version, completed, last_updated)
         VALUES ($1, $2, $3, $4, false, now())
         ON CONFLICT (source) DO UPDATE SET
           file_hash = EXCLUDED.file_hash,
           file_size = EXCLUDED.file_size,
           version = EXCLUDED.version,
           completed = false,
           last_updated = now()`,
        feed,
        dto.fileHash,
        dto.fileSize,
        dto.version ?? null,
      );

      return {
        id: feed,
        lastUpdated: new Date(),
        fileHash: dto.fileHash,
        fileSize: dto.fileSize,
        version: dto.version,
      };
    }

    const dataset = await this.prisma.gTFSDataset.upsert({
      where: { fileHash: dto.fileHash },
      update: {
        fileSize: dto.fileSize,
        version: dto.version,
        lastUpdated: new Date(),
      },
      create: {
        fileHash: dto.fileHash,
        fileSize: dto.fileSize,
        version: dto.version,
      },
    });

    return this.toDatasetResponse(dataset);
  }

  /**
   * Find GTFS file by dataset ID and filename
   */
  async findFileByDatasetAndName(
    datasetId: string,
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ) {
    if (feed === 'artesp') {
      const files = await this.prisma.$queryRaw<FeedFileRow[]>`
        SELECT file_name, record_count
        FROM public.gtfs_feed_files
        WHERE source = ${feed} AND file_name = ${fileName}
        LIMIT 1
      `;
      return files[0] ?? null;
    }

    return await this.prisma.gTFSFile.findUnique({
      where: {
        datasetId_fileName: {
          datasetId,
          fileName,
        },
      },
    });
  }

  /** Mark a candidate dataset incomplete before any live-table processing. */
  async prepareDatasetForImport(
    datasetId: string,
    fileNames?: string[],
    feed: GTFSFeed = 'sptrans',
  ): Promise<void> {
    if (feed === 'artesp') {
      if (fileNames) {
        await this.prisma.$executeRawUnsafe(
          `DELETE FROM public.gtfs_feed_files
           WHERE source = $1 AND NOT (file_name = ANY($2::text[]))`,
          feed,
          fileNames,
        );
      }
      await this.prisma.$executeRawUnsafe(
        `UPDATE public.gtfs_feed_files
         SET record_count = NULL, last_updated = now()
         WHERE source = $1`,
        feed,
      );
      return;
    }

    if (fileNames) {
      await this.prisma.gTFSFile.deleteMany({
        where: {
          datasetId,
          fileName: { notIn: fileNames },
        },
      });
    }
    await this.prisma.gTFSFile.updateMany({
      where: { datasetId },
      data: { recordCount: null },
    });
  }

  /**
   * Optional relations are provider-scoped. Clear absent files before a
   * replacement so a newer feed cannot inherit stale exceptions, frequencies
   * or fare rows from its previous version.
   */
  async clearOptionalTables(
    feed: GTFSFeed,
    presentFileNames: readonly string[],
  ): Promise<void> {
    const present = new Set(presentFileNames);
    for (const fileName of GTFSConfig.getExpectedFiles()) {
      if (
        !GTFSConfig.isRequiredFile(fileName, feed) &&
        !present.has(fileName)
      ) {
        await this.clearOptionalTable(fileName, feed);
      }
    }
  }

  /** Clear one optional relation after a malformed optional file. */
  async clearOptionalTable(
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<void> {
    if (
      !GTFSConfig.getExpectedFiles().includes(fileName) ||
      GTFSConfig.isRequiredFile(fileName, feed)
    ) {
      throw new Error(`Cannot clear required or unknown GTFS file: ${fileName}`);
    }

    const table = GTFSConfig.getTableName(fileName, feed);
    await this.prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "${GTFSConfig.EXTERNAL_SCHEMA}"."${table}" RESTART IDENTITY CASCADE`,
    );
  }

  /**
   * Create or update GTFS file records for a dataset
   */
  async upsertDatasetFiles(
    datasetId: string,
    files: GTFSFileInfo[],
    feed: GTFSFeed = 'sptrans',
  ): Promise<void> {
    try {
      if (feed === 'artesp') {
        for (const file of files) {
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO public.gtfs_feed_files
              (source, file_name, file_hash, file_size, record_count, last_updated)
             VALUES ($1, $2, $3, $4, $5, now())
             ON CONFLICT (source, file_name) DO UPDATE SET
               file_hash = EXCLUDED.file_hash,
               file_size = EXCLUDED.file_size,
               record_count = EXCLUDED.record_count,
               last_updated = now()`,
            feed,
            file.fileName,
            file.fileHash,
            file.fileSize,
            file.recordCount ?? null,
          );
        }
        this.logger.debug(
          `Upserted ${files.length} ${feed} file records for dataset ${datasetId}`,
        );
        return;
      }

      for (const file of files) {
        await this.prisma.gTFSFile.upsert({
          where: {
            datasetId_fileName: {
              datasetId,
              fileName: file.fileName,
            },
          },
          update: {
            fileHash: file.fileHash,
            fileSize: file.fileSize,
            recordCount: file.recordCount,
            lastUpdated: new Date(),
          },
          create: {
            datasetId,
            fileName: file.fileName,
            fileHash: file.fileHash,
            fileSize: file.fileSize,
            recordCount: file.recordCount,
          },
        });
      }

      this.logger.debug(
        `Upserted ${files.length} file records for dataset ${datasetId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to upsert files for dataset ${datasetId}:`,
        errorMessage,
      );
      throw withCause(`Database error: ${errorMessage}`, error);
    }
  }

  /**
   * Update file record with processing info
   */
  async updateFileRecord(
    datasetId: string,
    fileName: string,
    recordCount?: number,
    feed: GTFSFeed = 'sptrans',
  ): Promise<void> {
    try {
      if (feed === 'artesp') {
        await this.prisma.$executeRawUnsafe(
          `UPDATE public.gtfs_feed_files
           SET record_count = $1, last_updated = now()
           WHERE source = $2 AND file_name = $3`,
          recordCount ?? null,
          feed,
          fileName,
        );
        return;
      }

      await this.prisma.gTFSFile.update({
        where: {
          datasetId_fileName: {
            datasetId,
            fileName,
          },
        },
        data: {
          recordCount,
          lastUpdated: new Date(),
        },
      });

      this.logger.debug(`Updated ${fileName} record for dataset ${datasetId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to update file ${fileName}:`, errorMessage);
      throw withCause(`Database error: ${errorMessage}`, error);
    }
  }

  /** Refresh planner statistics after replacing GTFS tables and before rebuilds. */
  async analyzeImportedTables(feed: GTFSFeed = 'sptrans'): Promise<void> {
    for (const table of GTFSConfig.getAnalyzeTables(feed)) {
      await this.prisma.$executeRawUnsafe(
        `ANALYZE "${GTFSConfig.EXTERNAL_SCHEMA}"."${table}"`,
      );
    }

    this.logger.debug(
      `Analyzed ${GTFSConfig.getAnalyzeTables(feed).length} ${feed} GTFS tables`,
    );
  }

  /** Publish an ARTESP candidate only after every required file succeeded. */
  async completeDataset(feed: GTFSFeed = 'sptrans'): Promise<void> {
    if (feed === 'artesp') {
      await this.prisma.$executeRawUnsafe(
        `UPDATE public.gtfs_feed_datasets
         SET completed = true, last_updated = now()
         WHERE source = $1`,
        feed,
      );
    }
  }

  private async findLatestCompleteDataset(feed: GTFSFeed = 'sptrans') {
    if (feed === 'artesp') {
      const rows = await this.prisma.$queryRaw<FeedDatasetRow[]>`
        SELECT source, file_hash, file_size, version, last_updated, completed
        FROM public.gtfs_feed_datasets
        WHERE source = ${feed} AND completed = true
        ORDER BY last_updated DESC
        LIMIT 1
      `;
      const dataset = rows[0];
      if (!dataset) {
        return null;
      }

      return {
        id: dataset.source,
        fileHash: dataset.file_hash,
        fileSize: dataset.file_size,
        version: dataset.version,
        lastUpdated: dataset.last_updated,
        gtfsFiles: [],
      };
    }

    const datasets = await this.prisma.gTFSDataset.findMany({
      include: { gtfsFiles: true },
      orderBy: { lastUpdated: 'desc' },
    });

    return datasets.find((dataset) => {
      const filesByName = new Map(
        dataset.gtfsFiles.map((file) => [file.fileName, file]),
      );

      const requiredFilesComplete = GTFSConfig.getRequiredFiles().every(
        (fileName) => {
          const file = filesByName.get(fileName);
          return file?.recordCount !== null && (file?.recordCount ?? 0) > 0;
        },
      );

      // Optional files that are present in a feed must also have completed;
      // absent optional files remain valid for feeds that do not publish them.
      const presentFilesComplete = dataset.gtfsFiles.every(
        (file) => file.recordCount !== null && file.recordCount !== undefined,
      );

      return requiredFilesComplete && presentFilesComplete;
    });
  }

  private async isCurrentArtespHash(fileHash: string): Promise<boolean> {
    const dataset = await this.findLatestCompleteDataset('artesp');
    if (!dataset || dataset.fileHash !== fileHash) {
      return false;
    }

    const files = await this.prisma.$queryRaw<FeedFileRow[]>`
      SELECT file_name, record_count
      FROM public.gtfs_feed_files
      WHERE source = 'artesp'
    `;
    const filesByName = new Map(
      files.map((file) => [file.file_name, file.record_count]),
    );
    if (files.some((file) => file.record_count === null)) {
      this.logger.warn(
        'Current ARTESP dataset contains an incomplete file record; forcing reimport',
      );
      return false;
    }
    const requiredFilesComplete = GTFSConfig.getRequiredFiles('artesp').every(
      (fileName) => (filesByName.get(fileName) ?? 0) > 0,
    );
    if (!requiredFilesComplete) {
      this.logger.warn(
        'Current ARTESP dataset is missing a successfully imported required file',
      );
      return false;
    }

    const [shapeCount] = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM "external_gtfs"."ARTESP_Shape"
      WHERE geom IS NOT NULL
    `;
    if (!shapeCount || Number(shapeCount.count) === 0) {
      this.logger.warn(
        'Current ARTESP dataset has no imported shape geometries; forcing reimport',
      );
      return false;
    }

    return true;
  }

  private toDatasetResponse(dataset: {
    id: string;
    lastUpdated: Date;
    fileHash: string;
    fileSize: number;
    version: string | null;
  }): GTFSDatasetResponseDto {
    return {
      id: dataset.id,
      lastUpdated: dataset.lastUpdated,
      fileHash: dataset.fileHash,
      fileSize: dataset.fileSize,
      version: dataset.version || undefined,
    };
  }

  /**
   * Get current dataset (alias for getCurrentDataset for backward compatibility)
   */
  async getLatestDataset(): Promise<GTFSDatasetResponseDto | null> {
    return this.getCurrentDataset();
  }

  /**
   * Clear all GTFS data and tracking - forces complete re-import
   */
  async clearAllGTFSData(): Promise<void> {
    try {
      this.logger.debug('Clearing all GTFS data and tracking...');

      // Clear all GTFS datasets and files (cascade will handle files)
      await this.prisma.gTFSDataset.deleteMany({});

      await this.prisma.$executeRawUnsafe(
        'DELETE FROM public.gtfs_feed_datasets WHERE source = $1',
        'artesp',
      );

      for (const feed of ['sptrans', 'artesp'] as const) {
        for (const table of GTFSConfig.getRawTables(feed)) {
          await this.prisma.$executeRawUnsafe(
            `TRUNCATE TABLE "${GTFSConfig.EXTERNAL_SCHEMA}"."${table}" RESTART IDENTITY CASCADE`,
          );
          this.logger.debug(`Cleared ${table}`);
        }
      }

      this.logger.debug('All GTFS data and tracking cleared');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to clear GTFS data:', errorMessage);
      throw withCause(`Clear data failed: ${errorMessage}`, error);
    }
  }
}

function withCause(message: string, cause: unknown): Error {
  const wrapped = new Error(message);
  Object.defineProperty(wrapped, 'cause', {
    configurable: true,
    enumerable: false,
    value: cause,
  });
  return wrapped;
}
