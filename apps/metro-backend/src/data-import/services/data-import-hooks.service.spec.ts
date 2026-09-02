import { DataImportHooksService } from './data-import-hooks.service';

describe('DataImportHooksService', () => {
  it('refreshes GTFS-derived data before rebuilding search indexes', async () => {
    const subwayStationProcessor = {
      refreshMergedStations: jest.fn().mockResolvedValue(undefined),
    };
    const precompute = {
      refreshAfterGtfsImport: jest.fn().mockResolvedValue(undefined),
    };
    const vectorTiles = { clearCache: jest.fn() };
    const search = { indexAllData: jest.fn().mockResolvedValue(undefined) };
    const service = new DataImportHooksService(
      search as never,
      subwayStationProcessor as never,
      vectorTiles as never,
      precompute as never,
    );

    await service.onDataImportComplete();

    expect(subwayStationProcessor.refreshMergedStations).toHaveBeenCalledTimes(1);
    expect(precompute.refreshAfterGtfsImport).toHaveBeenCalledTimes(1);
    expect(vectorTiles.clearCache).toHaveBeenCalledTimes(1);
    expect(search.indexAllData).toHaveBeenCalledTimes(1);
    expect(
      precompute.refreshAfterGtfsImport.mock.invocationCallOrder[0],
    ).toBeLessThan(search.indexAllData.mock.invocationCallOrder[0]);
  });

  it('does not expose stale derived data as a successful import', async () => {
    const precompute = {
      refreshAfterGtfsImport: jest
        .fn()
        .mockRejectedValue(new Error('precompute failed')),
    };
    const vectorTiles = { clearCache: jest.fn() };
    const search = { indexAllData: jest.fn() };
    const service = new DataImportHooksService(
      { indexAllData: search.indexAllData } as never,
      { refreshMergedStations: jest.fn() } as never,
      vectorTiles as never,
      precompute as never,
    );

    await expect(service.onDataImportComplete()).rejects.toThrow(
      'precompute failed',
    );
    expect(vectorTiles.clearCache).not.toHaveBeenCalled();
    expect(search.indexAllData).not.toHaveBeenCalled();
  });
});
