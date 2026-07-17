/**
 * Headway (interval between trains) types shared between frontend and backend.
 *
 * Lines supported: L4, L8, L9, L10, L11, L12, L13
 * Lines L11, L12, L13 may stop providing data in the future and can be disabled
 * through the Trivia Trens live-data switch or HEADWAY_ENABLED_LINES config.
 */

import { ExtendedNextTrainLineCode } from './viamobilidade-stations';
import { TRIVIATRENS_LIVE_DATA_ENABLED } from './transit-agency.utils';

const TRIVIATRENS_NEXT_TRAIN_LINES: ExtendedNextTrainLineCode[] = [
  'L11',
  'L12',
  'L13',
];

/**
 * Default lines that have headway tracking enabled.
 * L11, L12, L13 may be disabled in the future.
 */
export const HEADWAY_DEFAULT_ENABLED_LINES: ExtendedNextTrainLineCode[] = [
  'L4',
  'L8',
  'L9',
  'L10',
  ...(TRIVIATRENS_LIVE_DATA_ENABLED ? TRIVIATRENS_NEXT_TRAIN_LINES : []),
];

/** Minimum number of passage samples required to display headway */
export const HEADWAY_MIN_SAMPLES = 3;

/** Maximum number of passage samples to store/fetch (increased for bucket-aware calculation) */
export const HEADWAY_MAX_SAMPLES = 100;

// ---------------------------------------------------------------------------
// Time-of-day buckets
// ---------------------------------------------------------------------------

/**
 * Bucket identifiers for time-of-day headway aggregation.
 * Headway varies significantly by period, so samples are grouped by bucket
 * for more responsive and accurate estimates.
 */
export type HeadwayBucketId =
  | 'off_hours'
  | 'operation_start'
  | 'am_peak'
  | 'morning'
  | 'midday_peak'
  | 'afternoon'
  | 'pm_peak'
  | 'evening'
  | 'night';

export interface HeadwayBucketDefinition {
  id: HeadwayBucketId;
  /** Start time in minutes from midnight (São Paulo time, inclusive) */
  startMinutes: number;
  /** End time in minutes from midnight (São Paulo time, exclusive) */
  endMinutes: number;
  /** Display label (Portuguese) */
  label: string;
}

/**
 * Time-of-day buckets ordered chronologically.
 * All times are in São Paulo timezone (America/Sao_Paulo).
 */
export const HEADWAY_BUCKETS: HeadwayBucketDefinition[] = [
  { id: 'off_hours', startMinutes: 0, endMinutes: 240, label: 'Madrugada' },
  {
    id: 'operation_start',
    startMinutes: 240,
    endMinutes: 335,
    label: 'Início operação',
  },
  { id: 'am_peak', startMinutes: 335, endMinutes: 540, label: 'Pico manhã' },
  { id: 'morning', startMinutes: 540, endMinutes: 660, label: 'Manhã' },
  {
    id: 'midday_peak',
    startMinutes: 660,
    endMinutes: 780,
    label: 'Pico meio-dia',
  },
  { id: 'afternoon', startMinutes: 780, endMinutes: 960, label: 'Tarde' },
  { id: 'pm_peak', startMinutes: 960, endMinutes: 1140, label: 'Pico tarde' },
  { id: 'evening', startMinutes: 1140, endMinutes: 1320, label: 'Noite' },
  { id: 'night', startMinutes: 1320, endMinutes: 1440, label: 'Noturno' },
];

const SAO_PAULO_TZ = 'America/Sao_Paulo';

/**
 * Determine which bucket a timestamp falls into (São Paulo local time).
 * Defaults to the current time when no timestamp is provided.
 */
export function getHeadwayBucket(timestamp?: number): HeadwayBucketId {
  const date = new Date(timestamp ?? Date.now());
  const spTime = new Date(
    date.toLocaleString('en-US', { timeZone: SAO_PAULO_TZ }),
  );
  const totalMinutes = spTime.getHours() * 60 + spTime.getMinutes();

  for (const bucket of HEADWAY_BUCKETS) {
    if (totalMinutes < bucket.endMinutes) {
      return bucket.id;
    }
  }
  return 'night';
}

/**
 * Get the display label for a bucket.
 */
export function getHeadwayBucketLabel(bucketId: HeadwayBucketId): string {
  return HEADWAY_BUCKETS.find((b) => b.id === bucketId)?.label ?? bucketId;
}

/**
 * Get fallback bucket order: iterate backwards (most recent first) from the
 * given bucket, wrapping around.
 */
export function getHeadwayBucketFallbackOrder(
  currentBucket: HeadwayBucketId,
): HeadwayBucketId[] {
  const idx = HEADWAY_BUCKETS.findIndex((b) => b.id === currentBucket);
  const order: HeadwayBucketId[] = [];
  for (let i = 1; i < HEADWAY_BUCKETS.length; i++) {
    const fallbackIdx =
      (idx - i + HEADWAY_BUCKETS.length) % HEADWAY_BUCKETS.length;
    order.push(HEADWAY_BUCKETS[fallbackIdx].id);
  }
  return order;
}

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/**
 * Headway data for a single direction at a station.
 * Represents the average interval between trains.
 */
export interface DirectionHeadway {
  /** Terminal/destination name for this direction */
  direction: string;
  /** Average headway in seconds */
  averageSeconds: number;
  /** Number of interval samples used in calculation */
  sampleCount: number;
  /** Time-of-day bucket the data belongs to */
  bucket?: HeadwayBucketId;
  /** Display label for the bucket */
  bucketLabel?: string;
  /** True when showing data from a previous bucket (insufficient current data) */
  isFallback?: boolean;
}

/**
 * Headway data for a station (both directions).
 * Sent from backend to frontend via WebSocket.
 */
export interface StationHeadway {
  lineCode: string;
  stationCode: string;
  directions: DirectionHeadway[];
  /** When this headway was last calculated */
  updatedAt: number;
}
