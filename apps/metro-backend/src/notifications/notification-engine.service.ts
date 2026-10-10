import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  MAX_NOTIFICATION_TRIGGERS_PER_USER,
  MAX_NOTIFICATION_DEVICES_PER_USER,
  MAX_NOTIFICATION_TARGETS_PER_TRIGGER,
  MIN_NOTIFICATION_INTERVAL_MINUTES,
  MAX_NOTIFICATION_INTERVAL_MINUTES,
  NotificationTriggerInput,
  notificationEligibility,
  validateNotificationTrigger,
  notificationRailState,
} from '@metro/shared/notification-contracts';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationSnapshotService } from './notification-snapshot.service';
import {
  buildAggregatedRailStatusMessage,
  buildNotificationMessage,
  notificationHash,
  railNotificationStateScope,
  readDeliveredRailStates,
  type NotificationSnapshot,
  type NotificationRailStatusEntry,
  type NotificationRailStatusTarget,
} from './notification-message';
import { nextNotificationEvaluation } from './notification-next-evaluation';
import { notificationIssueIdentity } from './notification-issue-identity';
import { notificationRetentionExpiry } from './notification-retention';

// Keep the recurring delivery budget independent of configuration capacity.
export const MAX_NOTIFICATION_DELIVERIES_PER_ACCOUNT_WINDOW = 500;

@Injectable()
export class NotificationEngineService {
  private readonly logger = new Logger(NotificationEngineService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: NotificationSnapshotService,
  ) {}

