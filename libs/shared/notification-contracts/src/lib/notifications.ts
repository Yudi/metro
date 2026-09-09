export const NOTIFICATION_KINDS = ['rail_status', 'rail_headway', 'rail_arrivals', 'bus_arrivals', 'bus_notices', 'special_departures'] as const;
export const NOTIFICATION_TIMEZONE = 'America/Sao_Paulo';
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type NotificationTargetKind = 'rail_line' | 'rail_station' | 'bus_route' | 'bus_stop' | 'special_line';

/** Server-owned identity. Never persist a dataset row id in a trigger. */
export interface NotificationTarget {
  id: string;
  kind: NotificationTargetKind;
  label: string;
  available: boolean;
  /** Public presentation aid for rail lines and rail stations; descriptors stay server-owned. */
  railLineCode?: number;
  /** Public bus-route presentation data; feed descriptors stay server-owned. */
  busRouteShortName?: string;
  busRouteColor?: string;
  busRouteTextColor?: string;
}
export interface NotificationWindow { start: string; end: string }
export interface NotificationTriggerInput {
  name: string;
  enabled: boolean;
  days: number[];
  windows: NotificationWindow[];
  timezone: string;
  smart: boolean;
  leadMinutes: number;
  intervalMinutes: number;
  /** Arrival alerts only: maximum minutes until a predicted arrival. Defaults to five. */
  arrivalLeadMinutes?: number;
  kind: NotificationKind;
  targetIds: string[];
  statusMode: 'all' | 'abnormal';
}
export interface NotificationTrigger extends NotificationTriggerInput {
  id: string;
  revision: number;
  targets: NotificationTarget[];
}
export interface NotificationPushInput {
  endpoint: string;
  /** Browser-inferred display label; never used as an authentication value. */
  label?: string;
  keys: { p256dh: string; auth: string };
}
export interface NotificationDevice { id: string; label: string; createdAt: string }
export interface NotificationConfiguration {
  /** Monotonic account version used to order HTTP snapshots and socket deltas. */
  revision: number;
  available: boolean;
  publicKey: string | null;
  triggers: NotificationTrigger[];
  devices: NotificationDevice[];
}

/**
 * A committed change to the authenticated account's notification settings.
 * The entity revision is deliberately kept in addition to the account
 * revision: account events can arrive out of order across replicas, while an
 * editor still needs the trigger's optimistic-concurrency revision.
 */
export type NotificationConfigurationDeltaInput =
  | { type: 'trigger_upsert'; trigger: NotificationTrigger }
  | {
      type: 'trigger_remove';
      triggerId: string;
      triggerRevision: number;
    }
  | { type: 'device_upsert'; device: NotificationDevice }
  | { type: 'device_remove'; deviceId: string };

export type NotificationConfigurationDelta =
  NotificationConfigurationDeltaInput & { revision: number };

export interface NotificationConfigurationSnapshotEvent {
  type: 'snapshot';
  configuration: NotificationConfiguration;
}

export interface NotificationConfigurationDeltaEvent {
  type: 'delta';
  delta: NotificationConfigurationDelta;
}

export type NotificationConfigurationRealtimeEvent =
  | NotificationConfigurationSnapshotEvent
  | NotificationConfigurationDeltaEvent;

export const NOTIFICATION_CONFIGURATION_SNAPSHOT_EVENT =
  'notification_configuration_snapshot' as const;
export const NOTIFICATION_CONFIGURATION_DELTA_EVENT =
  'notification_configuration_delta' as const;
export const NOTIFICATION_CONFIGURATION_RESYNC_EVENT =
  'notification_configuration_resync' as const;
export const TARGET_KIND_FOR_NOTIFICATION: Record<NotificationKind, NotificationTargetKind> = {
  rail_status: 'rail_line', rail_headway: 'rail_station', rail_arrivals: 'rail_station', bus_arrivals: 'bus_stop',
  bus_notices: 'bus_route', special_departures: 'special_line',
};

/** Shared validation is repeated on the server; UI validation is never trusted. */
export function validateNotificationTrigger(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Configuração inválida.';
  const v = value as Partial<NotificationTriggerInput>;
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.trim().length > 80) return 'Dê um nome de até 80 caracteres ao aviso.';
  if (!NOTIFICATION_KINDS.includes(v.kind as NotificationKind)) return 'Selecione o tipo de aviso.';
  if (typeof v.enabled !== 'boolean' || typeof v.smart !== 'boolean') return 'Configuração inválida.';
  if (!Array.isArray(v.days) || !v.days.length || v.days.length > 7 || new Set(v.days).size !== v.days.length || v.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return 'Selecione ao menos um dia da semana.';
  if (!Array.isArray(v.windows) || !v.windows.length || v.windows.length > 8 || v.windows.some(w => !w || !validTime(w.start) || !validTime(w.end) || w.start === w.end)) return 'Informe até oito faixas de horário com início e fim diferentes.';
  if (v.timezone !== NOTIFICATION_TIMEZONE) return 'Os avisos usam exclusivamente o horário de São Paulo.';
  if (!Number.isInteger(v.leadMinutes) || (v.leadMinutes ?? -1) < 0 || (v.leadMinutes ?? 61) > 60) return 'A antecedência deve estar entre 0 e 60 minutos.';
  const arrival = v.kind === 'bus_arrivals' || v.kind === 'rail_arrivals';
  const minimumInterval = arrival ? 1 : 5;
  if (!Number.isInteger(v.intervalMinutes) || (v.intervalMinutes ?? 0) < minimumInterval || (v.intervalMinutes ?? 121) > 120) return `O intervalo deve estar entre ${minimumInterval} e 120 minutos.`;
  if (v.arrivalLeadMinutes !== undefined && (!Number.isInteger(v.arrivalLeadMinutes) || v.arrivalLeadMinutes < 1 || v.arrivalLeadMinutes > 30)) return 'A antecedência da chegada deve estar entre 1 e 30 minutos.';
  if (!Array.isArray(v.targetIds) || !v.targetIds.length || v.targetIds.length > 20 || new Set(v.targetIds).size !== v.targetIds.length || v.targetIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id))) return 'Selecione de 1 a 20 linhas, estações ou pontos.';
  if (v.statusMode !== 'all' && v.statusMode !== 'abnormal') return 'Selecione quando avisar sobre a operação.';
  return null;
}
function validTime(value: unknown): value is string { return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
