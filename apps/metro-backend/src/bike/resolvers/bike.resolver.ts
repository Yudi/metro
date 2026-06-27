import { Resolver, Query } from '@nestjs/graphql';
import { BikePollingService } from '../services/bike-polling.service';
import { BikeStationsSummaryPayloadDto } from '../dto/bike.dto';

@Resolver()
export class BikeResolver {
  constructor(private readonly polling: BikePollingService) {}

  @Query(() => BikeStationsSummaryPayloadDto, {
    description:
      'Lightweight summary of bike stations with availability details for map initialization.',
  })
  async bikeStationsSummary(): Promise<BikeStationsSummaryPayloadDto> {
    return this.polling.getLatestSummaryPayload();
  }
}
