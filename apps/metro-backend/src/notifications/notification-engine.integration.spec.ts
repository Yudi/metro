import { Test } from '@nestjs/testing';
import { NotificationEngineService } from './notification-engine.service';
import { NotificationSnapshotService } from './notification-snapshot.service';
import { PrismaService } from '../prisma/prisma.service';

/** Service integration: deterministic transit boundary + transactional outbox adapter. */
describe('notification evaluation to durable outbox integration', () => {
  const now = new Date('2026-09-07T11:00:00Z');
  const config = { name: 'Ida', enabled: true, days: [1], windows: [{ start: '08:00', end: '09:00' }], timezone: 'America/Sao_Paulo', smart: false, leadMinutes: 30, intervalMinutes: 15, kind: 'rail_status', targetIds: ['target'], statusMode: 'abnormal' };
  const findMany = jest.fn();
  const updateMany = jest.fn();
  const createMany = jest.fn();
  const read = jest.fn();
  const prisma = {
    notificationTrigger: { findMany, updateMany },
    pushSubscription: { findMany: jest.fn().mockResolvedValue([{ id: 'device' }]) },
    notificationTarget: { findUniqueOrThrow: jest.fn().mockResolvedValue({ observationClass: 'incident', observationEpisode: 'episode' }), update: jest.fn() },
    notificationIssueReceipt: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $queryRaw: jest.fn(),
    notificationDelivery: { createMany, findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  let engine: NotificationEngineService;
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(now);
    findMany.mockResolvedValue([{ id: 'trigger', userId: 'user', revision: 1, config, targets: [{ target: { id: 'target', available: true } }] }]);
    updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async callback => callback(prisma));
    read.mockResolvedValue([{ title: 'Linha 1', body: 'Velocidade reduzida', fingerprint: 'incident', important: true, normal: false, observedAt: new Date('2026-09-07T10:00:00Z'), url: '/' }]);
    const module = await Test.createTestingModule({ providers: [NotificationEngineService, { provide: PrismaService, useValue: prisma }, { provide: NotificationSnapshotService, useValue: { readMany: read } }] }).compile();
    engine = module.get(NotificationEngineService);
  });
  afterEach(() => jest.useRealTimers());
  it('persists an ongoing off-window incident on window entry with per-device deduplication', async () => {
    await engine.evaluateDue(now);
    expect(updateMany.mock.calls[0][0].where.nextEvaluationAt).toEqual({ lte: now });
    expect(createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ triggerId: 'trigger', subscriptionId: 'device', revision: 1, expiresAt: new Date('2026-09-07T11:05:00Z') })], skipDuplicates: true });
  });
  it('gives an edited revision a distinct periodic delivery key', async () => {
    const row = { id: 'trigger', userId: 'user', revision: 1, config: { ...config, kind: 'rail_headway' }, targets: [{ target: { id: 'target', available: true } }] };
    findMany.mockResolvedValue([row]);
    await engine.evaluateDue(now);
    findMany.mockResolvedValue([{ ...row, revision: 2 }]);
    await engine.evaluateDue(now);
    expect(createMany.mock.calls[0][0].data[0].fingerprint).not.toBe(createMany.mock.calls[1][0].data[0].fingerprint);
  });
  it('delivers each normal recovery once within the same window', async () => {
    findMany.mockResolvedValue([{ id: 'trigger', userId: 'user', revision: 1, config: { ...config, statusMode: 'all' }, targets: [{ target: { id: 'target', available: true } }] }]);
    const fingerprints: string[] = [];
    for (const [index, normal] of [true, false, true, true].entries()) {
      const at = new Date(now.getTime() + index * 60_000);
      read.mockResolvedValue([{ title: 'Linha 1', body: normal ? 'Normal' : 'Incident', fingerprint: normal ? 'normal' : 'incident', important: !normal, normal, observedAt: at, url: '/' }]);
      prisma.notificationTarget.findUniqueOrThrow.mockResolvedValue({
        observationClass: index === 2 ? 'incident' : 'normal',
        observationEpisode: index < 2 ? 'initial-normal' : index === 2 ? 'incident' : 'recovery',
      });
      if (index === 3) {
        const recovery = prisma.notificationTarget.update.mock.calls[2][0].data;
        prisma.notificationTarget.findUniqueOrThrow.mockResolvedValue(recovery);
      }
      await engine.evaluateDue(at);
      fingerprints.push(createMany.mock.calls[index][0].data[0].fingerprint);
    }
    expect(fingerprints[0]).not.toBe(fingerprints[2]);
    expect(fingerprints[2]).toBe(fingerprints[3]);
    expect(prisma.notificationIssueReceipt.createMany).toHaveBeenCalledTimes(1);
  });
  it('enforces the arrival cooldown across adjacent schedule slots', async () => {
    findMany.mockResolvedValue([{ id: 'trigger', userId: 'user', revision: 1, config: { ...config, kind: 'rail_arrivals' }, targets: [{ target: { id: 'target', available: true } }] }]);
    read.mockResolvedValue([{ title: 'Próximos trens', body: '', fingerprint: 'arrival', important: false, normal: true, observedAt: now, url: '/', arrivals: [{ destination: 'Luz', expectedAt: now.getTime() + 120_000 }] }]);
    prisma.notificationDelivery.findFirst.mockResolvedValueOnce({ id: 'recent-update' });
    await engine.evaluateDue(now);
    expect(createMany).not.toHaveBeenCalled();
  });
  it('leaves idle schedules asleep until the next window without transit calls', async () => {
    await engine.evaluateDue(new Date('2026-09-07T10:00:00Z'));
    expect(read).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ nextEvaluationAt: now }) }));
  });
  it('does not write work after a concurrent edit invalidates its lease', async () => {
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });
    await engine.evaluateDue(now);
    expect(createMany).not.toHaveBeenCalled();
  });
  it('skips unavailable transit data instead of inventing normal service', async () => {
    read.mockResolvedValue([]);
    await engine.evaluateDue(now);
    expect(createMany).not.toHaveBeenCalled();
  });
  it('does not repeat a receipted issue through another trigger or window', async () => {
    prisma.notificationIssueReceipt.createMany.mockResolvedValueOnce({ count: 0 });
    await engine.evaluateDue(now);
    expect(createMany).not.toHaveBeenCalled();
  });
  it('releases its claim even if the outbox transaction fails', async () => {
    prisma.$transaction.mockRejectedValue(new Error('database unavailable'));
    await engine.evaluateDue(now);
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ claimToken: null, claimUntil: null }) }));
  });
});
