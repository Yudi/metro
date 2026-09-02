import { GTFSDatabaseService } from './gtfs-database.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('GTFSDatabaseService', () => {
  const findMany = jest.fn();
  const upsert = jest.fn();
  const queryRaw = jest.fn();
  const executeRawUnsafe = jest.fn();
  const prisma = {
    gTFSDataset: { findMany, upsert },
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
});
