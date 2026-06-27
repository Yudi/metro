import { Injectable } from '@nestjs/common';
import { createRoutesLoader } from '../../search/loaders/stop.routes.loader';
import { GeographyServiceOptimized } from '../../geography/services/geography-optimized.service';
import { SearchBusRoute } from '../../search/entities/search.entity';
import DataLoader from 'dataloader';

@Injectable()
export class LoadersService {
  constructor(private readonly geographyService: GeographyServiceOptimized) {}

  createLoaders() {
    return {
      routesLoader: createRoutesLoader(this.geographyService),
    };
  }
}
export interface GraphQLLoaders {
  routesLoader: DataLoader<string, SearchBusRoute[]>;
}
