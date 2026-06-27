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
    try {
      const dataset = await this.prisma.gTFSDataset.findFirst({
        include: { gtfsFiles: true },
      });

      if (!dataset) return null;

      return {
        id: dataset.id,
        lastUpdated: dataset.lastUpdated,
        fileHash: dataset.fileHash,
        fileSize: dataset.fileSize,
        version: dataset.version || undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get current dataset:`, errorMessage);
      return null;
    }
  }

  /**
   * Check if current dataset hash matches the provided hash
   */
  async isCurrentHash(fileHash: string): Promise<boolean> {
    try {
      const dataset = await this.prisma.gTFSDataset.findFirst({
        where: { fileHash },
      });
      return dataset !== null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to check current hash:`, errorMessage);
      return false;
    }
  }

  /**
   * Create or update GTFS dataset record (always replace with latest)
   */
  async createOrUpdateDataset(
    dto: CreateGTFSDatasetDto
  ): Promise<GTFSDatasetResponseDto> {
    try {
      // Delete existing dataset (if any) since we only keep the current one
      await this.prisma.gTFSDataset.deleteMany({});

      // Create new dataset
      const dataset = await this.prisma.gTFSDataset.create({
        data: {
          fileHash: dto.fileHash,
          fileSize: dto.fileSize,
          version: dto.version,
        },
      });

      return {
        id: dataset.id,
        lastUpdated: dataset.lastUpdated,
        fileHash: dataset.fileHash,
        fileSize: dataset.fileSize,
        version: dataset.version || undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create/update dataset:`, errorMessage);
      throw new Error(`Database error: ${errorMessage}`);
    }
  }

  /**
   * Find GTFS file by dataset ID and filename
   */
  async findFileByDatasetAndName(datasetId: string, fileName: string) {
    try {
      return await this.prisma.gTFSFile.findUnique({
        where: {
          datasetId_fileName: {
            datasetId,
            fileName,
          },
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to find file ${fileName} for dataset ${datasetId}:`,
        errorMessage
      );
      return null;
    }
  }

  /**
   * Find GTFS file by hash across all datasets
   */
  async findFileByHash(fileHash: string) {
    try {
      return await this.prisma.gTFSFile.findFirst({
        where: { fileHash },
        include: { dataset: true },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to find file by hash ${fileHash}:`,
        errorMessage
      );
      return null;
    }
  }

  /**
   * Create or update GTFS file records for a dataset
   */
  async upsertDatasetFiles(
    datasetId: string,
    files: GTFSFileInfo[]
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
        `Upserted ${files.length} file records for dataset ${datasetId}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to upsert files for dataset ${datasetId}:`,
        errorMessage
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
    recordCount?: number
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
          `TRUNCATE TABLE "${GTFSConfig.EXTERNAL_SCHEMA}"."${table}" RESTART IDENTITY CASCADE`
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

  /**
   * Disconnect Prisma client
   */
  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
