import { ServiceUnavailableException } from '@nestjs/common';
import { SearchResolver } from './search.resolver';
import type { TypesenseService } from '../services/typesense.service';
import type { SearchService } from '../services/search.service';

describe('SearchResolver', () => {
  it('preserves a typed search-unavailable error', async () => {
    const unavailable = new ServiceUnavailableException(
      'Search service is temporarily unavailable',
    );
    const search = jest.fn().mockRejectedValue(unavailable);
    const resolver = new SearchResolver(
      { search } as unknown as TypesenseService,
      {} as SearchService,
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
    );

    await expect(resolver.search({ query: 'Sé' })).rejects.toThrow(
      'Search failed',
    );
  });

  it('applies the global limit after domain-specific ranking', async () => {
    const search = jest.fn().mockResolvedValue([
      {
        type: 'busRoute',
        document: { id: 'route-1', route_id: 'route-1' },
        score: 1,
        highlights: {},
      },
      {
        type: 'busStop',
        document: { id: 'stop-1', stop_id: 'stop-1' },
        score: 2,
        highlights: {},
      },
      {
        type: 'busRoute',
        document: { id: 'route-2', route_id: 'route-2' },
        score: 3,
        highlights: {},
      },
    ]);
    const resolver = new SearchResolver(
      { search } as unknown as TypesenseService,
      {} as SearchService,
    );

    await expect(
      resolver.search({ query: 'Sé', limit: 2 }),
    ).resolves.toHaveLength(2);
  });
});

describe('SearchResolver bus feed priority', () => {
  it('places SPTrans before Artesp while preserving both qualified identities', async () => {
    const resolver = new SearchResolver({
      search: jest.fn().mockResolvedValue([
        { type: 'busRoute', document: { route_id: 'artesp:001', route_type: 3 }, score: 20 },
        { type: 'busRoute', document: { route_id: '001', route_type: 3 }, score: 10 },
      ]),
    } as unknown as TypesenseService, {} as SearchService);
    const result = await resolver.search({ query: '001' });
    expect(result.map((route) => route.id)).toEqual(['001', 'artesp:001']);
    expect(result[1]).toMatchObject({ sourceAgency: 'artesp', supportsRealtime: false });
  });
});
