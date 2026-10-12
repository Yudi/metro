import { RailVectorTileService } from './rail-vector-tile.service';

jest.mock('../../../generated/prisma/client', () => {
  const client = jest.requireActual('../../test/prisma-client.mock');
  const runtime = jest.requireActual<typeof import('@prisma/client/runtime/client')>(
    '@prisma/client/runtime/client',
  );
  return {
    ...client,
    Prisma: { ...client.Prisma, sql: runtime.sqltag, join: runtime.join },
  };
});

describe('RailVectorTileService refresh coordination', () => {
  it('publishes configured station and shape sources on startup', async () => {
    const service = new RailVectorTileService({} as never, {} as never, {} as never);
    const refresh = jest.spyOn(service, 'refreshMvtViews').mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

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

  it('refreshes route connections before publishing indexed selected routes', async () => {
    const transaction = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ count: BigInt(4) }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(
        async (
          action: (tx: typeof transaction) => Promise<void>,
          options?: { maxWait: number; timeout: number },
        ) => {
          expect(options).toEqual({ maxWait: 30_000, timeout: 120_000 });
          return action(transaction);
        },
      ),
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

    expect(
      stationProcessor.refreshMergedStationsWithinImport,
    ).toHaveBeenCalledTimes(1);
    expect(
      stationProcessor.refreshMergedStationsWithinImport.mock
        .invocationCallOrder[0],
    ).toBeLessThan(prisma.$executeRawUnsafe.mock.invocationCallOrder[0]);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({
      maxWait: 30_000,
      timeout: 120_000,
    });
    expect(transaction.$executeRawUnsafe).toHaveBeenCalledTimes(4);
    expect(transaction.$executeRawUnsafe.mock.calls[0][0]).toContain(
      'DROP MATERIALIZED VIEW IF EXISTS',
    );
    expect(transaction.$executeRawUnsafe.mock.calls[1][0]).toContain(
      'CREATE MATERIALIZED VIEW "public"."mvt_selected_rail_routes" AS',
    );
    expect(transaction.$executeRawUnsafe.mock.calls[1][0]).toContain(
      'ST_UnaryUnion',
    );
    expect(transaction.$executeRawUnsafe.mock.calls[2][0]).toContain(
      'CREATE UNIQUE INDEX "idx_mvt_selected_rail_routes_id"',
    );
    expect(transaction.$executeRawUnsafe.mock.calls[3][0]).toContain(
      'USING GIST (geom_3857)',
    );
  });
});
