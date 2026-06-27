import { Args, Query, Resolver } from '@nestjs/graphql';
import { NearbyStopsInput } from '../dto/search.input';
import { SearchResultUnion } from '../entities/search.entity';
import {
  NearbySearchDocument,
  TypesenseService,
} from '../services/typesense.service';
import { Logger } from '@nestjs/common';
import { StopsAndStations } from '@metro/shared/utils';

@Resolver()
export class NearbyResolver {
  private logger = new Logger(NearbyResolver.name);
  constructor(private typesenseService: TypesenseService) {}
  @Query(() => [SearchResultUnion])
  async nearbyStops(
    @Args('input') input: NearbyStopsInput,
  ): Promise<NearbySearchDocument[]> {
    try {
      const types: StopsAndStations[] | undefined = input.type
        ? [input.type]
        : undefined;
      const hits = await this.typesenseService.searchNearbyStops(
        input.latitude,
        input.longitude,
        input.radiusMeters || 1000,
        types,
        input.limit ?? 20,
      );

      return hits.map((hit) => this.formatNearbyDocument(hit.document));
    } catch (error) {
      this.logger.error('Nearby stops search failed:', error);
      throw new Error('Nearby stops search failed');
    }
  }

  private formatNearbyDocument(document: NearbySearchDocument) {
    if (document.type === 'bikeStation') {
      return {
        ...document,
        latitude: document.location[0],
        longitude: document.location[1],
      };
    }

    if (document.type === 'railStation' && document.location) {
      return {
        ...document,
        latitude: document.location[0],
        longitude: document.location[1],
      };
    }

    return document;
  }
}
