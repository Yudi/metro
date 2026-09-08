import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEngineService } from './notification-engine.service';
import { NotificationPushService } from './notification-push.service';

const QUEUE = 'metro-notifications';
@Injectable()
export class NotificationQueueService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationQueueService.name);
  private queue?: Queue;
  private worker?: Worker;
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService, private readonly engine: NotificationEngineService, private readonly push: NotificationPushService) {}

  onApplicationBootstrap(): void {
    void this.start().catch(() => this.logger.error('Notification scheduler could not initialize.'));
  }

  private async start(): Promise<void> {
    if (!this.config.get('VAPID_PUBLIC_KEY') || !this.config.get('VAPID_PRIVATE_KEY') || !this.config.get('VAPID_SUBJECT')) {
      this.logger.log('Notifications are disabled until VAPID configuration is supplied.');
      return;
    }
    const url = new URL(this.config.get<string>('REDIS_URL', 'redis://localhost:6379'));
    const connection = {
      host: url.hostname, port: Number(url.port || 6379), username: decodeURIComponent(url.username) || undefined,
      password: decodeURIComponent(url.password) || undefined, db: Number(url.pathname.slice(1) || 0),
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    };
    this.queue = new Queue(QUEUE, { connection, defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 } });
    this.queue.on('error', () => this.logger.error('Notification queue connection failed.'));
    this.worker = new Worker(QUEUE, async job => {
      if (job.name === 'tick') {
        await this.engine.evaluateDue();
        await this.reconcileDeliveries();
      } else if (job.name === 'cleanup') {
        await this.engine.cleanup();
      } else if (job.name === 'deliver' && typeof job.data.id === 'string') {
        await this.push.deliver(job.data.id);
      }
    }, { connection, concurrency: 4 });
    this.worker.on('error', () => this.logger.error('Notification worker connection failed.'));
    this.worker.on('failed', () => this.logger.warn('Notification job failed; durable work remains available for reconciliation.'));
    await this.queue.upsertJobScheduler('notification-tick', { every: 15_000 }, { name: 'tick', data: {} });
    await this.queue.upsertJobScheduler('notification-cleanup', { every: 86_400_000 }, { name: 'cleanup', data: {} });
  }

  async reconcileDeliveries(now = new Date()): Promise<void> {
    if (!this.queue) return;
    const due = await this.prisma.notificationDelivery.findMany({
      where: { sentAt: null, dispatchStartedAt: null, expiresAt: { gt: now }, nextAttemptAt: { lte: now }, attempts: { lt: 5 }, OR: [{ claimUntil: null }, { claimUntil: { lt: now } }] },
      orderBy: { nextAttemptAt: 'asc' }, take: 500, select: { id: true, attempts: true },
    });
    await this.queue.addBulk(due.map(row => ({ name: 'deliver', data: { id: row.id }, opts: { jobId: `delivery-${row.id}-${row.attempts}`, removeOnComplete: true, removeOnFail: 100 } })));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
