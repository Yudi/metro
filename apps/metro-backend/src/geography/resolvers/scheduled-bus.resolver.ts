import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { ScheduledBusDeparture } from '../entities/geography.entity';
import { ScheduledBusService } from '../services/scheduled-bus.service';

@Resolver()
export class ScheduledBusResolver {
  constructor(private readonly schedules: ScheduledBusService) {}

  @Query(() => [ScheduledBusDeparture], {
    description:
      'Upcoming published Artesp departures within seven days, in America/Sao_Paulo service time. These are schedules, not live arrival predictions.',
  })
  scheduledBusDepartures(
    @Args('stopId') stopId: string,
    @Args('limit', { type: () => Int, defaultValue: 12 }) limit: number,
    @Args('perRouteLimit', { type: () => Int, nullable: true })
    perRouteLimit?: number | null,
  ): Promise<ScheduledBusDeparture[]> {
    return this.schedules.getDepartures(
      stopId,
      limit,
      undefined,
      perRouteLimit ?? undefined,
    );
  }
}
