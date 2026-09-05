import { BadRequestException } from '@nestjs/common';
import { BusVectorTileService } from './bus-vector-tile.service';

describe('BusVectorTileService', () => {
  it('propagates tile-generation failures instead of returning an empty tile', async () => {
    const databaseError = new Error('database unavailable');
    const service = new BusVectorTileService({
      $queryRaw: jest.fn().mockRejectedValue(databaseError),
    } as never);

    await expect(
      service.generateBusRoutesTile(12, 1000, 1000, { routeIds: ['route-1'] }),
    ).rejects.toBe(databaseError);
  });

  it('rejects invalid proximity values rather than treating them as absent', () => {
    const service = new BusVectorTileService({} as never);

    expect(() =>
      service.normalizeNearby({
        latitude: Number.NaN,
        longitude: -46.6,
        radiusMeters: 100,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.normalizeNearby({
        latitude: -23.5,
        longitude: -46.6,
        radiusMeters: 0,
      }),
    ).toThrow(BadRequestException);
  });
});
