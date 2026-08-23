import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import { HistoricalDataFilterInput } from './dto/historical-data.input';
import { HistoricalDataEntity } from './entities/historical-data.entity';
import { HistoricalService } from './historical.service';

@Resolver(() => HistoricalDataEntity)
export class HistoricalResolver {
  constructor(private readonly historicalService: HistoricalService) {}

  @Query(() => HistoricalDataEntity, {
    name: 'historicalData',
    description:
      'Retrieve historical incidents, backend transparency events, retrieval issues, and headway snapshots',
  })
  getHistoricalData(
    @Args('filter', {
      type: () => HistoricalDataFilterInput,
      nullable: true,
      description: 'Optional filters for historical data',
    })
    filter?: HistoricalDataFilterInput,
    @Args('limit', {
      type: () => Int,
      nullable: true,
      description: 'Maximum rows returned for each historical data kind',
    })
    limit?: number,
    @Args('offset', {
      type: () => Int,
      nullable: true,
      description: 'Rows to skip for each historical data kind',
    })
    offset?: number,
  ): Promise<HistoricalDataEntity> {
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)) {
      throw new BadRequestException('limit must be an integer between 1 and 500');
    }
    if (
      offset !== undefined &&
      (!Number.isInteger(offset) || offset < 0 || offset > 10_000)
    ) {
      throw new BadRequestException(
        'offset must be an integer between 0 and 10000',
      );
    }
    return this.historicalService.getHistoricalData(filter, limit, offset);
  }
}
