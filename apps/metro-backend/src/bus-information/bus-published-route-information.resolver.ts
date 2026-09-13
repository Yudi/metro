import { Args, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { BusPublishedRouteInformation } from './bus-published-route-information.entity';
import { BusPublishedRouteInformationService } from './bus-published-route-information.service';
import { validateItineraryRouteId } from './bus-route-itinerary.service';

@Resolver()
export class BusPublishedRouteInformationResolver {
  private readonly inFlight = new Map<
    string,
    Promise<BusPublishedRouteInformation>
  >();

  constructor(
    private readonly published: BusPublishedRouteInformationService,
  ) {}

  @Query(() => BusPublishedRouteInformation, {
    description:
      'Published supplemental route information from an internal sanitized service. Only eligible SPTrans route codes are requested; this data is independent from GTFS itinerary schedules.',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  busPublishedRouteInformation(
    @Args('routeId') routeId: string,
  ): Promise<BusPublishedRouteInformation> {
    const normalizedRouteId = validateItineraryRouteId(routeId);
    const pending = this.inFlight.get(normalizedRouteId);
    if (pending) return pending;

    const request = this.published.getInformation(normalizedRouteId);
    this.inFlight.set(normalizedRouteId, request);
    const clear = () => {
      if (this.inFlight.get(normalizedRouteId) === request) {
        this.inFlight.delete(normalizedRouteId);
      }
    };
    void request.then(clear, clear);
    return request;
  }
}
