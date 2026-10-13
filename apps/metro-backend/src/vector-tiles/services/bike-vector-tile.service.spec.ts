import { ServiceUnavailableException } from '@nestjs/common';
import { BikeVectorTileService } from './bike-vector-tile.service';

describe('BikeVectorTileService', () => {
  it('does not represent an uninitialized bike cache as a valid empty tile', async () => {
    const service = new BikeVectorTileService(
      {} as never,
      { getCachedSummaryPayload: jest.fn().mockReturnValue(null) } as never,
    );

    await expect(
      service.generateBikeStationsTile(12, 1000, 1000),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([13, 14, 15])('uses clustered tiles below map zoom 16 (tile zoom %s)', async (zoom) => {
    const query = jest.fn().mockResolvedValue([{ mvt: Buffer.from('tile') }]);
    const service = new BikeVectorTileService(
      { $queryRaw: query } as never,
      { getCachedSummaryPayload: () => ({ stations: [{ stationId: 'one' }] }) } as never,
    );
    await service.generateBikeStationsTile(zoom, 1000, 1000);
    const sql = query.mock.calls[0][0].join('');
    expect(sql.includes('station_cells AS')).toBe(zoom < 15);
  });
});