  /** Indexed due work, bounded pages and durable leases shared by all replicas. */
  async evaluateDue(now = new Date()): Promise<void> {
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
    const due = await this.prisma.notificationTrigger.findMany({
      where: {
        user: { last_login: { gt: cutoff } },
        enabled: true,
        nextEvaluationAt: { lte: now },
        OR: [{ claimUntil: null }, { claimUntil: { lt: now } }],
      },
      orderBy: { nextEvaluationAt: 'asc' },
      take: 500,
      include: {
        user: {
          select: {
            last_login: true,
            notificationTriggers: {
              where: { enabled: true },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              take: MAX_NOTIFICATION_TRIGGERS_PER_USER,
              select: { id: true },
            },
          },
        },
        targets: {
          take: MAX_NOTIFICATION_TARGETS_PER_TRIGGER,
          include: { target: true },
        },
      },
    });
    for (let offset = 0; offset < due.length; offset += 8) {
      await Promise.all(
        due.slice(offset, offset + 8).map(async (trigger) => {
          if (notificationRetentionExpiry(trigger.user.last_login) <= now)
            return;
          const claimToken = randomUUID();
          const claimed = await this.prisma.notificationTrigger.updateMany({
            where: {
              id: trigger.id,
              revision: trigger.revision,
              enabled: true,
              nextEvaluationAt: { lte: now },
              OR: [{ claimUntil: null }, { claimUntil: { lt: now } }],
            },
            data: { claimToken, claimUntil: new Date(Date.now() + 120_000) },
          });
          if (!claimed.count) return;
          let nextEvaluationAt = new Date(
            now.getTime() + MIN_NOTIFICATION_INTERVAL_MINUTES * 60_000,
          );
          try {
            // A stable account selection bounds legacy accounts across pages,
            // scheduler ticks, and replicas; a per-pass counter does not.
            if (
              !trigger.user.notificationTriggers.some(({ id }) => id === trigger.id)
            ) {
              nextEvaluationAt = new Date(now.getTime() + 86_400_000);
              return;
            }
            if (validateNotificationTrigger(trigger.config)) return;
            const config =
              trigger.config as unknown as NotificationTriggerInput;
            const busStopRouteNames =
              config.kind === 'bus_arrivals'
                ? await this.loadBusStopRouteNames(config)
                : new Map<string, string>();
            nextEvaluationAt = nextNotificationEvaluation(config, now);
            if (!notificationEligibility(config, now, true)) return;
            const subscriptions = await this.prisma.pushSubscription.findMany({
              where: { user_id: trigger.userId },
              orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
              take: MAX_NOTIFICATION_DEVICES_PER_USER,
              select: { id: true },
            });
            if (!subscriptions.length) {
              nextEvaluationAt = new Date(now.getTime() + 300_000);
              return;
            }
            const aggregateRailStatuses = config.kind === 'rail_status';
            const railStatusEntries: NotificationRailStatusEntry[] = [];
            for (const { target } of trigger.targets) {
              try {
                const selectedRouteIds = config.busStopRouteIds?.[target.id];
                const selectedRouteNames = selectedRouteIds?.length
                  ? new Set(
                      selectedRouteIds
                        .map((routeId) => busStopRouteNames.get(routeId))
                        .filter((routeName): routeName is string => !!routeName),
                    )
                  : null;
                const observations = await this.snapshots.readMany(
                  config.kind,
                  target,
                  now,
                );
                const snapshots = selectedRouteNames
                  ? observations
                      .map((snapshot) =>
                        this.filterBusArrivalRoutes(snapshot, selectedRouteNames),
                      )
                      .filter((snapshot) => snapshot !== null)
                  : observations;
                if (aggregateRailStatuses) {
                  railStatusEntries.push(
                    ...snapshots.map((snapshot) => ({
                      targetId: target.id,
                      label: target.label,
                      snapshot,
                    })),
                  );
                  continue;
                }
                for (const snapshot of snapshots) {
                  await this.prisma.$transaction(async (tx) => {
                    // Serialize account-wide arrival cooldown checks across replicas.
                    // Settings mutations take this lock before the trigger lock too.
                    await tx.$queryRaw`SELECT "id" FROM "public"."users" WHERE "id" = ${trigger.userId} FOR UPDATE`;
                    // Revalidate the claim/revision after provider I/O and before writing the outbox.
                    const stillCurrent =
                      await tx.notificationTrigger.updateMany({
                        where: {
                          id: trigger.id,
                          revision: trigger.revision,
                          claimToken,
                          enabled: true,
                        },
                        data: { claimUntil: new Date(Date.now() + 120_000) },
                      });
                    if (!stillCurrent.count) return;
                    if (
                      !(await this.hasDeliveryBudget(
                        tx, trigger.userId, subscriptions.length, now,
                      ))
                    ) return;
                    const issueKey = await notificationIssueIdentity(
                      tx,
                      config.kind,
                      target.id,
                      snapshot,
                    );
                    if (issueKey === undefined) return;
                    const message = buildNotificationMessage(
                      config,
                      trigger.id,
                      target.id,
                      {
                        ...snapshot,
                        fingerprint: issueKey ?? snapshot.fingerprint,
                      },
                      now,
                    );
                    if (!message) return;
                    if (
                      config.kind === 'bus_arrivals' ||
                      config.kind === 'rail_arrivals'
                    ) {
                      const recent = await tx.notificationDelivery.findFirst({
                        where: {
                          subscription: { user_id: trigger.userId },
                          trigger: { config: { path: ['kind'], equals: config.kind } },
                          createdAt: {
                            gt: new Date(
                              now.getTime() - config.intervalMinutes * 60_000,
                            ),
                          },
                          payload: {
                            path: ['notification', 'data', 'targetId'],
                            equals: target.id,
                          },
                        },
                        select: { id: true },
                      });
                      if (recent) return;
                    }
                    // Normal episodes distinguish recoveries within a window, but
                    // do not reserve account-wide incident receipts.
                    if (issueKey && !snapshot.normal) {
                      const receipt =
                        await tx.notificationIssueReceipt.createMany({
                          data: [{ userId: trigger.userId, issueKey }],
                          skipDuplicates: true,
                        });
                      if (!receipt.count) return;
                    }
                    await tx.notificationDelivery.createMany({
                      data: subscriptions.map((subscription) => ({
                        triggerId: trigger.id,
                        subscriptionId: subscription.id,
                        revision: trigger.revision,
                        ...message,
                        fingerprint: notificationHash(
                          `${trigger.revision}-${message.fingerprint}`,
                        ),
                      })),
                      skipDuplicates: true,
                    });
                  });
                }
              } catch (error) {
                this.logger.warn(
                  `Notification target evaluation failed: ${error instanceof Error ? error.name : 'unknown'}`,
                );
              }
            }
            if (aggregateRailStatuses && railStatusEntries.length) {
              try {
                await this.persistAggregatedRailStatuses(
                  trigger.id,
                  trigger.userId,
                  trigger.revision,
                  claimToken,
                  config,
                  subscriptions,
                  railStatusEntries,
                  now,
                  trigger.targets.map(({ target }) => ({
                    targetId: target.id,
                    label: target.label,
                  })),
                );
              } catch (error) {
                this.logger.warn(
                  `Notification target evaluation failed: ${error instanceof Error ? error.name : 'unknown'}`,
                );
              }
            }
          } finally {
            await this.prisma.notificationTrigger.updateMany({
              where: { id: trigger.id, claimToken },
              data: { claimToken: null, claimUntil: null, nextEvaluationAt },
            });
          }
        }),
      );
    }
  }

