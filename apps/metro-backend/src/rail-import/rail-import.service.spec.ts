import { RailImportService } from './rail-import.service';
import { WFSConfig, WFSSourceConfig } from './config/wfs.config';
import { WFSDatabaseService } from './services/wfs-database.service';
import { WFSDatasetMetadata, WFSSourceType } from './types/wfs.types';

describe('RailImportService', () => {
  let service: RailImportService;
  let wfsProcessingService: {
    ensureTargetTables: jest.Mock;
    downloadLayer: jest.Mock;
    delayBetweenRequests: jest.Mock;
    replaceSourceTable: jest.Mock;
  };
  let wfsDatabaseService: {
    isCurrentHash: jest.Mock;
    createOrUpdateDataset: jest.Mock;
    invalidateDataset: jest.Mock;
    clearAllRailData: jest.Mock;
    getAllDatasets: jest.Mock;
  };
  let importLockService: {
    withLock: jest.Mock;
  };
  let railVectorTileService: { refreshMvtViewsWithinImport: jest.Mock };
  let vectorTilesService: { clearCache: jest.Mock };
  let searchService: { indexRailLines: jest.Mock; indexRailStations: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();

    wfsProcessingService = {
      ensureTargetTables: jest.fn().mockResolvedValue(undefined),
      downloadLayer: jest.fn().mockResolvedValue({
        fileHash: 'hash',
        fileSize: 123,
        featureCollection: { features: [] },
        sourceSrid: WFSConfig.TARGET_SRID,
      }),
      delayBetweenRequests: jest.fn().mockResolvedValue(undefined),
      replaceSourceTable: jest.fn().mockResolvedValue(0),
    };
    wfsDatabaseService = {
      isCurrentHash: jest.fn().mockResolvedValue(true),
      createOrUpdateDataset: jest.fn().mockResolvedValue(undefined),
      invalidateDataset: jest.fn().mockResolvedValue(undefined),
      clearAllRailData: jest.fn().mockResolvedValue(undefined),
      getAllDatasets: jest.fn().mockResolvedValue([]),
    };
    importLockService = {
      withLock: jest.fn(
        (_: string, __: string, action: () => Promise<unknown>) => action(),
      ),
    };
    railVectorTileService = { refreshMvtViewsWithinImport: jest.fn() };
    vectorTilesService = { clearCache: jest.fn() };
    searchService = {
      indexRailLines: jest.fn(),
      indexRailStations: jest.fn(),
    };

    service = new RailImportService(
      wfsProcessingService as never,
      wfsDatabaseService as never,
      railVectorTileService as never,
      vectorTilesService as never,
      searchService as never,
      importLockService as never,
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function usePersistedMetadata() {
    const datasets = new Map<WFSSourceType, WFSDatasetMetadata>(
      WFSConfig.getAllSources().map(({ source }) => [
        source,
        { source, fileHash: 'hash', fileSize: 123 },
      ]),
    );
    const database = new WFSDatabaseService({
      gPKGDataset: {
        findUnique: jest.fn(async ({ where }: { where: { source: WFSSourceType } }) =>
          datasets.get(where.source) ?? null,
        ),
        deleteMany: jest.fn(async ({ where }: { where: { source: WFSSourceType } }) => {
          datasets.delete(where.source);
          return { count: 1 };
        }),
        upsert: jest.fn(async ({ create }: { create: WFSDatasetMetadata }) => {
          datasets.set(create.source, create);
          return { id: create.source };
        }),
      },
    } as never);
    const restart = () => {
      service = new RailImportService(
        wfsProcessingService as never,
        database,
        railVectorTileService as never,
        vectorTilesService as never,
        searchService as never,
        importLockService as never,
      );
    };
    restart();
    return { datasets, restart };
  }

  it.each(['updated-hash', 'hash'])(
    'retries a partially imported source after restart when its next hash is %s',
    async (retryHash) => {
      const { datasets, restart } = usePersistedMetadata();
      const [changedSource, failingSource] = WFSConfig.getAllSources();
      let sourceUnavailable = true;
      let currentHash = 'updated-hash';
      wfsProcessingService.downloadLayer.mockImplementation(async (source: WFSSourceConfig) => {
        if (source.source === failingSource.source && sourceUnavailable) {
          throw new Error('temporary source failure');
        }
        return {
          fileHash: source.source === changedSource.source ? currentHash : 'hash',
          fileSize: 123,
          featureCollection: { features: [] },
          sourceSrid: WFSConfig.TARGET_SRID,
        };
      });
      wfsProcessingService.replaceSourceTable.mockResolvedValue(1);

      await expect(service.startImport()).resolves.toMatchObject({
        success: false,
        sourcesProcessed: 1,
      });
      expect(datasets.has(changedSource.source)).toBe(false);
      expect(datasets.get(failingSource.source)?.fileHash).toBe('hash');
      expect(railVectorTileService.refreshMvtViewsWithinImport).not.toHaveBeenCalled();

      sourceUnavailable = false;
      currentHash = retryHash;
      restart();
      await expect(service.startImport()).resolves.toMatchObject({
        success: true,
        sourcesProcessed: 1,
      });
      expect(wfsProcessingService.replaceSourceTable).toHaveBeenCalledTimes(2);
      expect(railVectorTileService.refreshMvtViewsWithinImport).toHaveBeenCalledTimes(1);
      expect(searchService.indexRailLines).toHaveBeenCalledTimes(1);
      expect(searchService.indexRailStations).toHaveBeenCalledTimes(1);
      expect(vectorTilesService.clearCache).toHaveBeenCalledTimes(1);
      expect(datasets.get(changedSource.source)?.fileHash).toBe(retryHash);

      await expect(service.startImport()).resolves.toMatchObject({
        success: true,
        sourcesProcessed: 0,
      });
      expect(railVectorTileService.refreshMvtViewsWithinImport).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['views', 'search'])(
    'retries a forced same-hash import after a %s failure and restart',
    async (stage) => {
      const { datasets, restart } = usePersistedMetadata();
      const refresh = stage === 'views'
        ? railVectorTileService.refreshMvtViewsWithinImport
        : searchService.indexRailStations;
      refresh.mockRejectedValueOnce(new Error('refresh failed'));

      await expect(service.clearAndReimport()).rejects.toThrow('refresh failed');
      expect(datasets.size).toBe(0);
      expect(vectorTilesService.clearCache).not.toHaveBeenCalled();

      searchService.indexRailStations.mockImplementation(async () => {
        expect(datasets.size).toBe(0);
      });
      restart();
      await expect(service.startImport()).resolves.toMatchObject({
        success: true,
        sourcesProcessed: WFSConfig.getAllSources().length,
      });
      expect(datasets.size).toBe(WFSConfig.getAllSources().length);
      expect(vectorTilesService.clearCache).toHaveBeenCalledTimes(1);
    },
  );

  it('holds a Postgres advisory transaction lock around WFS import', async () => {
    await expect(service.startImport()).resolves.toEqual({
      success: true,
      sourcesProcessed: 0,
      recordsImported: 0,
      skippedSources: WFSConfig.getAllSources().map((source) => source.source),
      errors: [],
    });

    expect(importLockService.withLock).toHaveBeenCalledWith(
      'metro-dev:transit-catalog-import',
      'GeoSampa WFS import',
      expect.any(Function),
    );
    expect(wfsProcessingService.downloadLayer).toHaveBeenCalledTimes(
      WFSConfig.getAllSources().length,
    );
  });

  it('does not import when another process holds the WFS import lock', async () => {
    importLockService.withLock.mockRejectedValueOnce(
      new Error('GeoSampa WFS import already in progress in another process'),
    );

    await expect(service.startImport()).rejects.toThrow(
      'GeoSampa WFS import already in progress in another process',
    );

    expect(wfsProcessingService.ensureTargetTables).not.toHaveBeenCalled();
    expect(wfsProcessingService.downloadLayer).not.toHaveBeenCalled();
  });

  it('waits for the shared lock during scheduled imports instead of dropping the run', async () => {
    const performImport = jest.fn().mockResolvedValue({
      success: true,
      sourcesProcessed: 0,
      recordsImported: 0,
      skippedSources: [],
      errors: [],
    });
    Object.defineProperty(service, 'performImport', {
      value: performImport,
    });
    let releaseLock!: () => void;
    const lockAvailable = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    importLockService.withLock.mockImplementationOnce(
      async (
        _lockName: string,
        _operation: string,
        action: () => Promise<unknown>,
        options: { waitForLock?: boolean },
      ) => {
        expect(options).toEqual({
          waitForLock: true,
          timeoutMs: expect.any(Number),
        });
        await lockAvailable;
        return action();
      },
    );

    const scheduledImport = service.scheduledImport();
    await Promise.resolve();
    expect(performImport).not.toHaveBeenCalled();

    releaseLock();
    await scheduledImport;

    expect(performImport).toHaveBeenCalledTimes(1);
  });

  it('does not report rail import completion before required post-processing succeeds', async () => {
    Object.defineProperty(service, 'performImport', {
      value: jest.fn().mockResolvedValue({
        success: true,
        sourcesProcessed: 1,
        recordsImported: 1,
        skippedSources: [],
        errors: [],
      }),
    });
    railVectorTileService.refreshMvtViewsWithinImport.mockRejectedValue(
      new Error('MVT refresh failed'),
    );

    await expect(service.startImport()).rejects.toThrow('MVT refresh failed');
    expect(service.getImportStatus().status).toBe('error');
    expect(vectorTilesService.clearCache).not.toHaveBeenCalled();
  });

  it('finishes GeoSampa-derived views before rebuilding rail search indexes', async () => {
    Object.defineProperty(service, 'performImport', {
      value: jest.fn().mockResolvedValue({
        success: true,
        sourcesProcessed: 1,
        recordsImported: 1,
        skippedSources: [],
        errors: [],
      }),
    });

    await service.startImport();

    const viewRefreshOrder =
      railVectorTileService.refreshMvtViewsWithinImport.mock
        .invocationCallOrder[0];
    expect(viewRefreshOrder).toBeLessThan(
      searchService.indexRailLines.mock.invocationCallOrder[0],
    );
    expect(viewRefreshOrder).toBeLessThan(
      searchService.indexRailStations.mock.invocationCallOrder[0],
    );
    expect(vectorTilesService.clearCache).toHaveBeenCalledTimes(1);
  });

  it('returns partial results when one external source fails', async () => {
    Object.defineProperty(service, 'performImport', {
      value: jest.fn().mockResolvedValue({
        success: false,
        sourcesProcessed: 0,
        recordsImported: 0,
        skippedSources: ['metro_line', 'trem_line', 'trem_station'],
        errors: ['metro_station: upstream unavailable'],
      }),
    });

    await expect(service.startImport()).resolves.toMatchObject({
      success: false,
      errors: ['metro_station: upstream unavailable'],
    });
    expect(service.getImportStatus()).toMatchObject({
      status: 'error',
      message: expect.stringContaining('completed with errors'),
    });
  });

  it('acquires the WFS lock before clear-and-reimport destructive work', async () => {
    await service.clearAndReimport();

    expect(importLockService.withLock).toHaveBeenCalledWith(
      'metro-dev:transit-catalog-import',
      'GeoSampa WFS clear and reimport',
      expect.any(Function),
    );
    expect(wfsDatabaseService.clearAllRailData).not.toHaveBeenCalled();
  });
});
