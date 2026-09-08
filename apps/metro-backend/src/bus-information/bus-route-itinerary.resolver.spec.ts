import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { parse, validate } from 'graphql';
import { BusRouteItineraryResolver } from './bus-route-itinerary.resolver';

describe('bus route itinerary GraphQL contract', () => {
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

