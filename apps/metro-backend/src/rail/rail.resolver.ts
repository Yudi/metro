import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { RailService } from './rail.service';
import { RailLine, RailLinesStatus } from './entities/rail-line-status.entity';

@Resolver(() => RailLine)
export class RailResolver {
  constructor(private readonly railService: RailService) {}

  @Query(() => RailLinesStatus, {
    name: 'railLinesStatus',
    description:
      'Get status of all rail lines (cached, refreshed every 5 minutes)',
  })
  getLinesStatus(): Promise<RailLinesStatus> {
    return this.railService.getLinesStatus();
  }

  @Query(() => RailLine, {
    name: 'railLineStatus',
    nullable: true,
    description: 'Get status of a specific rail line by code',
  })
  getLineStatus(
    @Args('code', {
      type: () => Int,
      description: 'Line code (e.g., 1 for L1)',
    })
    code: number
  ): Promise<RailLine | null> {
    return this.railService.getLineStatus(code);
  }

  @Query(() => [RailLine], {
    name: 'railLineStatuses',
    description: 'Get status of multiple rail lines by codes',
  })
  getLineStatuses(
    @Args('codes', {
      type: () => [Int],
      description: 'Array of line codes to fetch',
    })
    codes: number[]
  ): Promise<RailLine[]> {
    return this.railService.getLineStatuses(codes);
  }
}
