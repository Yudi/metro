import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import * as webPush from 'web-push';
import { NotificationTriggerInput, notificationEligibility, validateNotificationTrigger } from '@metro/shared/notification-contracts';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationPushService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async deliver(id: string, now = new Date()): Promise<void> {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    if (!publicKey || !privateKey || !subject) return;
    const claimToken = randomUUID();
    const claimed = await this.prisma.notificationDelivery.updateMany({
      where: { id, sentAt: null, dispatchStartedAt: null, expiresAt: { gt: now }, nextAttemptAt: { lte: now }, attempts: { lt: 5 }, OR: [{ claimUntil: null }, { claimUntil: { lt: now } }] },
      data: { claimToken, claimUntil: new Date(now.getTime() + 60_000), attempts: { increment: 1 } },
    });
    if (!claimed.count) return;
    const delivery = await this.prisma.notificationDelivery.findUnique({ where: { id }, include: { trigger: true, subscription: true } });
    if (!delivery || delivery.claimToken !== claimToken) return;
    const finish = (data: { sentAt?: Date; expiresAt?: Date; nextAttemptAt?: Date; dispatchStartedAt?: null }) => this.prisma.notificationDelivery.updateMany({ where: { id, claimToken }, data: { ...data, claimToken: null, claimUntil: null } });
    const payload = delivery.payload as { notification?: { data?: { important?: boolean } } };
    const trigger = delivery.trigger;
    const currentTime = new Date();
    if (!trigger.enabled || trigger.revision !== delivery.revision || delivery.subscription.user_id !== trigger.userId ||
      validateNotificationTrigger(trigger.config) || delivery.expiresAt <= currentTime ||
      !notificationEligibility(trigger.config as unknown as NotificationTriggerInput, currentTime, payload.notification?.data?.important === true)) {
      await finish({ expiresAt: currentTime });
      return;
    }
    const dispatch = await this.prisma.notificationDelivery.updateMany({ where: { id, claimToken, dispatchStartedAt: null }, data: { dispatchStartedAt: currentTime } });
    if (!dispatch.count) return;
    try {
      await webPush.sendNotification({ endpoint: delivery.subscription.endpoint, keys: { p256dh: delivery.subscription.p256dh, auth: delivery.subscription.auth } }, JSON.stringify(delivery.payload), {
        vapidDetails: { subject, publicKey, privateKey },
        // Never let a push service store a message for later off-window delivery.
        TTL: 0, timeout: 10_000, urgency: 'normal',
      });
      await finish({ sentAt: new Date() });
    } catch (error: unknown) {
      const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 0;
      if (status === 404 || status === 410) {
        await this.prisma.pushSubscription.deleteMany({ where: { id: delivery.subscriptionId, user_id: trigger.userId } });
        return;
      }
      if (status >= 400 && status < 500 && status !== 429) {
        await finish({ expiresAt: new Date() });
        return;
      }
      if (status === 429) {
        await finish({ dispatchStartedAt: null, nextAttemptAt: new Date(Date.now() + Math.min(120_000, 10_000 * 2 ** delivery.attempts)) });
      } else {
        // An unknown network outcome may already have delivered. Never replay it.
        await finish({ expiresAt: new Date() });
      }
      // PostgreSQL remains the retry authority; reconciliation picks this row up.
    }
  }
}
