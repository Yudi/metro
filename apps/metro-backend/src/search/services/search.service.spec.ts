import { SearchService } from './search.service';

describe('SearchService indexing failures', () => {
  function createService(overrides: {
    queryRaw?: jest.Mock;
    railStations?: jest.Mock;
  } = {}): SearchService {
    return new SearchService(
      { $queryRaw: overrides.queryRaw ?? jest.fn() } as never,
      { indexRailLines: jest.fn(), indexRailStations: jest.fn() } as never,
      {
        getAllRailStations:
          overrides.railStations ?? jest.fn().mockResolvedValue([]),
        searchRailStations:
          overrides.railStations ?? jest.fn().mockResolvedValue([]),
        searchNearbyRailStations: jest.fn().mockResolvedValue([]),
      } as never,
      { batchGetStopServiceInfo: jest.fn().mockResolvedValue(new Map()) } as never,
      { getLatestPayload: jest.fn().mockResolvedValue({ stations: [] }) } as never,
    );
  }

  it('propagates rail-line index failures to the import coordinator', async () => {
    const databaseError = new Error('database unavailable');
    const queryRaw = jest.fn().mockRejectedValue(databaseError);

    await expect(createService({ queryRaw }).indexRailLines()).rejects.toBe(
      databaseError,
    );
  });

  it('propagates rail-station source failures to the import coordinator', async () => {
    const sourceError = new Error('rail source unavailable');
    const railStations = jest.fn().mockRejectedValue(sourceError);

    await expect(
      createService({ railStations }).indexRailStations(),
    ).rejects.toBe(sourceError);
  });

  it('does not convert rail search outages into successful empty results', async () => {
    const sourceError = new Error('rail source unavailable');
    const railStations = jest.fn().mockRejectedValue(sourceError);

    await expect(
      createService({ railStations }).searchRailStations('Sé'),
    ).rejects.toBe(sourceError);
  });
});
