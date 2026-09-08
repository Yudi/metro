import { createHash } from 'node:crypto';
import { NotificationTriggerInput, notificationEligibility } from '@metro/shared/notification-contracts';

export interface NotificationSnapshot {
  title: string;
  body: string;
  /** Semantic content, excluding volatile retrieval timestamps and external IDs. */
  fingerprint: string;
  important: boolean;
  normal: boolean;
  observedAt: Date;
  url: string;
  arrivals?: Array<{ destination: string; route?: string; expectedAt: number; atPlatform?: boolean }>;
}
export function notificationHash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

export function buildNotificationMessage(
  trigger: NotificationTriggerInput, triggerId: string, targetId: string,
  snapshot: NotificationSnapshot, now: Date,
) {
  const eligibility = notificationEligibility(trigger, now, snapshot.important);
  if (!eligibility || (trigger.kind === 'rail_status' && trigger.statusMode === 'abnormal' && snapshot.normal)) return null;
  let body = snapshot.body;
  let arrivalExpiry = Number.POSITIVE_INFINITY;
  if (trigger.kind === 'rail_arrivals' || trigger.kind === 'bus_arrivals') {
    const upcoming = (snapshot.arrivals ?? []).filter(arrival => Number.isFinite(arrival.expectedAt) && arrival.expectedAt > now.getTime() && arrival.expectedAt - now.getTime() <= (trigger.arrivalLeadMinutes ?? 5) * 60_000);
    if (!upcoming.length || eligibility.advance) return null;
    arrivalExpiry = Math.min(...upcoming.map(arrival => arrival.expectedAt));
    const time = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    body = upcoming.slice(0, 5).map(arrival => `${arrival.route ? `${arrival.route} · ` : ''}${arrival.destination}: ${arrival.atPlatform ? 'na plataforma' : `${time.format(new Date(arrival.expectedAt))} (em ${Math.max(1, Math.ceil((arrival.expectedAt - now.getTime()) / 60_000))} min)`}`).join('\n');
  }
  const periodic = trigger.kind === 'rail_headway' || trigger.kind === 'rail_arrivals' || trigger.kind === 'bus_arrivals' || trigger.kind === 'special_departures';
  const issue = trigger.kind === 'bus_notices' || (trigger.kind === 'rail_status' && !snapshot.normal);
  const fingerprint = notificationHash(JSON.stringify([
    targetId, issue ? 'issue' : eligibility.windowKey, periodic ? eligibility.cadenceSlot : snapshot.fingerprint,
  ]));
  const expiresAt = new Date(Math.min(Math.floor(now.getTime() / 60_000) * 60_000 + eligibility.remainingMinutes * 60_000, now.getTime() + (periodic ? 120_000 : 300_000), arrivalExpiry));
  return {
    fingerprint, expiresAt,
    payload: {
      notification: {
        title: snapshot.title.slice(0, 120), body: body.slice(0, 700),
        tag: `metro-${triggerId}-${targetId}`, renotify: false,
        data: {
          expiresAt: expiresAt.getTime(),
          targetId,
          important: snapshot.important,
          onActionClick: {
            default: { operation: 'navigateLastFocusedOrOpen', url: snapshot.url.replace(/^\/+/, '') || '.' },
            settings: { operation: 'navigateLastFocusedOrOpen', url: 'notifications' },
          },
        },
        actions: [{ action: 'settings', title: 'Gerenciar avisos' }],
      },
    },
  };
}
