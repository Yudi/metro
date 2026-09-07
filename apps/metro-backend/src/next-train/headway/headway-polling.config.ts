import type { RailStatusCode } from '@metro/shared/utils';

export type HeadwayProvider = 'line8Line9' | 'line4' | 'extended';

export const HEADWAY_POLL_INTERVALS: Record<HeadwayProvider, number> = {
  line8Line9: 30_000,
  line4: 60_000,
  extended: 45_000,
};

export const CPTM_BACKGROUND_DISPATCH_DELAY = 1_000;
export const HEADWAY_POLL_JITTER_RATIO = 0.25;
export const MIN_POLL_TICK_INTERVAL = 2_000;
export const WARMUP_MAX_STATIONS = 3;
export const WARMUP_OFF_HOURS_MAX_STATIONS = 1;
export const STATION_STAGGER_MS = 500;
export const OFF_HOURS_STATUS_RECHECK_INTERVAL = 300_000;
export const NORMAL_HOURS_POLL_INTERVAL = 20_000;
export const NON_OPERATING_STATUS_CODES = new Set<RailStatusCode>([
  'OperacaoEncerrada',
  'Paralisada',
]);
export const PRUNE_INTERVAL = 12 * 60 * 60 * 1000;

export function getJitteredInterval(baseInterval: number): number {
  const jitterRange = Math.max(
    1,
    Math.floor(baseInterval * HEADWAY_POLL_JITTER_RATIO),
  );
  const minInterval = Math.max(
    MIN_POLL_TICK_INTERVAL,
    baseInterval - jitterRange,
  );
  const maxInterval = baseInterval + jitterRange;

  return (
    minInterval + Math.floor(Math.random() * (maxInterval - minInterval + 1))
  );
}

export function getStartupJitterOffset(baseDelay: number): number {
  const jitterRange = Math.max(
    1,
    Math.floor(baseDelay * HEADWAY_POLL_JITTER_RATIO),
  );
  return Math.floor(Math.random() * (jitterRange + 1));
}

export function shuffleStations(stationCodes: string[]): string[] {
  const shuffled = [...stationCodes];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    const current = shuffled[i];
    shuffled[i] = shuffled[randomIndex];
    shuffled[randomIndex] = current;
  }
  return shuffled;
}

export function shuffleCptmPollingStations<T>(stations: T[]): void {
  for (let i = stations.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    const current = stations[i];
    stations[i] = stations[randomIndex];
    stations[randomIndex] = current;
  }
}
