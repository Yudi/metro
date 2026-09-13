import { Args, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { BusRouteItinerary } from './bus-route-itinerary.entity';
import {
  BusRouteItineraryService,
  validateItineraryRouteId,
  validateItineraryServiceDate,
} from './bus-route-itinerary.service';

@Resolver()
export class BusRouteItineraryResolver {
  private readonly inFlight = new Map<string, Promise<BusRouteItinerary>>();

  constructor(private readonly itineraries: BusRouteItineraryService) {}

  @Query(() => BusRouteItinerary, {
    description:
      'Published route itinerary for a specific service date. Exact departures are measured at the first stop; frequency rows remain templates and are never expanded into live predictions.',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  busRouteItinerary(
    @Args('routeId') routeId: string,
    @Args('serviceDate') serviceDate: string,
  ): Promise<BusRouteItinerary> {
    const normalizedRouteId = validateItineraryRouteId(routeId);
    const normalizedServiceDate = validateItineraryServiceDate(serviceDate);
    const key = `${normalizedRouteId}\u0000${normalizedServiceDate}`;
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.itineraries.getItinerary(
      normalizedRouteId,
      normalizedServiceDate,
    );
    this.inFlight.set(key, request);
    const clear = () => {
      if (this.inFlight.get(key) === request) this.inFlight.delete(key);
    };
    void request.then(clear, clear);
    return request;
  }
}
