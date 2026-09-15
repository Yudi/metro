import { cityPath } from '@metro/shared/cities';
import { createHash } from 'node:crypto';
import type { RailStatusCode } from '@metro/shared/utils';
import {
  NotificationTriggerInput,
  notificationEligibility,
  buildRailNotificationSummary,
  compareNotificationRailLines,
  formatNotificationLineName,
  notificationRailState,
  truncateNotificationText,
  type NotificationRailLine,
  type NotificationRailState,
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
  statusCode?: RailStatusCode;
  details?: string;
  networkAllOperational?: boolean;
  stationName?: string;
  /** Public rail line code used to keep grouped summaries compact. */
  lineCode?: string;
  observedAt: Date;
  validUntil?: number;
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

export type NotificationRailStatusTarget = Pick<
  NotificationRailLine,
  'targetId' | 'label' | 'lineCode'
>;

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
  if (trigger.kind === 'rail_status') {
    return buildAggregatedRailStatusMessage(
      trigger,
      triggerId,
      [{ targetId, snapshot }],
      now,
    );
  }
  const eligibility = notificationEligibility(trigger, now, snapshot.important);
  if (!eligibility) return null;
  let body = snapshot.body;
  const lineName = formatNotificationLineName(
    snapshot.lineCode,
    snapshot.title,
    trigger.lineNameFormat,
  );
  const title =
    snapshot.stationName && snapshot.lineCode
      ? `${trigger.kind === 'rail_headway' ? 'Intervalo médio' : 'Próximos trens'} - ${snapshot.stationName} - ${lineName}`
      : snapshot.title;
  let arrivalExpiry = Number.POSITIVE_INFINITY;
  if (trigger.kind === 'rail_arrivals' || trigger.kind === 'bus_arrivals') {
    const upcoming = (snapshot.arrivals ?? [])
      .filter(
        (arrival) =>
          Number.isFinite(arrival.expectedAt) &&
          arrival.expectedAt > now.getTime() &&
          arrival.expectedAt - now.getTime() <=
            (trigger.arrivalLeadMinutes ?? 5) * 60_000,
      )
      .sort(
        (left, right) =>
          Number(right.atPlatform === true) -
            Number(left.atPlatform === true) ||
          left.expectedAt - right.expectedAt,
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
          `${arrival.route && trigger.kind === 'bus_arrivals' ? `${arrival.route} - ` : ''}${arrival.destination}: ${arrival.atPlatform ? 'na plataforma' : `em ${Math.max(1, Math.ceil((arrival.expectedAt - now.getTime()) / 60_000))} min (${time.format(new Date(arrival.expectedAt))})`}`,
      )
      .join('\n');
  }
  const periodic =
    trigger.kind === 'rail_headway' ||
    trigger.kind === 'rail_arrivals' ||
    trigger.kind === 'bus_arrivals' ||
    trigger.kind === 'special_departures';
  const issue = trigger.kind === 'bus_notices';
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
      snapshot.validUntil ?? Number.POSITIVE_INFINITY,
    ),
  );
  return {
    fingerprint,
    expiresAt,
    payload: {
      notification: {
        title: truncateNotificationText(title, 120),
        body: truncateNotificationText(body, 700),
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
              url: cityPath('notifications').slice(1),
            },
          },
        },
        actions: [{ action: 'settings', title: 'Gerenciar avisos' }],
      },
    },
  };
}

/** Read only the versioned public state stored in a successfully sent payload. */
export function readDeliveredRailStates(
  payload: unknown,
): Map<string, NotificationRailState> {
  const states = new Map<string, NotificationRailState>();
  if (!payload || typeof payload !== 'object') return states;
  const notification = (
    payload as { notification?: { data?: { railStates?: unknown } } }
  ).notification;
  const rows = notification?.data?.railStates;
  if (!Array.isArray(rows)) return states;
  for (const row of rows) {
    if (
      row &&
      typeof row === 'object' &&
      typeof row.targetId === 'string' &&
      ['operational', 'issue', 'closed', 'unknown'].includes(row.state)
    ) {
      states.set(row.targetId, row.state);
    }
  }
  return states;
}

export function railNotificationStateScope(
  targetIds: readonly string[],
): string {
  return notificationHash(JSON.stringify([...new Set(targetIds)].sort()));
}

export function railNotificationLine(
  entry: NotificationRailStatusEntry,
): NotificationRailLine {
  return {
    ...entry.snapshot,
    targetId: entry.targetId,
    label: entry.label?.trim() || entry.snapshot.title.trim(),
  };
}

