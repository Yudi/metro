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

describe('VectorTilesService rail tile cache and request coalescing', () => {
  it('caches empty rail tiles and coalesces concurrent misses', async () => {
    let resolveGeneration: ((tile: Buffer | null) => void) | undefined;
    const generation = new Promise<Buffer | null>((resolve) => {
      resolveGeneration = resolve;
    });
    const generateRailRoutesTile = jest.fn(() => generation);
    const cache = new VectorTileCacheService();
    const service = new VectorTilesService(
      cache,
      { onPollComplete: jest.fn(), offPollComplete: jest.fn() } as never,
      { generateRailRoutesTile } as never,
      {
        normalizeIds: jest.fn().mockReturnValue([]),
        normalizeNearby: jest.fn().mockReturnValue(undefined),
      } as never,
      {} as never,
    );

    const first = service.getTile(VectorTileLayer.RAIL_ROUTES, 12, 1000, 1000);
    const duplicate = service.getTile(
      VectorTileLayer.RAIL_ROUTES,
      12,
      1000,
      1000,
    );
    expect(generateRailRoutesTile).toHaveBeenCalledTimes(1);

    resolveGeneration?.(null);
    await expect(Promise.all([first, duplicate])).resolves.toEqual([null, null]);
    await expect(
      service.getTile(VectorTileLayer.RAIL_ROUTES, 12, 1000, 1000),
    ).resolves.toBeNull();
    expect(generateRailRoutesTile).toHaveBeenCalledTimes(1);
    expect(cache.getStats().size).toBe(1);
  });

  it('does not cache a tile result after the cache is cleared in flight', async () => {
    const resolutions: Array<(tile: Buffer | null) => void> = [];
    const generateRailRoutesTile = jest.fn(
      () =>
        new Promise<Buffer | null>((resolve) => {
          resolutions.push(resolve);
        }),
    );
    const cache = new VectorTileCacheService();
    const service = new VectorTilesService(
      cache,
      { onPollComplete: jest.fn(), offPollComplete: jest.fn() } as never,
      { generateRailRoutesTile } as never,
      {
        normalizeIds: jest.fn().mockReturnValue([]),
        normalizeNearby: jest.fn().mockReturnValue(undefined),
      } as never,
      {} as never,
    );

    const staleTile = Buffer.from([1]);
    const currentTile = Buffer.from([2]);
    const staleRequest = service.getTile(
      VectorTileLayer.RAIL_ROUTES,
      12,
      1000,
      1000,
    );
    service.clearCache();
    const currentRequest = service.getTile(
      VectorTileLayer.RAIL_ROUTES,
      12,
      1000,
      1000,
    );

    expect(generateRailRoutesTile).toHaveBeenCalledTimes(2);
    resolutions[0](staleTile);
    resolutions[1](currentTile);
    await Promise.all([staleRequest, currentRequest]);

    await expect(
      service.getTile(VectorTileLayer.RAIL_ROUTES, 12, 1000, 1000),
    ).resolves.toBe(currentTile);
    expect(cache.getStats().size).toBe(1);
  });
});
