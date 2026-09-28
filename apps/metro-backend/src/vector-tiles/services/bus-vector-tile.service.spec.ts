import { BadRequestException } from '@nestjs/common';
import { BusVectorTileService } from './bus-vector-tile.service';

describe('BusVectorTileService', () => {
  function createService() {
    const query = jest.fn().mockResolvedValue([{ mvt: Buffer.from('tile') }]);
    const execute = jest.fn().mockResolvedValue(0);
    const transactionClient = { $queryRaw: query, $executeRaw: execute };
    const transaction = jest.fn(
      (operation: (client: typeof transactionClient) => Promise<unknown>) =>
        operation(transactionClient),
    );
    const service = new BusVectorTileService({
      $transaction: transaction,
    } as never);
    return { service, query, execute, transaction };
  }

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
    expect(sql).toContain('trip_id = ANY(ARRAY(SELECT trip_id FROM selected_bus_trips))');
  });

  it.each(['routes', 'stops'] as const)(
    'bounds %s SQL on the same connection before running it',
    async (layer) => {
      const { service, query, execute, transaction } = createService();
      if (layer === 'routes') {
        await service.generateBusRoutesTile(12, 1000, 1000, { routeIds: ['route-1'] });
      } else {
        await service.generateBusStopsTile(12, 1000, 1000, { stopIds: ['stop-1'] });
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
