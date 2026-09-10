import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import * as webPush from 'web-push';
import {
  NotificationTriggerInput,
  notificationEligibility,
  validateNotificationTrigger,
} from '@metro/shared/notification-contracts';
import {
  notificationRetentionExpiry,
  notificationRetentionStage,
} from './notification-retention';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationRealtimeService } from './notification-realtime.service';

interface NotificationPayloadData {
  important?: unknown;
  stateScope?: unknown;
  stateFingerprint?: unknown;
  windowKey?: unknown;
}

interface NotificationPayload {
  notification?: {
    title?: unknown;
    body?: unknown;
    data?: NotificationPayloadData;
  };
}

interface NotificationStatusDedupeContext {
  stateScope: string;
  stateFingerprint: string;
  windowKey: string;
}

/**
 * Return the durable identity used to suppress a repeated rail-status state.
 *
 * The engine writes these fields into the payload because delivery rows can
 * legitimately differ by trigger revision while still describing the same
 * state. Expiry, tags, and other delivery metadata are deliberately ignored.
 * Requiring all fields keeps periodic arrival/headway notifications outside
 * this history check, so their configured cadence remains meaningful.
 */
function railStatusDedupeContext(
  trigger: NotificationTriggerInput,
  payload: unknown,
  now: Date,
): NotificationStatusDedupeContext | null {
  if (trigger.kind !== 'rail_status' || !payload || typeof payload !== 'object')
    return null;
  const notification = (payload as NotificationPayload).notification;
  if (!notification || typeof notification !== 'object') return null;
  const data = notification.data;
  if (!data || typeof data !== 'object') return null;
  const stateScope =
    typeof data.stateScope === 'string' ? data.stateScope.trim() : '';
  const stateFingerprint =
    typeof data.stateFingerprint === 'string'
      ? data.stateFingerprint.trim()
      : '';
  const windowKey =
    typeof data.windowKey === 'string' ? data.windowKey.trim() : '';
  if (!stateScope || !stateFingerprint || !windowKey) return null;
  // Ensure malformed metadata cannot make a non-current window suppress a
  // valid delivery after a schedule edit or a delayed queue job.
  const currentWindow = notificationEligibility(
    trigger,
    now,
    data.important === true,
  )?.windowKey;
  return currentWindow === windowKey
    ? { stateScope, stateFingerprint, windowKey }
    : null;
}

