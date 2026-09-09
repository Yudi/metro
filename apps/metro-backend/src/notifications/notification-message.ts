import { createHash } from 'node:crypto';
import {
  NotificationTriggerInput,
  notificationEligibility,
} from '@metro/shared/notification-contracts';

export interface NotificationSnapshot {
  title: string;
  body: string;
  /** Semantic content, excluding volatile retrieval timestamps and external IDs. */
  fingerprint: string;
  important: boolean;
  normal: boolean;
  /** Canonical provider status text used when several rail lines are grouped. */
  statusLabel?: string;
  /** Public rail line code used to keep grouped summaries compact. */
  lineCode?: string;
  observedAt: Date;
  url: string;
  arrivals?: Array<{
    destination: string;
    route?: string;
    expectedAt: number;
    atPlatform?: boolean;
  }>;
}

export interface NotificationRailStatusEntry {
  targetId: string;
  /** Catalog label is a fallback for snapshots from older readers or tests. */
  label?: string;
  snapshot: NotificationSnapshot;
  /** Account-wide episode identity, when the engine has claimed one. */
  issueKey?: string | null;
}

export function notificationHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function buildNotificationMessage(
  trigger: NotificationTriggerInput,
  triggerId: string,
  targetId: string,
  snapshot: NotificationSnapshot,
  now: Date,
) {
  const eligibility = notificationEligibility(trigger, now, snapshot.important);
  if (
    !eligibility ||
    (trigger.kind === 'rail_status' &&
      trigger.statusMode === 'abnormal' &&
      snapshot.normal)
  )
    return null;
  let body = snapshot.body;
  let arrivalExpiry = Number.POSITIVE_INFINITY;
  if (trigger.kind === 'rail_arrivals' || trigger.kind === 'bus_arrivals') {
    const upcoming = (snapshot.arrivals ?? []).filter(
      (arrival) =>
        Number.isFinite(arrival.expectedAt) &&
        arrival.expectedAt > now.getTime() &&
        arrival.expectedAt - now.getTime() <=
          (trigger.arrivalLeadMinutes ?? 5) * 60_000,
    );
    if (!upcoming.length || eligibility.advance) return null;
    arrivalExpiry = Math.min(...upcoming.map((arrival) => arrival.expectedAt));
    const time = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    body = upcoming
      .slice(0, 5)
      .map(
        (arrival) =>
          `${arrival.route ? `${arrival.route} · ` : ''}${arrival.destination}: ${arrival.atPlatform ? 'na plataforma' : `${time.format(new Date(arrival.expectedAt))} (em ${Math.max(1, Math.ceil((arrival.expectedAt - now.getTime()) / 60_000))} min)`}`,
      )
      .join('\n');
  }
  const periodic =
    trigger.kind === 'rail_headway' ||
    trigger.kind === 'rail_arrivals' ||
    trigger.kind === 'bus_arrivals' ||
    trigger.kind === 'special_departures';
  const issue =
    trigger.kind === 'bus_notices' ||
    (trigger.kind === 'rail_status' && !snapshot.normal);
  const fingerprint = notificationHash(
    JSON.stringify([
      targetId,
      issue ? 'issue' : eligibility.windowKey,
      periodic ? eligibility.cadenceSlot : snapshot.fingerprint,
    ]),
  );
  const expiresAt = new Date(
    Math.min(
      Math.floor(now.getTime() / 60_000) * 60_000 +
        eligibility.remainingMinutes * 60_000,
      now.getTime() + (periodic ? 120_000 : 300_000),
      arrivalExpiry,
    ),
  );
  return {
    fingerprint,
    expiresAt,
    payload: {
      notification: {
        title: snapshot.title.slice(0, 120),
        body: body.slice(0, 700),
        tag: `metro-${triggerId}-${targetId}`,
        renotify: false,
        data: {
          expiresAt: expiresAt.getTime(),
          targetId,
          important: snapshot.important,
          onActionClick: {
            default: {
              operation: 'navigateLastFocusedOrOpen',
              url: snapshot.url.replace(/^\/+/, '') || '.',
            },
            settings: {
              operation: 'navigateLastFocusedOrOpen',
              url: 'notifications',
            },
          },
        },
        actions: [{ action: 'settings', title: 'Gerenciar avisos' }],
      },
    },
  };
}

