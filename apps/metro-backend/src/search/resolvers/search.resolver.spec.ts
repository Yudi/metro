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
});
