import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEngineService } from './notification-engine.service';
import { NotificationPushService } from './notification-push.service';
import { NotificationRetentionService } from './notification-retention.service';
import { NotificationQueueService } from './notification-queue.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
    removeJobScheduler: jest.fn().mockResolvedValue(true),
    addBulk: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('notification queue isolation', () => {
  it('keeps scheduler work separate from push jobs and drains the existing delivery queue', async () => {
    const engine = { evaluateDue: jest.fn(), cleanup: jest.fn() };
    const push = { deliver: jest.fn() };
    const retention = { maintain: jest.fn() };
    const prisma = { notificationDelivery: { findMany: jest.fn().mockResolvedValue([{ id: 'outbox', attempts: 0 }]) } };
    const config = new ConfigService({
      VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private', VAPID_SUBJECT: 'mailto:test@example.com',
    });
    const service = new NotificationQueueService(
      config, prisma as unknown as PrismaService,
      engine as unknown as NotificationEngineService,
      push as unknown as NotificationPushService,
      retention as unknown as NotificationRetentionService,
    );
    await (service as unknown as { start(): Promise<void> }).start();
    const queues = jest.mocked(Queue).mock;
    const workers = jest.mocked(Worker).mock;
    expect(queues.calls.map(([name]) => name)).toEqual(['metro-notifications', 'metro-notification-scheduler']);
    expect(workers.calls.map(([name]) => name)).toEqual(['metro-notification-scheduler', 'metro-notifications']);
    expect(workers.calls[0][2]).toEqual(expect.objectContaining({ concurrency: 1 }));
    expect(workers.calls[1][2]).toEqual(expect.objectContaining({ concurrency: 4 }));

    const scheduler = workers.calls[0][1] as (job: { name: string; data: object }) => Promise<void>;
    const delivery = workers.calls[1][1] as (job: { name: string; data: { id: string } }) => Promise<void>;
    await delivery({ name: 'deliver', data: { id: 'outbox' } });
    expect(push.deliver).toHaveBeenCalledWith('outbox');
    expect(engine.evaluateDue).not.toHaveBeenCalled();
    await scheduler({ name: 'tick', data: {} });
    expect(engine.evaluateDue).toHaveBeenCalledTimes(1);
    expect(queues.results[0].value.addBulk).toHaveBeenCalledWith([expect.objectContaining({ data: { id: 'outbox' } })]);
    expect(queues.results[0].value.removeJobScheduler.mock.calls).toEqual([['notification-tick'], ['notification-cleanup']]);
    await scheduler({ name: 'cleanup', data: {} });
    expect(retention.maintain).toHaveBeenCalledTimes(1);
    expect(engine.cleanup).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
    for (const result of [...queues.results, ...workers.results]) {
      expect(result.value.close).toHaveBeenCalledTimes(1);
    }
  });
});
