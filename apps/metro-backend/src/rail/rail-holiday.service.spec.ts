import { PrismaService } from '../prisma/prisma.service';
import { RailHolidayService } from './rail-holiday.service';

describe('RailHolidayService', () => {
  it('includes configured São Paulo holidays in cached national holidays', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        date: '2026-09-07',
        name: 'Independência do Brasil',
        type: 'national',
      },
    ]);
    const prisma = {
      $queryRaw: queryRaw,
    } as unknown as PrismaService;
    const service = new RailHolidayService(prisma);

    await expect(service.getHolidaysForYear(2026)).resolves.toEqual([
      {
        date: '2026-01-25',
        name: 'Aniversário da Cidade de São Paulo',
        type: 'local',
      },
      {
        date: '2026-07-09',
        name: 'Revolução Constitucionalista de 1932',
        type: 'local',
      },
      {
        date: '2026-09-07',
        name: 'Independência do Brasil',
        type: 'national',
      },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('detects today as a São Paulo holiday using the cached holiday set', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          date: '2026-07-09',
          name: 'Revolução Constitucionalista de 1932',
          type: 'local',
        },
      ]),
    } as unknown as PrismaService;
    const service = new RailHolidayService(prisma);

    await expect(
      service.isHolidayInSaoPaulo(new Date('2026-07-09T15:00:00-03:00')),
    ).resolves.toBe(true);
  });
});
