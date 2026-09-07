import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { BusNoticeHttpClient } from './bus-notice.http';
import { BusNoticeService, noticeWindow } from './bus-notice.service';
import { parseNoticeDetail, parseNoticeIndex } from './bus-notice.parser';

jest.mock('node:timers/promises', () => ({ setTimeout: jest.fn().mockResolvedValue(undefined) }));
const index = readFileSync(join(__dirname, 'fixtures/index.html'), 'utf8');
const detail = readFileSync(join(__dirname, 'fixtures/detail.html'), 'utf8');
const now = new Date('2026-09-07T07:23:00Z');
const notice = parseNoticeDetail(detail, parseNoticeIndex(index)[0]);

function setup() {
  let claimed = false;
  const state = { attemptedWindow: '2026-09-07:0', successfulWindow: '2026-09-06:1',
    lastSuccessAt: new Date('2026-09-06T19:30:00Z'), notices: [notice], detailCache: {} };
  const prisma = {
    $executeRaw: jest.fn(async (sql: TemplateStringsArray) => {
      if (sql.join('').includes('"attemptedWindow" <')) {
        if (claimed) return 0;
        claimed = true;
      }
      return 1;
    }),
    $queryRaw: jest.fn().mockResolvedValue([state]),
  };
  const http = { get: jest.fn(async (url: string) => url.includes('/71116/') ? detail : index) };
  const create = () => new BusNoticeService(prisma as unknown as PrismaService, http as BusNoticeHttpClient);
  return { prisma, http, state, create };
}

describe('twice daily notice collection', () => {
  it.each([
    ['2026-09-07T07:22:00Z', null], ['2026-09-07T07:23:00Z', '2026-09-07:0'],
    ['2026-09-07T14:59:00Z', '2026-09-07:0'], ['2026-09-07T15:00:00Z', null],
    ['2026-09-07T19:22:00Z', null], ['2026-09-07T19:23:00Z', '2026-09-07:1'],
    ['2026-09-08T02:59:00Z', '2026-09-07:1'], ['2026-09-08T03:00:00Z', null],
  ])('uses Sao Paulo windows at %s', (date, expected) => expect(noticeWindow(new Date(date))).toBe(expected));

  it('claims before requests, deduplicates details, and skips warmup across replicas/restarts', async () => {
    const { prisma, http, create } = setup();
    await Promise.all([create().refresh(now), create().refresh(now)]);
    await create().refresh(now);
    expect(http.get).toHaveBeenCalledTimes(10);
    expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(http.get.mock.invocationCallOrder[0]);
    expect(prisma.$executeRaw.mock.calls.filter(([sql]) => sql.join('').includes('"successfulWindow" ='))).toHaveLength(1);
  });
  it('does not scrape if durable storage is unavailable', async () => {
    const { prisma, http, create } = setup();
    prisma.$executeRaw.mockRejectedValue(new Error('offline'));
    await create().refresh(now);
    expect(http.get).not.toHaveBeenCalled();
  });
  it('stops on a block, keeps the previous snapshot and spends the failed window', async () => {
    const { prisma, http, create } = setup();
    http.get.mockRejectedValueOnce(new Error('HTTP 403'));
    await create().refresh(now);
    await create().refresh(now);
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw.mock.calls.some(([sql]) => sql.join('').includes('"successfulWindow" ='))).toBe(false);
    expect(await create().forRoutes(['875A-10'], now)).toMatchObject({ status: 'STALE', notices: [notice] });
  });
  it('uses fresh cached details while re-reading all nine indexes', async () => {
    const { state, http, create } = setup();
    state.detailCache = { '71116': { notice, fetchedAt: now.toISOString() } };
    await create().refresh(now);
    expect(http.get).toHaveBeenCalledTimes(9);
  });
  it('does not expose unrelated route notices or turn a missing table into a successful empty result', async () => {
    const { prisma, create } = setup();
    expect((await create().forRoutes(['1234-10'], now)).notices).toEqual([]);
    prisma.$queryRaw.mockRejectedValue(new Error('table missing'));
    expect(await create().forRoutes(['875A-10'], now)).toEqual({ status: 'UNAVAILABLE', lastUpdated: null, notices: [] });
  });
});
