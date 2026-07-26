import { GTFSDatabaseService } from './gtfs-database.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('GTFSDatabaseService', () => {
  const findFirst = jest.fn();
  const queryRaw = jest.fn();
  const prisma = {
    gTFSDataset: { findFirst },
    $queryRaw: queryRaw,
  } as unknown as PrismaService;

  let service: GTFSDatabaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GTFSDatabaseService(prisma);
  });

  describe('isCurrentHash', () => {
    it('returns false when the dataset hash is unknown', async () => {
      findFirst.mockResolvedValue(null);

      await expect(service.isCurrentHash('new-hash')).resolves.toBe(false);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('returns false when the matching dataset has no shape geometries', async () => {
      findFirst.mockResolvedValue({
        id: 'dataset-id',
        gtfsFiles: [{ recordCount: 100 }],
      });
      queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

      await expect(service.isCurrentHash('current-hash')).resolves.toBe(false);
    });

    it('returns false when shapes.txt was not imported successfully', async () => {
      findFirst.mockResolvedValue({
        id: 'dataset-id',
        gtfsFiles: [{ recordCount: null }],
      });

      await expect(service.isCurrentHash('current-hash')).resolves.toBe(false);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('returns true when the matching dataset has shape geometries', async () => {
      findFirst.mockResolvedValue({
        id: 'dataset-id',
        gtfsFiles: [{ recordCount: 100 }],
      });
      queryRaw.mockResolvedValue([{ count: BigInt(42) }]);

      await expect(service.isCurrentHash('current-hash')).resolves.toBe(true);
    });
  });
});
