import { Injectable } from '@nestjs/common';
import { createRoutesLoader } from '../../search/loaders/stop.routes.loader';
import { GeographyServiceOptimized } from '../../geography/services/geography-optimized.service';
import { BusDirectionService } from '../../geography/services/bus-direction.service';
import { GeometryData } from '../../geography/entities/geography.entity';
import { SearchBusRoute } from '../../search/entities/search.entity';
import DataLoader from 'dataloader';

const MAX_BUS_DIRECTION_GEOMETRIES_PER_REQUEST = 1_000;
const MAX_BUS_DIRECTION_GEOMETRY_BATCH_SIZE = 500;

@Injectable()
export class LoadersService {
  constructor(
    private readonly geographyService: GeographyServiceOptimized,
    private readonly busDirections: BusDirectionService,
  ) {}

  createLoaders() {
    return {
      routesLoader: createRoutesLoader(this.geographyService),
      busDirectionGeometryLoader: createBusDirectionGeometryLoader(this.busDirections),
    };
  }
}

export function normalizeBusDirectionShapeIds(shapeIds: readonly string[]): string[] {
  return [...new Set(shapeIds)].sort();
}

export function busDirectionGeometryKey(shapeIds: readonly string[]): string {
  return JSON.stringify(normalizeBusDirectionShapeIds(shapeIds));
}

function createBusDirectionGeometryLoader(
  busDirections: BusDirectionService,
): BusDirectionGeometryLoader {
  const requestedKeys = new Set<string>();
  const loader = new DataLoader<string[], GeometryData | null, string>(
    (shapeIds) => busDirections.geometries(
      shapeIds.map(normalizeBusDirectionShapeIds),
    ),
    {
      cacheKeyFn: busDirectionGeometryKey,
      maxBatchSize: MAX_BUS_DIRECTION_GEOMETRY_BATCH_SIZE,
    },
  );

  return {
    load(shapeIds) {
      const key = busDirectionGeometryKey(shapeIds);
      if (!requestedKeys.has(key)) {
        if (requestedKeys.size >= MAX_BUS_DIRECTION_GEOMETRIES_PER_REQUEST) {
          return Promise.resolve(null);
        }
        requestedKeys.add(key);
      }
      return loader.load(shapeIds);
    },
  };
}

export interface BusDirectionGeometryLoader {
  load(shapeIds: string[]): Promise<GeometryData | null>;
}

export interface GraphQLLoaders {
  routesLoader: DataLoader<string, SearchBusRoute[]>;
  busDirectionGeometryLoader: BusDirectionGeometryLoader;
}
