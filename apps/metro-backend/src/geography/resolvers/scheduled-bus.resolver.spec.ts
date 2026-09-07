import { Test } from '@nestjs/testing';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { validate, parse } from 'graphql';
import { ScheduledBusResolver } from './scheduled-bus.resolver';

describe('scheduled bus GraphQL contract', () => {
  it('accepts the frontend departure query without starting application services', async () => {
    const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    try {
      const factory = module.get(GraphQLSchemaFactory);
      const schema = await factory.create([ScheduledBusResolver]);
      expect(validate(schema, parse(`
        query Departures($stopId: String!, $limit: Int!, $perRouteLimit: Int) {
          scheduledBusDepartures(stopId: $stopId, limit: $limit, perRouteLimit: $perRouteLimit) {
            routeId routeShortName tripId headsign directionId departureTime sourceAgency platformCode
          }
        }
      `))).toEqual([]);
    } finally {
      await module.close();
    }
  });

  it('forwards the optional per-route limit while preserving the service now argument slot', async () => {
    const getDepartures = jest.fn().mockResolvedValue([]);
    const resolver = new ScheduledBusResolver({ getDepartures } as never);

    await resolver.scheduledBusDepartures('42', 12, 5);

    expect(getDepartures).toHaveBeenCalledWith('42', 12, undefined, 5);
  });
});
