import { BadRequestException } from '@nestjs/common';
import { RailStationService } from './rail-station.service';

describe('RailStationService', () => {
  it('does not turn a database outage into an empty station list', async () => {
    const databaseError = new Error('database unavailable');
    const service = new RailStationService({
      mergedRailStation: {
        findMany: jest.fn().mockRejectedValue(databaseError),
      },
    } as never);

    await expect(service.getAllRailStations()).rejects.toBe(databaseError);
  });

  it('rejects numeric prefixes and unsafe limits for direct callers', async () => {
    const queryRaw = jest.fn();
    const service = new RailStationService({ $queryRaw: queryRaw } as never);

    await expect(service.getRailStationById('123junk')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.searchRailStations('Sé', 101)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('rejects unsafe nearby coordinates and radii before querying', async () => {
    const queryRaw = jest.fn();
    const service = new RailStationService({ $queryRaw: queryRaw } as never);

    await expect(
      service.searchNearbyRailStations(Number.NaN, -46.6, 100),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.searchNearbyRailStations(-23.5, -46.6, 0),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('looks up source aliases and returns the same public ID as list and tile results', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      { id: 42, name: 'Campo Belo', lines: ['Lilás', 'Ouro'], agencies: ['motiva', 'metro'],
        latitude: -23.6185, longitude: -46.6834, status: null },
    ]);
    const service = new RailStationService({ $queryRaw: queryRaw } as never);

    expect(await service.getRailStationById('1000000001')).toMatchObject({ id: '42' });
    const query = queryRaw.mock.calls[0][0] as TemplateStringsArray;
    expect(query.join('')).toContain('m."primaryId" AS id');
    expect(query.join('')).toContain('ANY(m."mergedIds")');
  });
});
