import { Injectable, Logger } from '@nestjs/common';
import { GTFSDatabaseService } from './gtfs-database.service';
import { SearchService } from '../../search/services/search.service';
import { SubwayStationProcessorService } from '../../vector-tiles/services/subway-station-processor.service';
import { VectorTilesService } from '../../vector-tiles/vector-tiles.service';
import { TransitDataPrecomputeService } from '../../transit-data/transit-data-precompute.service';

export interface DataImportHookOptions {
  readonly dataChanged?: boolean;
  readonly sourceSignature?: string;
}

@Injectable()
export class DataImportHooksService {
  private readonly logger = new Logger(DataImportHooksService.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly subwayStationProcessor: SubwayStationProcessorService,
    private readonly vectorTilesService: VectorTilesService,
    private readonly transitDataPrecompute: TransitDataPrecomputeService,
    private readonly gtfsDatabaseService: GTFSDatabaseService,
  ) {}

  async onDataImportComplete(options: DataImportHookOptions = {}): Promise<void> {
    const dataChanged = options.dataChanged ?? true;
    const sourceSignature = options.sourceSignature;

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
      await this.gtfsDatabaseService.analyzeImportedTables();
    }

    this.logger.debug('Processing subway stations...');
    await this.subwayStationProcessor.refreshMergedStations();

    this.logger.debug('Refreshing GTFS-derived transit data...');
    await this.transitDataPrecompute.refreshAfterGtfsImport();

    // Clear vector tile cache to force regeneration only after station
    // processing succeeds.
    this.vectorTilesService.clearCache();
    this.logger.debug(
      'Subway stations and precomputed transit data refreshed; tile cache cleared',
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
