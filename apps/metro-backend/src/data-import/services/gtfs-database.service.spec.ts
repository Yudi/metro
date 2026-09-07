import { GTFSDatabaseService } from './gtfs-database.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('GTFSDatabaseService', () => {
  const findMany = jest.fn();
  const upsert = jest.fn();
  const queryRaw = jest.fn();
  const executeRawUnsafe = jest.fn();
  const prisma = {
    gTFSDataset: { findMany, upsert },
    gTFSFile: { deleteMany: jest.fn(), updateMany: jest.fn() },
    $queryRaw: queryRaw,
    $executeRawUnsafe: executeRawUnsafe,
  } as unknown as PrismaService;

  let service: GTFSDatabaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GTFSDatabaseService(prisma);
  });

  const completeFiles = (shapeCount: number) =>
    [
      'agency.txt',
      'calendar.txt',
      'routes.txt',
      'stops.txt',
      'shapes.txt',
      'trips.txt',
      'stop_times.txt',
    ].map((fileName) => ({
      fileName,
      recordCount: fileName === 'shapes.txt' ? shapeCount : 100,
    }));

  describe('isCurrentHash', () => {
    it('propagates metadata read failures instead of treating them as a first import', async () => {
      findMany.mockRejectedValue(new Error('database unavailable'));

      await expect(service.isCurrentHash('current-hash')).rejects.toThrow(
        'database unavailable',
      );
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('returns false when the dataset hash is unknown', async () => {
      findMany.mockResolvedValue([]);

      await expect(service.isCurrentHash('new-hash')).resolves.toBe(false);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('returns false when the matching dataset has no shape geometries', async () => {
      findMany.mockResolvedValue([
        {
          id: 'dataset-id',
          fileHash: 'current-hash',
          gtfsFiles: completeFiles(100),
        },
      ]);
      queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

      await expect(service.isCurrentHash('current-hash')).resolves.toBe(false);
    });

    it('returns false when shapes.txt was not imported successfully', async () => {
      findMany.mockResolvedValue([
        {
          id: 'dataset-id',
          fileHash: 'current-hash',
          gtfsFiles: completeFiles(0),
        },
      ]);

      await expect(service.isCurrentHash('current-hash')).resolves.toBe(false);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('returns true when the matching dataset has shape geometries', async () => {
      findMany.mockResolvedValue([
        {
          id: 'dataset-id',
          fileHash: 'current-hash',
          gtfsFiles: completeFiles(100),
        },
      ]);
      queryRaw.mockResolvedValue([{ count: BigInt(42) }]);

      await expect(service.isCurrentHash('current-hash')).resolves.toBe(true);
    });

    it('keeps ARTESP hash and shape checks isolated from SPTrans metadata', async () => {
      queryRaw
        .mockResolvedValueOnce([
          {
            source: 'artesp',
            file_hash: 'artesp-hash',
            file_size: 100,
            version: '2026-06-10',
            last_updated: new Date('2026-09-05T00:00:00Z'),
            completed: true,
          },
        ])
        .mockResolvedValueOnce(
          [
            ...completeFiles(100),
            { fileName: 'fare_attributes.txt', recordCount: 100 },
            { fileName: 'fare_rules.txt', recordCount: 100 },
          ].map((file) => ({
            file_name: file.fileName,
            record_count: file.recordCount,
          })),
        )
        .mockResolvedValueOnce([{ count: BigInt(8) }]);

      await expect(
        service.isCurrentHash('artesp-hash', 'artesp'),
      ).resolves.toBe(true);
      expect(findMany).not.toHaveBeenCalled();
      expect(queryRaw.mock.calls[2][0][0]).toContain('ARTESP_Shape');
    });
  });

  it('keeps previous dataset metadata when creating a candidate dataset', async () => {
    upsert.mockResolvedValue({
      id: 'candidate',
      lastUpdated: new Date('2026-08-23T00:00:00Z'),
      fileHash: 'new-hash',
      fileSize: 10,
      version: '2026-08-23',
    });

    await expect(
      service.createOrUpdateDataset({
        fileHash: 'new-hash',
        fileSize: 10,
        version: '2026-08-23',
      }),
    ).resolves.toMatchObject({ id: 'candidate', fileHash: 'new-hash' });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fileHash: 'new-hash' } }),
    );
  });

  it('writes ARTESP candidates to isolated feed metadata', async () => {
    await expect(
      service.createOrUpdateDataset(
        { fileHash: 'artesp-hash', fileSize: 42, version: '2026-06-10' },
        'artesp',
      ),
    ).resolves.toMatchObject({ id: 'artesp', fileHash: 'artesp-hash' });
    expect(executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('gtfs_feed_datasets'),
      'artesp',
      'artesp-hash',
      42,
      '2026-06-10',
    );
  });

  it('analyzes large GTFS tables after replacement', async () => {
    await service.analyzeImportedTables();

    expect(executeRawUnsafe.mock.calls).toEqual([
      ['ANALYZE "external_gtfs"."SPTrans_Route"'],
      ['ANALYZE "external_gtfs"."SPTrans_Stop"'],
      ['ANALYZE "external_gtfs"."SPTrans_Trip"'],
      ['ANALYZE "external_gtfs"."SPTrans_StopTime"'],
      ['ANALYZE "external_gtfs"."SPTrans_Shape"'],
    ]);
  });

  it('accepts a processed empty optional GTFS relation as complete', async () => {
    findMany.mockResolvedValue([
      {
        id: 'dataset-id',
        lastUpdated: new Date('2026-09-04T00:00:00Z'),
        fileHash: 'current-hash',
        fileSize: 10,
        version: '2026-09-04',
        gtfsFiles: [
          ...completeFiles(100),
          { fileName: 'frequencies.txt', recordCount: 0 },
        ],
      },
    ]);

    await expect(service.getCurrentDataset()).resolves.toMatchObject({
      fileHash: 'current-hash',
    });
  });

  it('invalidates candidate file counts before reusing a historical feed hash', async () => {
    await service.prepareDatasetForImport('dataset-id', [
      'agency.txt',
      'routes.txt',
    ]);

    expect(prisma.gTFSFile.deleteMany).toHaveBeenCalledWith({
      where: {
        datasetId: 'dataset-id',
        fileName: { notIn: ['agency.txt', 'routes.txt'] },
      },
    });
    expect(prisma.gTFSFile.updateMany).toHaveBeenCalledWith({
      where: { datasetId: 'dataset-id' },
      data: { recordCount: null },
    });
  });

  it('clears absent ARTESP optional relations without touching SPTrans tables', async () => {
    await service.clearOptionalTables('artesp', [
      'agency.txt',
      'calendar.txt',
      'routes.txt',
      'stops.txt',
      'shapes.txt',
      'trips.txt',
      'stop_times.txt',
      'fare_attributes.txt',
      'fare_rules.txt',
    ]);

    const statements = executeRawUnsafe.mock.calls.map(([statement]) =>
      String(statement),
    );
    expect(statements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ARTESP_CalendarDate'),
        expect.stringContaining('ARTESP_Frequency'),
        expect.stringContaining('ARTESP_FeedInfo'),
      ]),
    );
    expect(statements.some((statement) => statement.includes('SPTrans_'))).toBe(
      false,
    );
  });
});