  private async persistAggregatedRailStatuses(
    triggerId: string,
    userId: string,
    revision: number,
    claimToken: string,
    config: NotificationTriggerInput,
    subscriptions: readonly { id: string }[],
    entries: readonly NotificationRailStatusEntry[],
    now: Date,
    selectedTargets: readonly NotificationRailStatusTarget[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "public"."users" WHERE "id" = ${userId} FOR UPDATE`;
      // Revalidate the claim once after all provider reads and keep episode,
      // receipt, and aggregate outbox writes in the same transaction.
      const stillCurrent = await tx.notificationTrigger.updateMany({
        where: { id: triggerId, revision, claimToken, enabled: true },
        data: { claimUntil: new Date(Date.now() + 120_000) },
      });
      if (!stillCurrent.count) return;
      if (!(await this.hasDeliveryBudget(tx, userId, subscriptions.length, now)))
        return;

      let freshIssue = false;
      const currentEntries: Array<{
        entry: NotificationRailStatusEntry;
        index: number;
      }> = [];
      const orderedEntries = entries
        .map((entry, index) => ({ entry, index }))
        .sort((left, right) =>
          left.entry.targetId.localeCompare(right.entry.targetId),
        );
      for (const { entry, index } of orderedEntries) {
        const issueKey = await notificationIssueIdentity(
          tx,
          config.kind,
          entry.targetId,
          entry.snapshot,
        );
        if (issueKey === undefined) continue;
        if (!notificationEligibility(config, now, entry.snapshot.important)) {
          continue;
        }
        if (issueKey && !entry.snapshot.normal) {
          const receipt = await tx.notificationIssueReceipt.createMany({
            data: [{ userId, issueKey }],
            skipDuplicates: true,
          });
          freshIssue ||= receipt.count > 0;
        }
        currentEntries.push({ entry: { ...entry, issueKey }, index });
      }

      const deliverable = currentEntries
        .sort((left, right) => left.index - right.index)
        .map(({ entry }) => entry);
      for (const subscription of subscriptions) {
        // Compare with what this device was actually sent, across schedule
        // windows. Queued/expired messages must never manufacture a recovery.
        const prior = await tx.notificationDelivery.findFirst({
          where: {
            subscriptionId: subscription.id,
            sentAt: { not: null },
            payload: {
              path: ['notification', 'data', 'stateScope'],
              equals: railNotificationStateScope(config.targetIds),
            },
          },
          orderBy: { sentAt: 'desc' },
          select: { payload: true },
        });
        const previousStates = readDeliveredRailStates(prior?.payload);
        const message = buildAggregatedRailStatusMessage(
          config,
          triggerId,
          deliverable,
          now,
          previousStates,
          selectedTargets,
        );
        if (!message) continue;
        const { recoveredTargetIds, reopenedTargetIds } =
          message.payload.notification.data;
        const hasRecovery =
          recoveredTargetIds.length > 0 || reopenedTargetIds.length > 0;
        const hasAlert = deliverable.some((entry) =>
          ['issue', 'closed'].includes(notificationRailState(entry.snapshot)),
        );
        if (hasAlert && !freshIssue && !hasRecovery) continue;

        await tx.notificationDelivery.createMany({
          data: [
            {
              triggerId,
              subscriptionId: subscription.id,
              revision,
              ...message,
              fingerprint: notificationHash(
                `${revision}-${message.fingerprint}`,
              ),
            },
          ],
          skipDuplicates: true,
        });
      }
    });
  }

  private async loadBusStopRouteNames(
    config: NotificationTriggerInput,
  ): Promise<Map<string, string>> {
    const routeIds = [
      ...new Set(Object.values(config.busStopRouteIds ?? {}).flat()),
    ];
    if (!routeIds.length) {
      return new Map();
    }

    try {
      const targets = await this.prisma.notificationTarget.findMany({
        where: { id: { in: routeIds }, kind: 'bus_route' },
        select: { id: true, descriptor: true },
      });
      return new Map(
        targets.flatMap((target) => {
          const descriptor = readRecord(target.descriptor);
          const agency = readNonEmptyText(descriptor?.['agency'])?.toLowerCase();
          const routeName = readNonEmptyText(
            descriptor?.['routeName'],
          )?.toUpperCase();
          return agency === 'sptrans' &&
            routeName &&
            /^[0-9A-Z]{4}-\d{2}$/.test(routeName)
            ? [[target.id, routeName]]
            : [];
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Notification route filters unavailable: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      // An unreadable selection must not widen a filtered stop to every route.
      return new Map();
    }
  }

  private filterBusArrivalRoutes(
    snapshot: NotificationSnapshot,
    routeNames: ReadonlySet<string>,
  ): NotificationSnapshot | null {
    if (!snapshot.arrivals) {
      return null;
    }
    const arrivals = snapshot.arrivals.filter(
      (arrival) =>
        typeof arrival.route === 'string' &&
        routeNames.has(arrival.route.trim().toUpperCase()),
    );
    return arrivals.length ? { ...snapshot, arrivals } : null;
  }

  /** Called only while holding the account row lock, before reserving incident receipts. */
  private async hasDeliveryBudget(
    tx: Prisma.TransactionClient,
    userId: string,
    deliveries: number,
    now: Date,
  ): Promise<boolean> {
    const used = await tx.notificationDelivery.count({
      where: {
        subscription: { user_id: userId },
        retentionKey: null,
        createdAt: {
          gt: new Date(now.getTime() - MIN_NOTIFICATION_INTERVAL_MINUTES * 60_000),
        },
      },
    });
    return used + deliveries <= MAX_NOTIFICATION_DELIVERIES_PER_ACCOUNT_WINDOW;
  }

  async cleanup(now = new Date()): Promise<void> {
    // Cooldowns need up to two hours of history; rail recovery and retention
    // reminders still depend on the existing seven-day delivery history.
    await this.prisma.notificationDelivery.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } },
          {
            expiresAt: { lt: now },
            createdAt: {
              lt: new Date(now.getTime() - MAX_NOTIFICATION_INTERVAL_MINUTES * 60_000),
            },
            trigger: { config: { path: ['kind'], not: 'rail_status' } },
            retentionKey: null,
          },
        ],
      },
    });
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
