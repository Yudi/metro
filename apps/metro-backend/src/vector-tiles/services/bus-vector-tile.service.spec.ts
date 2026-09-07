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

  it('reads normalized feed views and emits one physical stop marker per tile', async () => {
    const query = jest.fn().mockResolvedValue([{ mvt: Buffer.from('tile') }]);
    const service = new BusVectorTileService({ $queryRaw: query } as never);

    await expect(
      service.generateBusStopsTile(12, 1000, 1000, {
        stopIds: ['artesp:2'],
      }),
    ).resolves.toEqual(Buffer.from('tile'));

    const sql = (query.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('Gtfs_Stop');
    expect(sql).toContain('Gtfs_StopTime');
    expect(sql).toContain('Gtfs_Route');
    expect(sql).toContain('physical_stop_members');
    expect(sql).toContain('canonical_stops');
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
