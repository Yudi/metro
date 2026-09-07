import {
  BusServiceIntervalsService,
  validateRouteCodes,
} from './bus-information.resolver';
import { PrismaService } from '../prisma/prisma.service';

describe('SPTrans service interval contract', () => {
  it('validates route codes and rejects unbounded requests', () => {
    expect(validateRouteCodes(['875A-10', '875A-10'])).toEqual(['875A-10']);
    for (const codes of [
      [],
      ['artesp:42'],
      ['875A-10 OR 1=1'],
      Array(101).fill('875A-10'),
    ]) {
      expect(() => validateRouteCodes(codes)).toThrow();
    }
  });
  it('uses the Sao Paulo service day across a UTC date boundary', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const service = new BusServiceIntervalsService(
      prisma as unknown as PrismaService,
    );
    expect(
      await service.forRoutes(['875A-10'], new Date('2026-09-08T02:00:00Z')),
    ).toEqual({
      status: 'AVAILABLE',
      serviceDate: '2026-09-07',
      intervals: [],
    });
  });
  it('preserves frequency seconds and extended hours rather than generating exact trips', async () => {
    const row = {
      routeCode: '875A-10',
      headsign: 'Aeroporto',
      directionId: 0,
      startTime: '24:00:00',
      endTime: '25:00:00',
      headwaySeconds: 450,
    };
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([row]) };
    const service = new BusServiceIntervalsService(
      prisma as unknown as PrismaService,
    );
    expect((await service.forRoutes(['875A-10'])).intervals).toEqual([row]);
    prisma.$queryRaw.mockResolvedValue([{ ...row, headwaySeconds: 0 }]);
    expect((await service.forRoutes(['875A-10'])).status).toBe('UNAVAILABLE');
    prisma.$queryRaw.mockRejectedValue(new Error('database unavailable'));
    expect((await service.forRoutes(['875A-10'])).status).toBe('UNAVAILABLE');
  });
});
