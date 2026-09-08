import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { parse, validate } from 'graphql';
import { BusPublishedRouteInformationResolver } from './bus-published-route-information.resolver';

describe('published route information GraphQL contract', () => {
  it('accepts route metadata and supplemental schedule fields', async () => {
    const module = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    try {
      const factory = module.get(GraphQLSchemaFactory);
      const schema = await factory.create([
        BusPublishedRouteInformationResolver,
      ]);
      expect(
        validate(
          schema,
          parse(`
            query Published($routeId: String!) {
              busPublishedRouteInformation(routeId: $routeId) {
                status routeCode lastUpdated operatorName consortiumName
                route { routeId shortName longName sourceAgency fares { price currency } }
                days {
                  kind
                  directions {
                    id headsign departures startTime endTime
                    streets { name number notices }
                    travelTimes { period minutes }
                  }
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
