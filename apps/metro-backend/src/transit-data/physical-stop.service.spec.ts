import { PhysicalStopService } from './physical-stop.service';

describe('PhysicalStopService', () => {
  const candidate = {
    sptransStopId: '350002754', artespStopId: 'artesp:601',
    sptransName: 'R. Tibúrcio de Souza, 3200', artespName: 'Rua Tibúrcio de Souza, 3200',
    distanceMeters: 0.62,
  };
  const transaction = { $executeRaw: jest.fn().mockResolvedValue(1) };
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction)),
  };
  const service = new PhysicalStopService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('atomically writes membership including the SPTrans canonical member', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([candidate]);
    await service.refresh('both-feeds');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$executeRaw.mock.calls[1][1]).toBe(JSON.stringify([
      { source_stop_id: '350002754', physical_stop_id: '350002754' },
      { source_stop_id: 'artesp:601', physical_stop_id: '350002754' },
    ]));
    const query = prisma.$queryRaw.mock.calls[1][0].join(' ');
    expect(query).toContain('ss.serves_bus');
    expect(query).toContain('ars.serves_bus');
    expect(query).toContain('ST_DWithin');
  });

  it('skips unchanged mappings and does not read candidate geometry', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ sourceSignature: 'v1:both-feeds' }]);
    await service.refresh('both-feeds');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not replace membership if candidate loading fails', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('query failed'));
    await expect(service.refresh('both-feeds')).rejects.toThrow('query failed');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
