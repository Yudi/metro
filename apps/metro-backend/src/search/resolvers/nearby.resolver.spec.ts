import { ServiceUnavailableException } from '@nestjs/common';
import { NearbyResolver } from './nearby.resolver';
import type { TypesenseService } from '../services/typesense.service';

describe('NearbyResolver', () => {
  it('preserves a typed search-unavailable error', async () => {
    const unavailable = new ServiceUnavailableException(
      'Search service is temporarily unavailable',
    );
    const searchNearbyStops = jest.fn().mockRejectedValue(unavailable);
    const resolver = new NearbyResolver({
      searchNearbyStops,
    } as unknown as TypesenseService);

    await expect(
      resolver.nearbyStops({ latitude: -23.55, longitude: -46.63 }),
    ).rejects.toBe(unavailable);
  });

  it('does not expose an upstream Typesense error to GraphQL clients', async () => {
    const searchNearbyStops = jest.fn().mockRejectedValue({
      message: 'request config contains secret-api-key',
      config: { headers: { 'x-typesense-api-key': 'secret-api-key' } },
    });
    const resolver = new NearbyResolver({
      searchNearbyStops,
    } as unknown as TypesenseService);

    await expect(
      resolver.nearbyStops({ latitude: -23.55, longitude: -46.63 }),
    ).rejects.toThrow('Nearby stops search failed');
  });
});
