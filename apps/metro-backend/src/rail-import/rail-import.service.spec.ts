import { RailImportService } from './rail-import.service';
import { WFSConfig } from './config/wfs.config';

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
    clearAllRailData: jest.Mock;
    getAllDatasets: jest.Mock;
  };
  let prisma: {
    $transaction: jest.Mock;
  };
  let tx: {
    $queryRaw: jest.Mock;
  };

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
      clearAllRailData: jest.fn().mockResolvedValue(undefined),
      getAllDatasets: jest.fn().mockResolvedValue([]),
    };
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    };
    prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };

    service = new RailImportService(
      wfsProcessingService as never,
      wfsDatabaseService as never,
      { refreshMvtViews: jest.fn() } as never,
      { clearCache: jest.fn() } as never,
      { indexRailLines: jest.fn(), indexRailStations: jest.fn() } as never,
      prisma as never,
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('holds a Postgres advisory transaction lock around WFS import', async () => {
    await expect(service.startImport()).resolves.toEqual({
      success: true,
      sourcesProcessed: 0,
      recordsImported: 0,
      skippedSources: WFSConfig.getAllSources().map((source) => source.source),
      errors: [],
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: WFSConfig.IMPORT_LOCK_TIMEOUT_MS,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(wfsProcessingService.downloadLayer).toHaveBeenCalledTimes(
      WFSConfig.getAllSources().length,
    );
  });

  it('does not import when another process holds the WFS import lock', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ locked: false }]);

    await expect(service.startImport()).rejects.toThrow(
      'GeoSampa WFS import already in progress in another process',
    );

    expect(wfsProcessingService.ensureTargetTables).not.toHaveBeenCalled();
    expect(wfsProcessingService.downloadLayer).not.toHaveBeenCalled();
  });
});
