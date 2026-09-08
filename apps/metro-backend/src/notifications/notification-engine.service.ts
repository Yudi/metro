import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NotificationTriggerInput, notificationEligibility, validateNotificationTrigger } from '@metro/shared/notification-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationSnapshotService } from './notification-snapshot.service';
import { buildNotificationMessage, notificationHash } from './notification-message';
import { nextNotificationEvaluation } from './notification-next-evaluation';
import { notificationIssueIdentity } from './notification-issue-identity';
import { notificationRetentionExpiry } from './notification-retention';

@Injectable()
export class NotificationEngineService {
  private readonly logger = new Logger(NotificationEngineService.name);
  constructor(private readonly prisma: PrismaService, private readonly snapshots: NotificationSnapshotService) {}

  /** Indexed due work, bounded pages and durable leases shared by all replicas. */
  async evaluateDue(now = new Date()): Promise<void> {
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
    const due = await this.prisma.notificationTrigger.findMany({
      where: { user: { last_login: { gt: cutoff } }, enabled: true, nextEvaluationAt: { lte: now }, OR: [{ claimUntil: null }, { claimUntil: { lt: now } }] },
      orderBy: { nextEvaluationAt: 'asc' }, take: 500,
      include: { user: { select: { last_login: true } }, targets: { include: { target: true } } },
    });
    for (let offset = 0; offset < due.length; offset += 8) {
      await Promise.all(due.slice(offset, offset + 8).map(async trigger => {
      if (notificationRetentionExpiry(trigger.user.last_login) <= now) return;
      const claimToken = randomUUID();
      const claimed = await this.prisma.notificationTrigger.updateMany({
        where: { id: trigger.id, revision: trigger.revision, enabled: true, nextEvaluationAt: { lte: now }, OR: [{ claimUntil: null }, { claimUntil: { lt: now } }] },
        data: { claimToken, claimUntil: new Date(Date.now() + 120_000) },
      });
      if (!claimed.count) return;
      let nextEvaluationAt = new Date(now.getTime() + 60_000);
      try {
        if (validateNotificationTrigger(trigger.config)) return;
        const config = trigger.config as unknown as NotificationTriggerInput;
        nextEvaluationAt = nextNotificationEvaluation(config, now);
        if (!notificationEligibility(config, now, true)) return;
        const subscriptions = await this.prisma.pushSubscription.findMany({ where: { user_id: trigger.userId }, select: { id: true } });
        if (!subscriptions.length) { nextEvaluationAt = new Date(now.getTime() + 300_000); return; }
        for (const { target } of trigger.targets) {
          try {
            const snapshots = await this.snapshots.readMany(config.kind, target, now);
            for (const snapshot of snapshots) {
            await this.prisma.$transaction(async tx => {
              // Revalidate the claim/revision after provider I/O and before writing the outbox.
              const stillCurrent = await tx.notificationTrigger.updateMany({
                where: { id: trigger.id, revision: trigger.revision, claimToken, enabled: true },
                data: { claimUntil: new Date(Date.now() + 120_000) },
              });
              if (!stillCurrent.count) return;
              const issueKey = await notificationIssueIdentity(tx, config.kind, target.id, snapshot);
              if (issueKey === undefined) return;
              const message = buildNotificationMessage(config, trigger.id, target.id, {
                ...snapshot, fingerprint: issueKey ?? snapshot.fingerprint,
              }, now);
              if (!message) return;
              if (config.kind === 'bus_arrivals' || config.kind === 'rail_arrivals') {
                const recent = await tx.notificationDelivery.findFirst({
                  where: { triggerId: trigger.id, revision: trigger.revision, createdAt: { gt: new Date(now.getTime() - config.intervalMinutes * 60_000) }, payload: { path: ['notification', 'data', 'targetId'], equals: target.id } },
                  select: { id: true },
                });
                if (recent) return;
              }
              // Normal episodes distinguish recoveries within a window, but
              // do not reserve account-wide incident receipts.
              if (issueKey && !snapshot.normal) {
                const receipt = await tx.notificationIssueReceipt.createMany({ data: [{ userId: trigger.userId, issueKey }], skipDuplicates: true });
                if (!receipt.count) return;
              }
              await tx.notificationDelivery.createMany({
                data: subscriptions.map(subscription => ({
                  triggerId: trigger.id, subscriptionId: subscription.id, revision: trigger.revision,
                  ...message,
                  fingerprint: notificationHash(`${trigger.revision}-${message.fingerprint}`),
                })), skipDuplicates: true,
              });
            });
            }
          } catch (error) {
            this.logger.warn(`Notification target evaluation failed: ${error instanceof Error ? error.name : 'unknown'}`);
          }
        }
      } finally {
        await this.prisma.notificationTrigger.updateMany({
          where: { id: trigger.id, claimToken },
          data: { claimToken: null, claimUntil: null, nextEvaluationAt },
        });
      }
      }));
    }
  }

  async cleanup(now = new Date()): Promise<void> {
    await this.prisma.notificationDelivery.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } });
  }
}