@Injectable()
export class NotificationPushService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly realtime?: NotificationRealtimeService,
  ) {}

  async deliver(id: string, now = new Date()): Promise<void> {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    if (!publicKey || !privateKey || !subject) return;
    const claimToken = randomUUID();
    const claimed = await this.prisma.notificationDelivery.updateMany({
      where: {
        id,
        sentAt: null,
        dispatchStartedAt: null,
        expiresAt: { gt: now },
        nextAttemptAt: { lte: now },
        attempts: { lt: 5 },
        OR: [{ claimUntil: null }, { claimUntil: { lt: now } }],
      },
      data: {
        claimToken,
        claimUntil: new Date(now.getTime() + 60_000),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) return;
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id },
      include: { trigger: true, subscription: { include: { user: true } } },
    });
    if (!delivery || delivery.claimToken !== claimToken) return;
    const finish = (data: {
      sentAt?: Date;
      expiresAt?: Date;
      nextAttemptAt?: Date;
      dispatchStartedAt?: null;
    }) =>
      this.prisma.notificationDelivery.updateMany({
        where: { id, claimToken },
        data: { ...data, claimToken: null, claimUntil: null },
      });
    const payload = delivery.payload as NotificationPayload;
    const trigger = delivery.trigger;
    const currentTime = new Date();
    const user = delivery.subscription.user;
    const retentionExpiry = user
      ? notificationRetentionExpiry(user.last_login)
      : null;
    const active = retentionExpiry !== null && retentionExpiry > currentTime;
    const retentionStage = retentionExpiry
      ? notificationRetentionStage(retentionExpiry, currentTime)
      : null;
    const validReminder =
      delivery.retentionExpiresAt &&
      retentionExpiry &&
      delivery.retentionExpiresAt.getTime() === retentionExpiry.getTime() &&
      retentionStage !== null &&
      delivery.retentionKey ===
        `${retentionExpiry.toISOString()}:${retentionStage}`;
    const validTrigger =
      trigger &&
      trigger.enabled &&
      trigger.revision === delivery.revision &&
      delivery.subscription.user_id === trigger.userId &&
      !validateNotificationTrigger(trigger.config) &&
      notificationEligibility(
        trigger.config as unknown as NotificationTriggerInput,
        currentTime,
        payload.notification?.data?.important === true,
      );
    if (
      !active ||
      delivery.expiresAt <= currentTime ||
      (delivery.retentionKey ? !validReminder : !validTrigger)
    ) {
      await finish({ expiresAt: currentTime });
      return;
    }
    const statusDedupe = trigger
      ? railStatusDedupeContext(
          trigger.config as unknown as NotificationTriggerInput,
          delivery.payload,
          currentTime,
        )
      : null;
    const dispatch = await this.prisma.$transaction(async (tx) => {
      // Serialize all triggers for this device across workers and replicas.
      await tx.$queryRaw`
        SELECT "id" FROM "public"."push_subscriptions"
        WHERE "id" = ${delivery.subscriptionId}::uuid FOR UPDATE
      `;
      if (statusDedupe) {
        const priorWhere = {
          id: { not: delivery.id },
          subscriptionId: delivery.subscriptionId,
          AND: [
            {
              payload: {
                path: ['notification', 'data', 'stateScope'],
                equals: statusDedupe.stateScope,
              },
            },
            {
              payload: {
                path: ['notification', 'data', 'windowKey'],
                equals: statusDedupe.windowKey,
              },
            },
          ],
        };
        // A state can recover and then fail again in the same schedule window.
        // Compare with the latest dispatched state instead of asking whether
        // this state ever occurred in the past.
        const priorDispatch = await tx.notificationDelivery.findFirst({
          where: {
            ...priorWhere,
            dispatchStartedAt: { not: null },
          },
          orderBy: { dispatchStartedAt: 'desc' },
          select: { payload: true },
        });
        const priorSent = priorDispatch
          ? null
          : await tx.notificationDelivery.findFirst({
              where: { ...priorWhere, sentAt: { not: null } },
              orderBy: { sentAt: 'desc' },
              select: { payload: true },
            });
        const priorPayload = priorDispatch?.payload ?? priorSent?.payload;
        const priorStateFingerprint =
          priorPayload && typeof priorPayload === 'object'
            ? (priorPayload as NotificationPayload).notification?.data
                ?.stateFingerprint
            : undefined;
        if (priorStateFingerprint === statusDedupe.stateFingerprint) {
          // A matching row has already been delivered or started. Expire the
          // new row under the claim so queue reconciliation cannot replay it.
          await tx.notificationDelivery.updateMany({
            where: { id: delivery.id, claimToken },
            data: { expiresAt: currentTime, claimToken: null, claimUntil: null },
          });
          return { count: 0 };
        }
      }
      const recent = await tx.notificationDelivery.findFirst({
        where: {
          subscriptionId: delivery.subscriptionId,
          dispatchStartedAt: { gt: new Date(currentTime.getTime() - 60_000) },
        },
        select: { id: true },
      });
      if (recent) {
        await tx.notificationDelivery.updateMany({
          where: { id, claimToken },
          data: {
            ...(delivery.retentionKey
              ? { nextAttemptAt: new Date(currentTime.getTime() + 60_000) }
              : { expiresAt: currentTime }),
            claimToken: null,
            claimUntil: null,
            attempts: { decrement: 1 },
          },
        });
        return { count: 0 };
      }
      return tx.notificationDelivery.updateMany({
        where: { id, claimToken, dispatchStartedAt: null },
        data: { dispatchStartedAt: currentTime },
      });
    });
    if (!dispatch.count) return;
    try {
      await webPush.sendNotification(
        {
          endpoint: delivery.subscription.endpoint,
          keys: {
            p256dh: delivery.subscription.p256dh,
            auth: delivery.subscription.auth,
          },
        },
        JSON.stringify(delivery.payload),
        {
          vapidDetails: { subject, publicKey, privateKey },
          // Never let a push service store a message for later off-window delivery.
          TTL: 0,
          timeout: 10_000,
          urgency: 'normal',
        },
      );
      await finish({ sentAt: new Date() });
    } catch (error: unknown) {
      const status =
        error && typeof error === 'object' && 'statusCode' in error
          ? Number(error.statusCode)
          : 0;
      if (status === 404 || status === 410) {
        const removed = await this.prisma.pushSubscription.deleteMany({
          where: {
            id: delivery.subscriptionId,
            user_id: delivery.subscription.user_id,
          },
        });
        if (removed.count && delivery.subscription.user_id) {
          try {
            await this.realtime?.publishDeviceRemoved(
              delivery.subscription.user_id,
              delivery.subscriptionId,
            );
          } catch {
            // The expired subscription is already gone; reconnect snapshots
            // reconcile the device list if realtime delivery is unavailable.
          }
        }
        return;
      }
      if (status >= 400 && status < 500 && status !== 429) {
        await finish({ expiresAt: new Date() });
        return;
      }
      if (status === 429) {
        await finish({
          dispatchStartedAt: null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(120_000, 10_000 * 2 ** delivery.attempts),
          ),
        });
      } else {
        // An unknown network outcome may already have delivered. Never replay it.
        await finish({ expiresAt: new Date() });
      }
      // PostgreSQL remains the retry authority; reconciliation picks this row up.
    }
  }
}
