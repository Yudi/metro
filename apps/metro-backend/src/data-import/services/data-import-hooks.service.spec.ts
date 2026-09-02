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
    const gtfsDatabase = {
      analyzeImportedTables: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DataImportHooksService(
      search as never,
      subwayStationProcessor as never,
      vectorTiles as never,
      precompute as never,
      gtfsDatabase as never,
    );

    await service.onDataImportComplete();

    expect(subwayStationProcessor.refreshMergedStations).toHaveBeenCalledTimes(1);
    expect(precompute.refreshAfterGtfsImport).toHaveBeenCalledTimes(1);
    expect(vectorTiles.clearCache).toHaveBeenCalledTimes(1);
    expect(search.indexAllData).toHaveBeenCalledTimes(1);
    expect(gtfsDatabase.analyzeImportedTables).toHaveBeenCalledTimes(1);
    expect(
      gtfsDatabase.analyzeImportedTables.mock.invocationCallOrder[0],
    ).toBeLessThan(subwayStationProcessor.refreshMergedStations.mock.invocationCallOrder[0]);
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
    const gtfsDatabase = {
      analyzeImportedTables: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DataImportHooksService(
      { indexAllData: search.indexAllData } as never,
      { refreshMergedStations: jest.fn() } as never,
      vectorTiles as never,
      precompute as never,
      gtfsDatabase as never,
    );

    await expect(service.onDataImportComplete()).rejects.toThrow(
      'precompute failed',
    );
    expect(vectorTiles.clearCache).not.toHaveBeenCalled();
    expect(search.indexAllData).not.toHaveBeenCalled();
  });

  it('skips expensive hooks for an unchanged feed after durable completion', async () => {
    const precompute = {
      isGtfsPostProcessingCurrent: jest.fn().mockResolvedValue(true),
      markGtfsPostProcessingPending: jest.fn(),
      markGtfsPostProcessingComplete: jest.fn(),
      refreshAfterGtfsImport: jest.fn(),
    };
    const subwayStationProcessor = { refreshMergedStations: jest.fn() };
    const vectorTiles = { clearCache: jest.fn() };
    const search = { indexAllData: jest.fn() };
    const gtfsDatabase = { analyzeImportedTables: jest.fn() };
    const service = new DataImportHooksService(
      search as never,
      subwayStationProcessor as never,
      vectorTiles as never,
      precompute as never,
      gtfsDatabase as never,
    );

    await service.onDataImportComplete({
      dataChanged: false,
      sourceSignature: 'unchanged-feed',
    });

    expect(precompute.isGtfsPostProcessingCurrent).toHaveBeenCalledWith(
      'unchanged-feed',
    );
    expect(precompute.markGtfsPostProcessingPending).not.toHaveBeenCalled();
    expect(gtfsDatabase.analyzeImportedTables).not.toHaveBeenCalled();
    expect(subwayStationProcessor.refreshMergedStations).not.toHaveBeenCalled();
    expect(search.indexAllData).not.toHaveBeenCalled();
  });

  it('retries the hook chain after a partial post-processing failure', async () => {
    const precompute = {
      isGtfsPostProcessingCurrent: jest.fn().mockResolvedValue(false),
      markGtfsPostProcessingPending: jest.fn().mockResolvedValue(undefined),
      markGtfsPostProcessingComplete: jest
        .fn()
        .mockResolvedValue(undefined),
      refreshAfterGtfsImport: jest.fn().mockResolvedValue(undefined),
    };
    const subwayStationProcessor = {
      refreshMergedStations: jest.fn().mockResolvedValue(undefined),
    };
    const vectorTiles = { clearCache: jest.fn() };
    const search = {
      indexAllData: jest
        .fn()
        .mockRejectedValueOnce(new Error('search index failed'))
        .mockResolvedValue(undefined),
    };
    const gtfsDatabase = {
      analyzeImportedTables: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DataImportHooksService(
      search as never,
      subwayStationProcessor as never,
      vectorTiles as never,
      precompute as never,
      gtfsDatabase as never,
    );

    await expect(
      service.onDataImportComplete({
        dataChanged: true,
        sourceSignature: 'feed-with-failed-search',
      }),
    ).rejects.toThrow('search index failed');

    await expect(
      service.onDataImportComplete({
        dataChanged: false,
        sourceSignature: 'feed-with-failed-search',
      }),
    ).resolves.toBeUndefined();

    expect(precompute.markGtfsPostProcessingPending).toHaveBeenCalledTimes(2);
    expect(precompute.markGtfsPostProcessingComplete).toHaveBeenCalledTimes(1);
    expect(gtfsDatabase.analyzeImportedTables).toHaveBeenCalledTimes(2);
    expect(search.indexAllData).toHaveBeenCalledTimes(2);
  });
});
