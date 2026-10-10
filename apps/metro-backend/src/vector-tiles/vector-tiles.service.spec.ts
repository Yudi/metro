import { VectorTileCacheService } from './services/vector-tile-cache.service';
import { BusVectorTileService } from './services/bus-vector-tile.service';
import { VectorTilesService } from './vector-tiles.service';
import { VectorTileLayer } from './vector-tile.types';

describe('VectorTilesService bus direction cache keys', () => {
  it('caches directions independently and clears them after a dataset refresh', async () => {
    const cache = new VectorTileCacheService();
    const busTiles = new BusVectorTileService(
      {} as never,
      { forFavorites: jest.fn() } as never,
    );
    const generateBusRoutesTile = jest
      .spyOn(busTiles, 'generateBusRoutesTile')
      .mockImplementation(
        async (
          _z: number,
          _x: number,
          _y: number,
          options: { routeIds?: string[] },
        ) => Buffer.from(options.routeIds?.join('|') ?? ''),
      );
    const service = new VectorTilesService(
      cache,
      { onPollComplete: jest.fn(), offPollComplete: jest.fn() } as never,
      {} as never,
      busTiles as never,
      {} as never,
    );
    const outboundCode =
      'bus:v1:sptrans:123A:-23.5000~-46.6000:-23.5100~-46.6100:-23.5200~-46.6200';
    const inboundCode =
      'bus:v1:sptrans:123A:-23.5200~-46.6200:-23.5100~-46.6100:-23.5000~-46.6000';

    await service.getTile(VectorTileLayer.BUS_ROUTES, 12, 1000, 1000, {
      routeIds: [outboundCode],
    });
    await service.getTile(VectorTileLayer.BUS_ROUTES, 12, 1000, 1000, {
      routeIds: [outboundCode],
    });
    await service.getTile(VectorTileLayer.BUS_ROUTES, 12, 1000, 1000, {
      routeIds: [inboundCode],
    });

    expect(generateBusRoutesTile).toHaveBeenCalledTimes(2);
    expect(cache.getStats().size).toBe(2);

    service.clearCache();
    expect(cache.getStats().size).toBe(0);

    await service.getTile(VectorTileLayer.BUS_ROUTES, 12, 1000, 1000, {
      routeIds: [outboundCode],
    });
    expect(generateBusRoutesTile).toHaveBeenCalledTimes(3);
  });
});
