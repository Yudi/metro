import { ServiceUnavailableException } from '@nestjs/common';
import { SearchResolver } from './search.resolver';
import type { TypesenseService } from '../services/typesense.service';
import type { SearchService } from '../services/search.service';
import type { GraphQLLoaders } from '../../common/graphql/loaders.service';
import type { SearchBusStop } from '../entities/search.entity';
import { Kind, parse } from 'graphql';
import type { FragmentDefinitionNode, GraphQLResolveInfo } from 'graphql';
import {
  busRouteSearchResult,
  busStopSearchResult,
  railLineSearchResult,
  railStationSearchResult,
} from '../testing/search.fixtures';

describe('SearchResolver', () => {
  function routeInfo(selection: string, variables: Record<string, unknown> = {}): GraphQLResolveInfo {
    const document = parse(`query { routes { ${selection} } } fragment Direction on SearchBusRoute { destination }`);
    const operation = document.definitions.find((definition) =>
      definition.kind === Kind.OPERATION_DEFINITION,
    );
    if (!operation || operation.kind !== Kind.OPERATION_DEFINITION) {
      throw new Error('Missing test operation');
    }
    const fragments: Record<string, FragmentDefinitionNode> = {};
    for (const definition of document.definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragments[definition.name.value] = definition;
      }
    }
    return {
      fieldNodes: operation.selectionSet.selections,
      fragments,
      variableValues: variables,
    } as unknown as GraphQLResolveInfo;
  }

  it.each(['route_short_name', 'destination @skip(if: true)', '...Direction @include(if: $show)'])(
    'skips direction work for a stop selection that does not need it: %s',
    async (selection) => {
      const forRoutes = jest.fn();
      const resolver = new SearchResolver({} as TypesenseService, {} as SearchService, { forRoutes } as never);
      const routes = [{ id: 'route-1', route_id: 'route-1' }];
      const loaders = {
        routesLoader: { load: jest.fn().mockResolvedValue(routes) },
      } as unknown as GraphQLLoaders;
      await expect(resolver.routes(
        { stop_id: 'stop-1' } as SearchBusStop, loaders, routeInfo(selection, { show: false }),
      )).resolves.toEqual(routes);
      expect(forRoutes).not.toHaveBeenCalled();
    },
  );

  it.each(['terminal: destination', 'isCircular', '...Direction', '... on SearchBusRoute { favoriteCode }'])(
    'retains requested stop direction enrichment through aliases and fragments: %s',
    async (selection) => {
      const forRoutes = jest.fn().mockResolvedValue([
        {
          routeId: 'route-1', favoriteCode: 'outbound', destination: 'Terminal B',
          isCircular: true, directionId: 0,
        },
      ]);
      const resolver = new SearchResolver({} as TypesenseService, {} as SearchService, { forRoutes } as never);
      const loaders = {
        routesLoader: { load: jest.fn().mockResolvedValue([{ id: 'route-1', route_id: 'route-1' }]) },
      } as unknown as GraphQLLoaders;
      await expect(resolver.routes(
        { stop_id: 'stop-1' } as SearchBusStop, loaders, routeInfo(selection),
      )).resolves.toEqual([expect.objectContaining({
        favoriteCode: 'outbound', destination: 'Terminal B', isCircular: true,
      })]);
    },
  );

  it('returns mixed search results when bus direction enrichment times out', async () => {
    const forRoutes = jest.fn().mockRejectedValue(new Error('statement timeout'));
    const resolver = new SearchResolver(
      {
        search: jest.fn().mockResolvedValue([
          busRouteSearchResult({ route_id: 'route-1' }),
          railStationSearchResult({ station_code: 'station-1' }),
        ]),
      } as unknown as TypesenseService,
      {} as SearchService,
      { forRoutes } as never,
    );

    const results = await resolver.search({ query: 'Terminal' });

    expect(results).toHaveLength(2);
    expect(results).toContainEqual(expect.objectContaining({
      id: 'route-1', route_id: 'route-1', type: 'busRoute',
    }));
    expect(results).toContainEqual(expect.objectContaining({ id: 'station-1' }));
    expect(results.find((result) => result.id === 'route-1')).not.toHaveProperty('favoriteCode');
  });

  it('keeps a stop\'s base routes when direction enrichment times out', async () => {
    const forRoutes = jest.fn().mockRejectedValue(new Error('statement timeout'));
    const resolver = new SearchResolver(
      {} as TypesenseService,
      {} as SearchService,
      { forRoutes } as never,
    );
    const routes = [{ id: 'route-1', route_id: 'route-1' }];
    const loaders = {
      routesLoader: { load: jest.fn().mockResolvedValue(routes) },
    } as unknown as GraphQLLoaders;

    await expect(resolver.routes(
      { stop_id: 'stop-1' } as SearchBusStop,
      loaders,
    )).resolves.toEqual(routes);
    expect(forRoutes).toHaveBeenCalledWith(['route-1'], 'stop-1');
  });

  it('does not load bus directions for a rail-only result set', async () => {
    const forRoutes = jest.fn();
    const resolver = new SearchResolver(
      { search: jest.fn().mockResolvedValue([railStationSearchResult()]) } as unknown as TypesenseService,
      {} as SearchService,
      { forRoutes } as never,
    );

    await expect(resolver.search({ query: 'Sé' })).resolves.toHaveLength(1);
    expect(forRoutes).not.toHaveBeenCalled();
  });

  it('preserves a typed search-unavailable error', async () => {
    const unavailable = new ServiceUnavailableException(
      'Search service is temporarily unavailable',
    );
    const search = jest.fn().mockRejectedValue(unavailable);
    const resolver = new SearchResolver(
      { search } as unknown as TypesenseService,
      {} as SearchService,
      { forRoutes: jest.fn().mockResolvedValue([]) } as never,
    );

    await expect(resolver.search({ query: 'Sé' })).rejects.toBe(unavailable);
  });

  it('does not expose an upstream Typesense error to GraphQL clients', async () => {
    const search = jest.fn().mockRejectedValue({
      message: 'request config contains secret-api-key',
      config: { headers: { 'x-typesense-api-key': 'secret-api-key' } },
    });
    const resolver = new SearchResolver(
      { search } as unknown as TypesenseService,
      {} as SearchService,
      { forRoutes: jest.fn().mockResolvedValue([]) } as never,
    );

    await expect(resolver.search({ query: 'Sé' })).rejects.toThrow(
      'Search failed',
    );
  });

  it('presents one search result for each destination while keeping current feed route IDs', async () => {
    const resolver = new SearchResolver(
      { search: jest.fn().mockResolvedValue([busRouteSearchResult({ route_id: 'route-1' })]) } as unknown as TypesenseService,
      {} as SearchService,
      { forRoutes: jest.fn().mockResolvedValue([
        {
          routeId: 'route-1', favoriteCode: 'outbound', destination: 'Terminal B',
          isCircular: false, directionId: 0,
        },
        {
          routeId: 'route-1', favoriteCode: 'inbound', destination: 'Terminal A',
          isCircular: false, directionId: 1,
        },
      ]) } as never,
    );
    const results = await resolver.search({ query: '001' });
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.id)).toEqual(['outbound', 'inbound']);
    expect(results[1]).toMatchObject({
      route_id: 'route-1', destination: 'Terminal A', isCircular: false,
    });
  });

  it('applies the global limit after Typesense relevance ordering', async () => {
    const search = jest
      .fn()
      .mockResolvedValue([
        busRouteSearchResult({ id: 'route-1', route_id: 'route-1', score: 1 }),
        busStopSearchResult({ id: 'stop-1', stop_id: 'stop-1', score: 2 }),
        busRouteSearchResult({ id: 'route-2', route_id: 'route-2', score: 3 }),
      ]);
    const resolver = new SearchResolver(
      { search } as unknown as TypesenseService,
      {} as SearchService,
      { forRoutes: jest.fn().mockResolvedValue([]) } as never,
    );

    const result = await resolver.search({ query: 'Sé', limit: 2 });
    expect(result.map((item) => item.id)).toEqual(['route-2', 'stop-1']);
  });
});

