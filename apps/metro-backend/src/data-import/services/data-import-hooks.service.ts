import { Injectable, Logger } from '@nestjs/common';
import { SearchService } from '../../search/services/search.service';
import { SubwayStationProcessorService } from '../../vector-tiles/services/subway-station-processor.service';
import { VectorTilesService } from '../../vector-tiles/vector-tiles.service';

@Injectable()
export class DataImportHooksService {
  private readonly logger = new Logger(DataImportHooksService.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly subwayStationProcessor: SubwayStationProcessorService,
    private readonly vectorTilesService: VectorTilesService
  ) {}

  async onDataImportComplete(): Promise<void> {
    this.logger.debug('Data import completed, running post-import hooks...');

    // Process and merge subway stations for vector tiles
    try {
      this.logger.debug('Processing subway stations...');
      await this.subwayStationProcessor.refreshMergedStations();

      // Clear vector tile cache to force regeneration
      this.vectorTilesService.clearCache();
      this.logger.debug('Subway stations processed and tile cache cleared');
    } catch (error) {
      this.logger.error('Failed to process subway stations:', error);
      // Don't throw error to avoid failing the import process
    }

    // Update search index
    try {
      this.logger.debug('Updating search index...');
      await this.searchService.indexAllData();
      this.logger.debug('Search index updated successfully');
    } catch (error) {
      this.logger.error('Failed to update search index:', error);
      // Don't throw error to avoid failing the import process
    }
  }
}
