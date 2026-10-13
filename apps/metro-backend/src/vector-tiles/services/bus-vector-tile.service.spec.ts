import { BusVectorTileService } from './bus-vector-tile.service';
import type { BusRouteDirection } from '../../geography/entities/bus-route-direction.entity';

describe('BusVectorTileService', () => {
  const outboundCode =
    'bus:v1:sptrans:123A:-23.5000~-46.6000:-23.5100~-46.6100:-23.5200~-46.6200';
  const inboundCode =
    'bus:v1:sptrans:123A:-23.5200~-46.6200:-23.5100~-46.6100:-23.5000~-46.6000';

  function direction(
    favoriteCode: string,
    directionId: number,
    shapeIds: string[],
    destination: string,
  ): BusRouteDirection {
    return {
      routeId: 'directional-route',
      directionId,
      destination,
      isCircular: false,
      favoriteCode,
      shapeIds,
      sourceId: 'directional-source-id',
    } as BusRouteDirection;
  }

  function createService(directions: BusRouteDirection[] = []) {
    const query = jest.fn().mockResolvedValue([{ mvt: Buffer.from('tile') }]);
    const execute = jest.fn().mockResolvedValue(0);
    const transactionClient = { $queryRaw: query, $executeRaw: execute };
    const transaction = jest.fn(
      (operation: (client: typeof transactionClient) => Promise<unknown>) =>
        operation(transactionClient),
    );
    const forFavorites = jest.fn(async (codes: string[]) =>
      directions.filter((candidate) => codes.includes(candidate.favoriteCode)),
    );
    const service = new BusVectorTileService({
      $transaction: transaction,
    } as never, { forFavorites } as never);
    return { service, query, execute, transaction, forFavorites };
  }

  it('resolves each direction key and serializes only its current shapes', async () => {
    const outbound = direction(
      outboundCode,
      0,
      ['shape-out-a', 'shape-out-b'],
      'Terminal Norte',
    );
    outbound.isCircular = true;
    const inbound = direction(
      inboundCode,
      1,
      ['shape-in'],
      'Terminal Sul',
    );
    const { service, query, forFavorites } = createService([outbound, inbound]);

    await service.generateBusRoutesTile(12, 1000, 1000, {
      routeIds: [outboundCode],
    });

    expect(forFavorites).toHaveBeenCalledWith([outboundCode]);
    const statement = query.mock.calls[0][0] as {
      strings: readonly string[];
      values: unknown[];
    };
    const sql = statement.strings.join('?');
    expect(sql).toContain('jsonb_to_recordset');
    expect(sql).toContain('trip.direction_id = direction.direction_id');
    expect(sql).toContain('shape.shape_id = trip.shape_id');
    expect(sql).toContain('direction.favorite_code AS feature_route_id');
    expect(sql).toContain('direction.destination');
    expect(sql).toContain('direction.is_circular');
    expect(sql).toContain('direction.favorite_code,');
    expect(sql).toContain('direction.direction_id,');

    const serializedDirections = statement.values.find(
      (value): value is string =>
        typeof value === 'string' && value.includes('directional-route'),
    );
    expect(JSON.parse(serializedDirections ?? '[]')).toEqual([
      {
        route_id: 'directional-route',
        direction_id: 0,
        destination: 'Terminal Norte',
        is_circular: true,
        favorite_code: outboundCode,
        shape_ids: ['shape-out-a', 'shape-out-b'],
      },
    ]);
    expect(serializedDirections).not.toContain('shape-in');
  });

  it('returns an empty tile for an unresolved direction key without querying raw routes', async () => {
    const { service, query, forFavorites } = createService();

    await expect(
      service.generateBusRoutesTile(12, 1000, 1000, {
        routeIds: [outboundCode],
      }),
    ).resolves.toBeNull();

    expect(forFavorites).toHaveBeenCalledWith([outboundCode]);
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps both selected directions as separate shape selections', async () => {
    const outbound = direction(
      outboundCode,
      0,
      ['shape-out'],
      'Terminal Norte',
    );
    const inbound = direction(
      inboundCode,
      1,
      ['shape-in'],
      'Terminal Sul',
    );
    const { service, query } = createService([outbound, inbound]);

    await service.generateBusRoutesTile(12, 1000, 1000, {
      routeIds: [outboundCode, inboundCode],
    });

    const statement = query.mock.calls[0][0] as {
      strings: readonly string[];
      values: unknown[];
    };
    const serializedDirections = statement.values.find(
      (value): value is string =>
        typeof value === 'string' &&
        value.includes(outboundCode) &&
        value.includes(inboundCode),
    );
    expect(JSON.parse(serializedDirections ?? '[]')).toEqual([
      {
        route_id: 'directional-route',
        direction_id: 0,
        destination: 'Terminal Norte',
        is_circular: false,
        favorite_code: outboundCode,
        shape_ids: ['shape-out'],
      },
      {
        route_id: 'directional-route',
        direction_id: 1,
        destination: 'Terminal Sul',
        is_circular: false,
        favorite_code: inboundCode,
        shape_ids: ['shape-in'],
      },
    ]);
  });

  it('ignores malformed versioned direction codes instead of treating them as route IDs', async () => {
    const { service, query, forFavorites } = createService();

    await expect(
      service.generateBusRoutesTile(12, 1000, 1000, {
        routeIds: ['bus:v1:invalid'],
      }),
    ).resolves.toBeNull();

    expect(forFavorites).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('propagates tile-generation failures instead of returning an empty tile', async () => {
    const databaseError = new Error('database unavailable');
    const { service, query } = createService();
    query.mockRejectedValue(databaseError);

    await expect(
      service.generateBusRoutesTile(12, 1000, 1000, { routeIds: ['route-1'] }),
    ).rejects.toBe(databaseError);
  });

  it('queries bus-serving canonical stops through spatial tile bounds', async () => {
    const { service, query } = createService();

    await expect(
      service.generateBusStopsTile(16, 24276, 37186),
    ).resolves.toEqual(Buffer.from('tile'));

    const sql = query.mock.calls[0][0].strings.join('?');
    expect(sql).toContain('Gtfs_Stop');
    expect(sql).toContain('physical_stop_members');
    expect(sql).toContain('canonical_stops AS MATERIALIZED');
    expect(sql).toContain('stop.location && bounds.geom::geography');
    expect(sql).toContain('gtfs_stop_service_summary');
    expect(sql).toContain('BOOL_OR(COALESCE(summary.serves_bus, false))');
    expect(sql).toContain('ST_Intersects(cs.geom, b.geom)');
    expect(sql).toContain('cs.physical_stop_id');
    expect(sql).toContain('cs.source_agency');
    expect(sql).toContain('cs.source_id');
    expect(sql).toContain('cs.platform_code');
    expect(sql).toContain('cs.merged_stop_ids');
    expect(sql).not.toContain('Gtfs_StopTime');
    expect(sql).not.toContain('ST_DWithin');
    expect(sql).not.toContain('stopIds');
    expect(sql).not.toContain('routeIds');
  });

  it('returns no bus stop tile below zoom 16 without starting a database transaction', async () => {
    const { service, query, execute, transaction } = createService();

    await expect(service.generateBusStopsTile(15, 12138, 18593)).resolves.toBeNull();

    expect(transaction).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['routes', 'stops'] as const)(
    'bounds %s SQL on the same connection before running it',
    async (layer) => {
      const { service, query, execute, transaction } = createService();
      if (layer === 'routes') {
        await service.generateBusRoutesTile(12, 1000, 1000, {
          routeIds: ['route-1'],
        });
      } else {
        await service.generateBusStopsTile(16, 24276, 37186);
      }

      expect(execute.mock.calls[0][0].join('')).toBe(
        "SET LOCAL statement_timeout = '5s'",
      );
      expect(execute.mock.invocationCallOrder[0]).toBeLessThan(
        query.mock.invocationCallOrder[0],
      );
      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        maxWait: 2_000,
        timeout: 10_000,
      });
    },
  );

  it('does not run unbounded SQL if configuring the deadline fails', async () => {
    const { service, query, execute } = createService();
    const error = new Error('connection lost');
    execute.mockRejectedValue(error);

    await expect(
      service.generateBusStopsTile(16, 24276, 37186),
    ).rejects.toBe(error);
    expect(query).not.toHaveBeenCalled();
  });
});
