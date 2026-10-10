import { Injectable, Logger } from '@nestjs/common';
import { GTFSDatabaseService } from './gtfs-database.service';
import { SearchService } from '../../search/services/search.service';
import { RailVectorTileService } from '../../vector-tiles/services/rail-vector-tile.service';
import { VectorTilesService } from '../../vector-tiles/vector-tiles.service';
import { TransitDataPrecomputeService } from '../../transit-data/transit-data-precompute.service';
import { RouteStopMappingService } from '../../realtime/services/route-stop-mapping.service';
import { GTFSFeed } from '../config/gtfs.config';
import { RAIL_DATASET_SIGNATURE } from '../../rail-import/config/rail-datasets.config';

export interface DataImportHookOptions {
  readonly dataChanged?: boolean;
  readonly sourceSignature?: string;
  readonly feeds?: readonly GTFSFeed[];
}

@Injectable()
export class DataImportHooksService {
  private readonly logger = new Logger(DataImportHooksService.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly railVectorTileService: RailVectorTileService,
    private readonly vectorTilesService: VectorTilesService,
    private readonly transitDataPrecompute: TransitDataPrecomputeService,
    private readonly gtfsDatabaseService: GTFSDatabaseService,
    private readonly routeStopMapping: RouteStopMappingService,
  ) {}

  async onDataImportComplete(
    options: DataImportHookOptions = {},
  ): Promise<void> {
    const dataChanged = options.dataChanged ?? true;
    const sourceSignature = options.sourceSignature
      ? `${options.sourceSignature}:rail=${RAIL_DATASET_SIGNATURE}`
      : undefined;
    const feeds = options.feeds ?? ['sptrans'];

    if (
      !dataChanged &&
      sourceSignature &&
      (await this.transitDataPrecompute.isGtfsPostProcessingCurrent(
        sourceSignature,
      ))
    ) {
      this.logger.debug(
        'GTFS data and all derived post-processing are current; skipping hooks',
      );
      return;
    }

    // Mark pending before analysis and derived rebuilds so interrupted runs retry.
    if (sourceSignature) {
      await this.transitDataPrecompute.markGtfsPostProcessingPending(
        sourceSignature,
      );
    }

    this.logger.debug('Data import completed, running post-import hooks...');

    if (dataChanged || sourceSignature) {
      this.logger.debug('Analyzing replaced GTFS tables...');
      for (const feed of feeds) {
        await this.gtfsDatabaseService.analyzeImportedTables(feed);
      }
    }

    this.logger.debug('Refreshing the selected rail station and route catalog...');
    await this.railVectorTileService.refreshMvtViewsWithinImport();

    this.logger.debug('Refreshing GTFS-derived transit data...');
    await this.transitDataPrecompute.refreshAfterGtfsImport();

    this.routeStopMapping.clearCaches();

    // Clear vector tile cache to force regeneration only after station
    // processing succeeds.
    this.vectorTilesService.clearCache();
    this.logger.debug(
      'Rail stations and precomputed transit data refreshed; tile cache cleared',
    );

    this.logger.debug('Updating search index...');
    await this.searchService.indexAllData();
    this.logger.debug('Search index updated successfully');

    if (sourceSignature) {
      await this.transitDataPrecompute.markGtfsPostProcessingComplete(
        sourceSignature,
      );
    }
  }
}
