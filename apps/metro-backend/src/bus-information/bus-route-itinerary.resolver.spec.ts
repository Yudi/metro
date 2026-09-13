import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { parse, validate } from 'graphql';
import { BusRouteItineraryResolver } from './bus-route-itinerary.resolver';

describe('bus route itinerary GraphQL contract', () => {
  it('coalesces concurrent requests for the same normalized route and date', async () => {
    let resolve!: (value: never) => void;
    const result = new Promise<never>((done) => (resolve = done));
    const getItinerary = jest.fn().mockReturnValue(result);
    const resolver = new BusRouteItineraryResolver({ getItinerary } as never);

    const first = resolver.busRouteItinerary(' 477A-10 ', ' 2026-09-08 ');
    const second = resolver.busRouteItinerary('477A-10', '2026-09-08');

    expect(first).toBe(second);
    expect(getItinerary).toHaveBeenCalledTimes(1);
    resolve({} as never);
    await first;
  });

  it('accepts the public route itinerary selection', async () => {
    const module = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    try {
      const factory = module.get(GraphQLSchemaFactory);
      const schema = await factory.create([BusRouteItineraryResolver]);
      expect(
        validate(
          schema,
          parse(`
            query Itinerary($routeId: String!, $serviceDate: String!) {
              busRouteItinerary(routeId: $routeId, serviceDate: $serviceDate) {
                status serviceDate operatorName
                route { routeId shortName longName sourceAgency fares { price currency } }
                patterns {
                  id directionId headsign durationMinutes departures
                  stops { id name sequence latitude longitude }
                  intervals { startTime endTime headwaySeconds exactTimes }
                }
              }
            }
          `),
        ),
      ).toEqual([]);
    } finally {
      await module.close();
    }
  });
});