/** One status message per selection, including single-line alerts and recoveries. */
export function buildAggregatedRailStatusMessage(
  trigger: NotificationTriggerInput,
  triggerId: string,
  entries: readonly NotificationRailStatusEntry[],
  now: Date,
  previousStates: ReadonlyMap<string, NotificationRailState> = new Map(),
  selectedTargets: readonly NotificationRailStatusTarget[] = entries.map(
    railNotificationLine,
  ),
) {
  if (trigger.kind !== 'rail_status' || !entries.length) return null;
  const eligible = entries
    .flatMap((entry) => {
      const eligibility = notificationEligibility(
        trigger,
        now,
        entry.snapshot.important,
      );
      return eligibility ? [{ entry, eligibility }] : [];
    })
    .sort((left, right) =>
      compareNotificationRailLines(
        railNotificationLine(left.entry),
        railNotificationLine(right.entry),
      ),
    );
  if (!eligible.length) return null;

  const lines = eligible.map(({ entry }) => railNotificationLine(entry));
  const missingIds = trigger.targetIds.filter(
    (id) => !entries.some((entry) => entry.targetId === id),
  );
  const targetsById = new Map(
    selectedTargets.map((target) => [target.targetId, target]),
  );
  const missingLines: NotificationRailLine[] = [];
  for (const targetId of missingIds) {
    const target = targetsById.get(targetId);
    if (!target?.label?.trim()) return null;
    missingLines.push({
      ...target,
      normal: false,
      statusCode: 'DadosIndisponiveis',
    });
  }
  const recoveredTargetIds = lines
    .filter(
      (line) =>
        notificationRailState(line) === 'operational' &&
        previousStates.get(line.targetId) === 'issue',
    )
    .map((line) => line.targetId);
  const reopenedTargetIds = lines
    .filter(
      (line) =>
        notificationRailState(line) === 'operational' &&
        previousStates.get(line.targetId) === 'closed',
    )
    .map((line) => line.targetId);
  const hasAlert = lines.some((line) =>
    ['issue', 'closed'].includes(notificationRailState(line)),
  );
  const hasRecovery =
    recoveredTargetIds.length > 0 || reopenedTargetIds.length > 0;
  // Incomplete data can report a known recovery, but never an all-clear.
  if (
    !hasAlert &&
    !hasRecovery &&
    (missingLines.length || trigger.statusMode === 'abnormal')
  )
    return null;

  const important = eligible.some(({ entry }) => entry.snapshot.important);
  const targetIds = eligible.map(({ entry }) => entry.targetId);
  const first = eligible[0];
  const summary = buildRailNotificationSummary([...lines, ...missingLines], {
    lineNameFormat: trigger.lineNameFormat,
    networkAllOperational: eligible.every(
      ({ entry }) => entry.snapshot.networkAllOperational === true,
    ),
    recoveredTargetIds,
    reopenedTargetIds,
  });
  const fingerprintEntries = eligible
    .map(({ entry }) => [
      entry.targetId,
      notificationRailState(entry.snapshot),
      entry.issueKey ?? entry.snapshot.fingerprint,
      entry.snapshot.statusCode ?? entry.snapshot.statusLabel ?? '',
    ])
    .sort(([left], [right]) => left.localeCompare(right));
  const fingerprint = notificationHash(
    JSON.stringify([first.eligibility.windowKey, fingerprintEntries]),
  );
  const expiresAt = new Date(
    Math.min(
      ...eligible.map(({ eligibility, entry }) =>
        Math.min(
          Math.floor(now.getTime() / 60_000) * 60_000 +
            eligibility.remainingMinutes * 60_000,
          now.getTime() + 300_000,
          entry.snapshot.validUntil ?? Number.POSITIVE_INFINITY,
        ),
      ),
    ),
  );
  return {
    fingerprint,
    expiresAt,
    payload: {
      notification: {
        ...summary,
        tag: `metro-${triggerId}-rail-status`,
        renotify: false,
        data: {
          expiresAt: expiresAt.getTime(),
          targetId: targetIds[0],
          targetIds,
          important,
          recoveredTargetIds,
          reopenedTargetIds,
          ...railStatusState(
            trigger.targetIds,
            eligible.map(({ entry }) => entry),
            first.eligibility.windowKey,
            previousStates,
          ),
          onActionClick: {
            default: {
              operation: 'navigateLastFocusedOrOpen',
              url: first.entry.snapshot.url.replace(/^\/+/, '') || '.',
            },
            settings: {
              operation: 'navigateLastFocusedOrOpen',
              url: cityPath('notifications').slice(1),
            },
          },
        },
        actions: [{ action: 'settings', title: 'Gerenciar avisos' }],
      },
    },
  };
}

/** Store current state independently of one-time recovery wording and network context. */
function railStatusState(
  targetIds: readonly string[],
  entries: readonly NotificationRailStatusEntry[],
  windowKey: string,
  previousStates: ReadonlyMap<string, NotificationRailState>,
) {
  const normalize = (value: string) => value.trim().replace(/\s+/gu, ' ');
  const state = entries
    .map(
      ({ targetId, snapshot }) =>
        [
          targetId,
          snapshot.normal,
          normalize(snapshot.statusLabel ?? ''),
          normalize(snapshot.body),
        ] as const,
    )
    .sort(([left], [right]) => left.localeCompare(right));
  const remembered = new Map(
    [...previousStates].filter(([targetId]) => targetIds.includes(targetId)),
  );
  for (const { targetId, snapshot } of entries)
    remembered.set(targetId, notificationRailState(snapshot));
  return {
    stateScope: railNotificationStateScope(targetIds),
    stateFingerprint: notificationHash(JSON.stringify(state)),
    railStates: [...remembered].map(([targetId, state]) => ({
      targetId,
      state,
    })),
    windowKey,
  };
}
