import { Args, Query, Resolver } from '@nestjs/graphql';
import { BusRouteItinerary } from './bus-route-itinerary.entity';
import {
  BusRouteItineraryService,
  validateItineraryRouteId,
  validateItineraryServiceDate,
} from './bus-route-itinerary.service';

@Resolver()
export class BusRouteItineraryResolver {
  constructor(private readonly itineraries: BusRouteItineraryService) {}

  @Query(() => BusRouteItinerary, {
    description:
      'Published route itinerary for a specific service date. Exact departures are measured at the first stop; frequency rows remain templates and are never expanded into live predictions.',
  })
  busRouteItinerary(
    @Args('routeId') routeId: string,
    @Args('serviceDate') serviceDate: string,
  ): Promise<BusRouteItinerary> {
    return this.itineraries.getItinerary(
      validateItineraryRouteId(routeId),
      validateItineraryServiceDate(serviceDate),
    );
  }
}
