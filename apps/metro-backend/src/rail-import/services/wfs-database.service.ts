import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WFSDatasetMetadata, WFSSourceType } from '../types/wfs.types';
import { WFSConfig } from '../config/wfs.config';

/**
 * Manages import metadata for GeoSampa WFS rail layers.
 *
 * The table is still named gpkg_datasets for compatibility with existing
 * migrations and Prisma client shape; it now stores the latest WFS response
 * hash per rail source.
 */
@Injectable()
export class WFSDatabaseService {
  private readonly logger = new Logger(WFSDatabaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  async isCurrentHash(
    source: WFSSourceType,
    fileHash: string,
  ): Promise<boolean> {
    const existing = await this.prisma.gPKGDataset.findUnique({
      where: { source },
    });

    return existing?.fileHash === fileHash;
  }

  async createOrUpdateDataset(
    metadata: WFSDatasetMetadata,
  ): Promise<{ id: string }> {
    const { source, fileHash, fileSize } = metadata;

    const dataset = await this.prisma.gPKGDataset.upsert({
      where: { source },
      update: {
        fileHash,
        fileSize,
        lastUpdated: new Date(),
      },
      create: {
        source,
        fileHash,
        fileSize,
      },
      select: { id: true },
    });

    this.logger.debug(`WFS dataset record updated for ${source}: #${dataset.id}`);
    return dataset;
  }

  async getAllDatasets() {
    return await this.prisma.gPKGDataset.findMany({
      orderBy: { lastUpdated: 'desc' },
    });
  }

  async clearAllRailData(): Promise<void> {
    this.logger.debug('Clearing all GeoSampa WFS rail data...');

    await this.prisma.$transaction([
      this.prisma.gPKGDataset.deleteMany({}),
      this.prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "${WFSConfig.EXTERNAL_SCHEMA}".metro_station CASCADE`,
      ),
      this.prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "${WFSConfig.EXTERNAL_SCHEMA}".metro_line CASCADE`,
      ),
      this.prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "${WFSConfig.EXTERNAL_SCHEMA}".trem_station CASCADE`,
      ),
      this.prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "${WFSConfig.EXTERNAL_SCHEMA}".trem_line CASCADE`,
      ),
    ]);

    this.logger.debug('All GeoSampa WFS rail data cleared');
  }
}
