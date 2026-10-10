import { Test } from '@nestjs/testing';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { BusDirectionResolver } from './bus-direction.resolver';

describe('BusDirectionResolver', () => {
  it('exposes flattened direction fields and inherited route fields in the schema', async () => {
    const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    try {
      const schema = await module.get(GraphQLSchemaFactory).create([BusDirectionResolver]);
      const fields = schema.getQueryType()?.getFields();
      expect(fields?.['favoriteBusDirections'].type.toString()).toBe('[BusRouteDirection!]!');
      const direction = schema.getType('BusRouteDirection');
      expect(direction?.toString()).toBe('BusRouteDirection');
    } finally {
      await module.close();
    }
  });

  it('validates bounded lookup batches before reading GTFS', () => {
    const directions = { forRoutes: jest.fn(), forFavorites: jest.fn() };
    const resolver = new BusDirectionResolver(directions as never);
    expect(() => resolver.favoriteBusDirections(Array.from({ length: 501 }, (_, index) => String(index)))).toThrow();
    expect(() => resolver.busRouteDirections(['route-1'], 'bad\nstop')).toThrow();
    expect(directions.forRoutes).not.toHaveBeenCalled();
    expect(directions.forFavorites).not.toHaveBeenCalled();
  });
});
