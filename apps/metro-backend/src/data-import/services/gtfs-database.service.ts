import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GTFSFileInfo } from '../types/gtfs.types';
import { GTFSConfig } from '../config/gtfs.config';
import {
  CreateGTFSDatasetDto,
  GTFSDatasetResponseDto,
} from '../dto/gtfs-dataset.dto';

@Injectable()
export class GTFSDatabaseService {
  private readonly logger = new Logger(GTFSDatabaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get current dataset (there should only be one)
   */
  async getCurrentDataset(): Promise<GTFSDatasetResponseDto | null> {
    const dataset = await this.findLatestCompleteDataset();
    if (!dataset) return null;

    return this.toDatasetResponse(dataset);
  }

  /**
   * Check if current dataset hash matches the provided hash
   */
  async isCurrentHash(fileHash: string): Promise<boolean> {
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
  ): Promise<GTFSDatasetResponseDto> {
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
  async findFileByDatasetAndName(datasetId: string, fileName: string) {
    return await this.prisma.gTFSFile.findUnique({
      where: {
        datasetId_fileName: {
          datasetId,
          fileName,
        },
      },
    });
  }

  /**
   * Find GTFS file by hash across all datasets
   */
  async findFileByHash(fileHash: string) {
    return await this.prisma.gTFSFile.findFirst({
      where: { fileHash },
      include: { dataset: true },
      orderBy: { lastUpdated: 'desc' },
    });
  }

  /**
   * Create or update GTFS file records for a dataset
   */
  async upsertDatasetFiles(
    datasetId: string,
    files: GTFSFileInfo[],
  ): Promise<void> {
    try {
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
      throw new Error(`Database error: ${errorMessage}`);
    }
  }

  /**
   * Update file record with processing info
   */
  async updateFileRecord(
    datasetId: string,
    fileName: string,
    recordCount?: number,
  ): Promise<void> {
    try {
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
      throw new Error(`Database error: ${errorMessage}`);
    }
  }

  private async findLatestCompleteDataset() {
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
        (file) => (file.recordCount ?? 0) > 0,
      );

      return requiredFilesComplete && presentFilesComplete;
    });
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

      for (const table of GTFSConfig.getRawTables()) {
        await this.prisma.$executeRawUnsafe(
          `TRUNCATE TABLE "${GTFSConfig.EXTERNAL_SCHEMA}"."${table}" RESTART IDENTITY CASCADE`,
        );
        this.logger.debug(`Cleared ${table}`);
      }

      this.logger.debug('All GTFS data and tracking cleared');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to clear GTFS data:', errorMessage);
      throw new Error(`Clear data failed: ${errorMessage}`);
    }
  }
}
