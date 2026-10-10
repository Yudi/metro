import { BadRequestException } from '@nestjs/common';
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
        favorite_code: outboundCode,
        shape_ids: ['shape-out'],
      },
      {
        route_id: 'directional-route',
        direction_id: 1,
        destination: 'Terminal Sul',
        favorite_code: inboundCode,
        shape_ids: ['shape-in'],
      },
    ]);
  });

  it('filters stop trips by direction and shape IDs', async () => {
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

    await service.generateBusStopsTile(12, 1000, 1000, {
      routeIds: [outboundCode],
    });

    const statement = query.mock.calls[0][0] as {
      strings: readonly string[];
      values: unknown[];
    };
    const sql = statement.strings.join('?');
    expect(sql).toContain('selected_directions AS MATERIALIZED');
    expect(sql).toContain('trip.direction_id = selected_route.direction_id');
    expect(sql).toContain('trip.shape_id = ANY(selected_route.shape_ids)');
    const serializedDirections = statement.values.find(
      (value): value is string =>
        typeof value === 'string' && value.includes('directional-route'),
    );
    expect(JSON.parse(serializedDirections ?? '[]')).toEqual([
      {
        route_id: 'directional-route',
        direction_id: 0,
        shape_ids: ['shape-out'],
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

  it('reads normalized feed views and emits one physical stop marker per tile', async () => {
    const { service, query } = createService();

    await expect(
      service.generateBusStopsTile(12, 1000, 1000, {
        stopIds: ['artesp:2'],
      }),
    ).resolves.toEqual(Buffer.from('tile'));

    const sql = query.mock.calls[0][0].strings.join('?');
    expect(sql).toContain('Gtfs_Stop');
    expect(sql).toContain('Gtfs_StopTime');
    expect(sql).toContain('Gtfs_Route');
    expect(sql).toContain('physical_stop_members');
    expect(sql).toContain('canonical_stops');
    expect(sql).toContain('gtfs_stop_service_summary');
    expect(sql).toContain('BOOL_OR(COALESCE(summary.serves_bus, false))');
    // Only selected trips may read timetables; bus eligibility must use the
    // summary instead of joining every timetable once per physical stop.
    expect(sql.match(/"Gtfs_StopTime"/g)).toHaveLength(1);
    expect(sql).toContain('selected_route_stops AS MATERIALIZED');
    expect(sql).toContain(
      'trip_id = ANY(ARRAY(SELECT trip_id FROM selected_bus_trips))',
    );
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
        await service.generateBusStopsTile(12, 1000, 1000, {
          stopIds: ['stop-1'],
        });
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
      service.generateBusStopsTile(12, 1000, 1000, { stopIds: ['stop-1'] }),
    ).rejects.toBe(error);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects invalid proximity values rather than treating them as absent', () => {
    const service = new BusVectorTileService({} as never, {} as never);

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
