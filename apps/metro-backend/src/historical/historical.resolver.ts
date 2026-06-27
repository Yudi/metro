import { Args, Int, Query, Resolver } from '@nestjs/graphql';
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
    return this.historicalService.getHistoricalData(filter, limit, offset);
  }
}
