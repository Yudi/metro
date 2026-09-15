import type { Prisma } from '../../generated/prisma/client';
import {
  notificationRailState,
  type NotificationKind,
} from '@metro/shared/notification-contracts';
import { randomUUID } from 'node:crypto';
import { NotificationSnapshot, notificationHash } from './notification-message';

/** Shared episode identities distinguish incidents and subsequent normal recoveries. */
export async function notificationIssueIdentity(
  tx: Prisma.TransactionClient,
  kind: NotificationKind,
  targetId: string,
  snapshot: NotificationSnapshot,
): Promise<string | null | undefined> {
  if (kind === 'bus_notices')
    return notificationHash(`bus-notice-${snapshot.fingerprint}`);
  if (kind !== 'rail_status') return null;
  // A new status deserves an update even within an ongoing disruption.
  // Description-only changes keep the episode; closure is separate from both
  // a disruption and normal operation. A -> B -> A starts three episodes.
  const state = notificationRailState(snapshot);
  if (state === 'unknown') return undefined;
  const status = snapshot.statusCode ?? snapshot.statusLabel?.trim();
  const observationClass =
    state === 'operational'
      ? 'normal'
      : state === 'closed'
        ? 'closed'
        : status
          ? `incident:${notificationHash(status).slice(0, 20)}`
          : 'incident';
  await tx.$queryRaw`SELECT id FROM public.notification_targets WHERE id = ${targetId}::uuid FOR UPDATE`;
  const target = await tx.notificationTarget.findUniqueOrThrow({
    where: { id: targetId },
  });
  if (target.observationAt && snapshot.observedAt < target.observationAt)
    return undefined;
  if (
    target.observationAt?.getTime() === snapshot.observedAt.getTime() &&
    target.observationClass !== observationClass
  )
    return undefined;
  let episode = target.observationEpisode;
  if (target.observationClass !== observationClass || !episode) {
    episode = randomUUID();
  }
  await tx.notificationTarget.update({
    where: { id: targetId },
    data: {
      observationClass,
      observationEpisode: episode,
      observationAt: snapshot.observedAt,
    },
  });
  return notificationHash(`rail-${targetId}-${episode}`);
}
