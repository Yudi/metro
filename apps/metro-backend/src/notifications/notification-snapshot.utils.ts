import type { NotificationSnapshot } from './notification-message';
import type { RailStatusCode } from '@metro/shared/utils';
import { Temporal } from '@js-temporal/polyfill';

const NOTIFICATION_TIME_ZONE = 'America/Sao_Paulo';

export interface SnapshotCacheEntry {
  snapshots: NotificationSnapshot[];
  expiresAt: number;
}

export interface RailStatusResult {
  lines: Array<{
    code: number;
    line: string;
    statusCode: RailStatusCode;
    statusLabel: string;
    description?: string;
    incidentCategory?: string;
    detail?: string;
  }>;
  lastUpdated: Date;
  success: boolean;
  errorMessage?: string;
}

export interface BusStopCandidate {
  id: string;
  stopId: string;
  sourceAgency: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  platformCode?: string;
}

export interface BusStopResolution {
  candidate: BusStopCandidate | null;
  /** True only when the current catalog query completed authoritatively. */
  authoritative: boolean;
}

export interface ArrivalSemantic {
  route: string;
  direction: number;
  destination: string;
  time: string;
}

export function normalizeSemanticText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function boundsAround(
  latitude: number,
  longitude: number,
  radiusMeters: number,
) {
  const latitudeDelta = radiusMeters / 111_320;
  const longitudeDelta =
    radiusMeters /
    (111_320 * Math.max(0.1, Math.cos((latitude * Math.PI) / 180)));
  return {
    minLat: Math.max(-90, latitude - latitudeDelta),
    maxLat: Math.min(90, latitude + latitudeDelta),
    minLng: Math.max(-180, longitude - longitudeDelta),
    maxLng: Math.min(180, longitude + longitudeDelta),
  };
}

export function haversineDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = ((latitudeB - latitudeA) * Math.PI) / 180;
  const longitudeDelta = ((longitudeB - longitudeA) * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos((latitudeA * Math.PI) / 180) *
      Math.cos((latitudeB * Math.PI) / 180) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function compareArrivalSemantic(
  left: ArrivalSemantic,
  right: ArrivalSemantic,
): number {
  return (
    left.time.localeCompare(right.time) ||
    left.route.localeCompare(right.route) ||
    left.direction - right.direction ||
    left.destination.localeCompare(right.destination)
  );
}

/**
 * Convert a public HH:mm prediction into the next Sao Paulo instant.
 *
 * Predictions are clock times without a date. A next-day interpretation is
 * accepted only for a late-evening rollover into 00:00–06:00; all other past
 * times are rejected instead of being turned into invented future arrivals.
 */
export function parseArrivalPrediction(
  value: string,
  now: Date,
): number | null {
  const time = value.trim();
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(time);
  const nowMs = now.getTime();
  if (!match || !Number.isFinite(nowMs)) return null;

  try {
    const current = Temporal.Instant.fromEpochMilliseconds(nowMs).toZonedDateTimeISO(
      NOTIFICATION_TIME_ZONE,
    );
    let candidate = Temporal.ZonedDateTime.from({
      timeZone: NOTIFICATION_TIME_ZONE,
      year: current.year,
      month: current.month,
      day: current.day,
      hour: Number(time.slice(0, 2)),
      minute: Number(time.slice(3, 5)),
    });

    if (candidate.epochMilliseconds <= nowMs) {
      const hour = Number(time.slice(0, 2));
      if (current.hour < 18 || hour > 6) return null;
      candidate = candidate.add({ days: 1 });
    }

    const expectedAt = candidate.epochMilliseconds;
    return expectedAt > nowMs && expectedAt <= nowMs + 24 * 60 * 60_000
      ? expectedAt
      : null;
  } catch {
    return null;
  }
}

export function asSnapshotArray(
  snapshot: NotificationSnapshot | null,
): NotificationSnapshot[] {
  return snapshot ? [snapshot] : [];
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/** Stable JSON for semantic cache and fingerprint keys. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}