/**
 * Build one rail-status notification for all eligible targets in a trigger.
 *
 * Incident lines are summarized by their canonical provider status. Normal
 * lines are listed together only when no incident line is present; this keeps
 * a mixed operation update focused on the lines that need attention.
 */
export function buildAggregatedRailStatusMessage(
  trigger: NotificationTriggerInput,
  triggerId: string,
  entries: readonly NotificationRailStatusEntry[],
  now: Date,
) {
  if (trigger.kind !== 'rail_status' || !entries.length) return null;

  const eligible = entries
    .map((entry) => ({
      entry,
      eligibility: notificationEligibility(
        trigger,
        now,
        entry.snapshot.important,
      ),
    }))
    .filter(
      (
        item,
      ): item is {
        entry: NotificationRailStatusEntry;
        eligibility: NonNullable<ReturnType<typeof notificationEligibility>>;
      } =>
        item.eligibility !== null &&
        !(trigger.statusMode === 'abnormal' && item.entry.snapshot.normal),
    );
  if (!eligible.length) return null;

  const hasIssue = eligible.some(({ entry }) => !entry.snapshot.normal);
  const important = eligible.some(({ entry }) => entry.snapshot.important);
  const targetIds = eligible.map(({ entry }) => entry.targetId);
  const first = eligible[0];
  const issueGroups = new Map<string, number>();
  for (const { entry } of eligible) {
    if (!entry.snapshot.normal) {
      const status = railStatusLabel(entry);
      issueGroups.set(status, (issueGroups.get(status) ?? 0) + 1);
    }
  }

  const normalGroups = new Map<string, string[]>();
  if (!hasIssue) {
    for (const { entry } of eligible) {
      const status = entry.snapshot.statusLabel?.trim() || '';
      const lineLabels = normalGroups.get(status) ?? [];
      lineLabels.push(railLineLabel(entry));
      normalGroups.set(status, lineLabels);
    }
  }
  const body = hasIssue
    ? [...issueGroups.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
        .map(
          ([status, count]) =>
            `${count} ${count === 1 ? 'linha' : 'linhas'} com '${status}'`,
        )
        .join('\n')
    : [...normalGroups.entries()]
        .map(
          ([status, lineLabels]) =>
            `${lineLabels.join(', ')}${status ? `: ${status}` : ''}`,
        )
        .join('\n');
  const fingerprintEntries = eligible
    .map(({ entry }) => [
      entry.targetId,
      entry.snapshot.normal ? 'normal' : 'issue',
      entry.issueKey ?? entry.snapshot.fingerprint,
    ])
    .sort(([left], [right]) => left.localeCompare(right));
  const fingerprint = notificationHash(
    JSON.stringify([first.eligibility.windowKey, fingerprintEntries]),
  );
  const expiresAt = new Date(
    Math.min(
      ...eligible.map(({ eligibility }) =>
        Math.min(
          Math.floor(now.getTime() / 60_000) * 60_000 +
            eligibility.remainingMinutes * 60_000,
          now.getTime() + 300_000,
        ),
      ),
    ),
  );
  return {
    fingerprint,
    expiresAt,
    payload: {
      notification: {
        title: 'Status das linhas',
        body: body.slice(0, 700),
        tag: `metro-${triggerId}-rail-status`,
        renotify: false,
        data: {
          expiresAt: expiresAt.getTime(),
          // Keep the original scalar for consumers that understand one target
          // and expose the complete aggregate for newer consumers.
          targetId: targetIds[0],
          targetIds,
          important,
          onActionClick: {
            default: {
              operation: 'navigateLastFocusedOrOpen',
              url: first.entry.snapshot.url.replace(/^\/+/, '') || '.',
            },
            settings: {
              operation: 'navigateLastFocusedOrOpen',
              url: 'notifications',
            },
          },
        },
        actions: [{ action: 'settings', title: 'Gerenciar avisos' }],
      },
    },
  };
}

function railStatusLabel(entry: NotificationRailStatusEntry): string {
  const status = entry.snapshot.statusLabel?.trim();
  return status || 'Status desconhecido';
}

function railLineLabel(entry: NotificationRailStatusEntry): string {
  const lineCode = entry.snapshot.lineCode?.trim();
  if (lineCode && /^L\d{1,2}$/u.test(lineCode)) return lineCode;
  return entry.label?.trim() || entry.snapshot.title.trim() || entry.targetId;
}
