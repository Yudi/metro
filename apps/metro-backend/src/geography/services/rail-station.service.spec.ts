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
});
