import { RailVectorTileService } from './rail-vector-tile.service';

describe('RailVectorTileService refresh coordination', () => {
  it('uses the shared transit catalog lock outside an existing import', async () => {
    const importLock = {
      withLock: jest.fn(
        async (_key: string, _operation: string, action: () => Promise<void>) =>
          action(),
      ),
    };
    const service = new RailVectorTileService(
      {} as never,
      {} as never,
      importLock as never,
    );
    jest
      .spyOn(service, 'refreshMvtViewsWithinImport')
      .mockResolvedValue(undefined);

    await service.refreshMvtViews();

    expect(importLock.withLock).toHaveBeenCalledWith(
      'metro-dev:transit-catalog-import',
      'GeoSampa rail materialized-view refresh',
      expect.any(Function),
    );
  });

  it('refreshes route connections before publishing rail MVT views', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ count: BigInt(4) }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const stationProcessor = {
      refreshMergedStationsWithinImport: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RailVectorTileService(
      prisma as never,
      stationProcessor as never,
      {} as never,
    );

    await service.refreshMvtViewsWithinImport();

    expect(stationProcessor.refreshMergedStationsWithinImport).toHaveBeenCalledTimes(
      1,
    );
    expect(
      stationProcessor.refreshMergedStationsWithinImport.mock
        .invocationCallOrder[0],
    ).toBeLessThan(prisma.$executeRawUnsafe.mock.invocationCallOrder[0]);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });
});
