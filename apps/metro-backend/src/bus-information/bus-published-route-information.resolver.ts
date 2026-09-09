import { Args, Query, Resolver } from '@nestjs/graphql';
import { BusPublishedRouteInformation } from './bus-published-route-information.entity';
import { BusPublishedRouteInformationService } from './bus-published-route-information.service';

@Resolver()
export class BusPublishedRouteInformationResolver {
  constructor(
    private readonly published: BusPublishedRouteInformationService,
  ) {}

  @Query(() => BusPublishedRouteInformation, {
    description:
      'Published supplemental route information from an internal sanitized service. Only eligible SPTrans route codes are requested; this data is independent from GTFS itinerary schedules.',
  })
  busPublishedRouteInformation(
    @Args('routeId') routeId: string,
  ): Promise<BusPublishedRouteInformation> {
    return this.published.getInformation(routeId);
  }
}
