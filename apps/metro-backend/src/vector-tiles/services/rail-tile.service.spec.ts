import { RailTileService } from './rail-tile.service';

describe('RailTileService route tiles', () => {
  it('queries the indexed selected-route view with a tile-bounds predicate', async () => {
    const tile = Buffer.from([1]);
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ mvt: tile }]);
    const service = new RailTileService(
      { $queryRaw: queryRaw } as never,
      {} as never,
    );

    await expect(service.generateRailRoutesTile(12, 1000, 1000)).resolves.toBe(
      tile,
    );

    const tileQuery = queryRaw.mock.calls[1][0] as TemplateStringsArray;
    const sql = Array.from(tileQuery).join(' ');
    expect(sql).toContain('"public"."mvt_selected_rail_routes"');
    expect(sql).toContain('r.geom_3857 && ST_MakeEnvelope');
    expect(sql).toContain('ST_Intersects');
    expect(sql).not.toContain('ST_UnaryUnion');
    expect(sql).not.toContain('line_config');
  });

  it('limits concurrent route-tile database queries', async () => {
    const tile = Buffer.from([1]);
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ mvt: tile }]);
    const service = new RailTileService(
      { $queryRaw: queryRaw } as never,
      {} as never,
    );
    await service.generateRailRoutesTile(12, 1000, 1000);

    const pendingQueries: Array<
      (rows: Array<{ mvt: Buffer }>) => void
    > = [];
    queryRaw.mockReset();
    queryRaw.mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingQueries.push(resolve);
        }),
    );

    const requests = [
      service.generateRailRoutesTile(12, 1000, 1000),
      service.generateRailRoutesTile(12, 1001, 1000),
      service.generateRailRoutesTile(12, 1002, 1000),
      service.generateRailRoutesTile(12, 1003, 1000),
      service.generateRailRoutesTile(12, 1004, 1000),
    ];

    await Promise.resolve();
    await Promise.resolve();
    expect(queryRaw).toHaveBeenCalledTimes(4);
    pendingQueries[0]([{ mvt: tile }]);
    await requests[0];
    await Promise.resolve();
    await Promise.resolve();
    expect(queryRaw).toHaveBeenCalledTimes(5);

    for (const resolve of pendingQueries.slice(1)) {
      resolve([{ mvt: tile }]);
    }
    await Promise.all(requests.slice(1));
  });

  it('coalesces missing-view recovery across concurrent requests', async () => {
    const tile = Buffer.from([1]);
    let existenceChecks = 0;
    const queryRaw = jest.fn((strings: TemplateStringsArray) => {
      const sql = Array.from(strings).join(' ');
      if (sql.includes('to_regclass')) {
        existenceChecks++;
        return Promise.resolve([{ exists: existenceChecks > 4 }]);
      }
      return Promise.resolve([{ mvt: tile }]);
    });
    let resolveRefresh: (() => void) | undefined;
    const refresh = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const refreshMvtViews = jest.fn(() => refresh);
    const service = new RailTileService(
      { $queryRaw: queryRaw as never } as never,
      { refreshMvtViews } as never,
    );

    const requests = Array.from({ length: 4 }, (_, index) =>
      service.generateRailRoutesTile(12, 1000 + index, 1000),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(refreshMvtViews).toHaveBeenCalledTimes(1);
    resolveRefresh?.();
    await expect(Promise.all(requests)).resolves.toEqual([
      tile,
      tile,
      tile,
      tile,
    ]);
  });
});
