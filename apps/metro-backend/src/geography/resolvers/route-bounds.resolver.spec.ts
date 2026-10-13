import { Test } from '@nestjs/testing';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { RouteBoundsResolver } from './route-bounds.resolver';
import { RouteBoundsService } from '../services/route-bounds.service';

describe('RouteBoundsResolver', () => {
  it('exposes a nullable bounding box with a required route identifier', async () => {
    const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    try {
      const schema = await module.get(GraphQLSchemaFactory).create([RouteBoundsResolver]);
      const query = schema.getQueryType()?.getFields()['routeBounds'];
      expect(query?.type.toString()).toBe('BoundingBox');
      expect(query?.args[0].type.toString()).toBe('String!');
    } finally {
      await module.close();
    }
  });

  it('validates the identifier before querying geometry', () => {
    const getBounds = jest.fn();
    const resolver = new RouteBoundsResolver({ getBounds } as unknown as RouteBoundsService);
    expect(() => resolver.routeBounds('bad\nroute')).toThrow();
    expect(getBounds).not.toHaveBeenCalled();
    resolver.routeBounds(' route-1 ');
    expect(getBounds).toHaveBeenCalledWith('route-1');
  });
});