describe('SearchResolver relevance order', () => {
  it('keeps Typesense relevance ahead of bus feed identity', async () => {
    const resolver = new SearchResolver(
      {
        search: jest.fn().mockResolvedValue([
          busRouteSearchResult({
            id: 'artesp:001',
            route_id: 'artesp:001',
            route_short_name: '001',
            route_long_name: 'Artesp route',
            sourceAgency: 'artesp',
            score: 20,
          }),
          busRouteSearchResult({
            id: '001',
            route_id: '001',
            route_short_name: '001',
            route_long_name: 'SPTrans route',
            score: 10,
          }),
        ]),
      } as unknown as TypesenseService,
      {} as SearchService,
      { forRoutes: jest.fn().mockResolvedValue([]) } as never,
    );
    const result = await resolver.search({ query: '001' });
    expect(result.map((route) => route.id)).toEqual(['artesp:001', '001']);
    expect(result[0]).toMatchObject({
      sourceAgency: 'artesp',
      supportsRealtime: false,
    });
  });

  it('ranks an exact bus route code before a higher-scoring partial match', async () => {
    const resolver = new SearchResolver(
      {
        search: jest.fn().mockResolvedValue([
          busRouteSearchResult({
            id: 'route-partial',
            route_id: 'route-partial',
            route_short_name: '477A-2',
            score: 100,
          }),
          busRouteSearchResult({
            id: 'route-exact',
            route_id: 'route-exact',
            route_short_name: '477A',
            score: 1,
          }),
        ]),
      } as unknown as TypesenseService,
      {} as SearchService,
      { forRoutes: jest.fn().mockResolvedValue([]) } as never,
    );

    const result = await resolver.search({ query: '477A' });
    expect(result.map((route) => route.id)).toEqual([
      'route-exact',
      'route-partial',
    ]);
  });

  it('ranks a full route ID even when the displayed short name omits its suffix', async () => {
    const resolver = new SearchResolver(
      {
        search: jest.fn().mockResolvedValue([
          busRouteSearchResult({
            id: 'route-partial',
            route_id: '477A-10-extra',
            route_short_name: '477A-10-extra',
            score: 100,
          }),
          busRouteSearchResult({
            id: 'route-full-id',
            route_id: '477A-10',
            sourceId: '477A-10',
            route_short_name: '477A',
            score: 1,
          }),
        ]),
      } as unknown as TypesenseService,
      {} as SearchService,
      { forRoutes: jest.fn().mockResolvedValue([]) } as never,
    );

    const result = await resolver.search({ query: '477A-10' });
    expect(result.map((route) => route.id)).toEqual([
      '477A-10',
      '477A-10-extra',
    ]);
  });

  it('ranks an exact bus route name before a higher-scoring partial name', async () => {
    const resolver = new SearchResolver(
      {
        search: jest.fn().mockResolvedValue([
          busRouteSearchResult({
            id: 'route-partial',
            route_id: 'route-partial',
            route_short_name: '901',
            route_long_name: 'Terminal Interlagos - Hospital',
            score: 100,
          }),
          busRouteSearchResult({
            id: 'route-exact',
            route_id: 'route-exact',
            route_short_name: '901A',
            route_long_name: 'Terminal Interlagos',
            score: 1,
          }),
        ]),
      } as unknown as TypesenseService,
      {} as SearchService,
      { forRoutes: jest.fn().mockResolvedValue([]) } as never,
    );

    const result = await resolver.search({ query: 'Terminal Interlagos' });
    expect(result.map((route) => route.id)).toEqual([
      'route-exact',
      'route-partial',
    ]);
  });

  it('orders equal relevance scores by stable result identity', async () => {
    const resolver = new SearchResolver(
      {
        search: jest.fn().mockResolvedValue([
          busRouteSearchResult({
            id: 'route-z',
            route_id: 'route-z',
            route_short_name: '999',
            score: 10,
          }),
          busRouteSearchResult({
            id: 'route-a',
            route_id: 'route-a',
            route_short_name: '998',
            score: 10,
          }),
        ]),
      } as unknown as TypesenseService,
      {} as SearchService,
      { forRoutes: jest.fn().mockResolvedValue([]) } as never,
    );

    const result = await resolver.search({ query: 'Terminal' });
    expect(result.map((route) => route.id)).toEqual(['route-a', 'route-z']);
  });

  it('does not treat rail line metadata aliases as exact station-name matches', async () => {
    const resolver = new SearchResolver(
      {
        search: jest.fn().mockResolvedValue([
          railStationSearchResult({
            station_code: 'station-azul',
            station_name: 'República',
            station_aliases: ['Azul', 'L1', 'Linha 1 - Azul'],
            score: 100,
          }),
          railLineSearchResult({ score: 1 }),
        ]),
      } as unknown as TypesenseService,
      {} as SearchService,
      { forRoutes: jest.fn().mockResolvedValue([]) } as never,
    );

    const result = await resolver.search({ query: 'Azul' });
    expect(result.map((item) => item.id)).toEqual(['1', 'station-azul']);
  });
});
