import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { parse, validate } from 'graphql';
import { BusPublishedRouteInformationResolver } from './bus-published-route-information.resolver';

describe('published route information GraphQL contract', () => {
  it('coalesces concurrent requests for the same normalized route', async () => {
    let resolve!: (value: never) => void;
    const result = new Promise<never>((done) => (resolve = done));
    const getInformation = jest.fn().mockReturnValue(result);
    const resolver = new BusPublishedRouteInformationResolver({
      getInformation,
    } as never);

    const first = resolver.busPublishedRouteInformation(' 477A-10 ');
    const second = resolver.busPublishedRouteInformation('477A-10');

    expect(first).toBe(second);
    expect(getInformation).toHaveBeenCalledTimes(1);
    resolve({} as never);
    await first;
  });

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
