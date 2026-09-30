import type { RailScheduledService } from '@metro/shared/utils';
import type { NextTrainArrivalDto } from '../dto/next-train.dto';

/**
 * Use schedules while a live snapshot has no arrivals. Any live arrivals
 * replace the static fallback for that station.
 */
export function shouldFetchScheduledFallback(
  trains: readonly NextTrainArrivalDto[],
): boolean {
  return trains.length === 0;
}

/** Keep the public station snapshot mutually exclusive: live arrivals replace schedules. */
export function scheduledFallbackForSnapshot(
  trains: readonly NextTrainArrivalDto[],
  scheduledServices: readonly RailScheduledService[] | undefined,
): RailScheduledService[] {
  return trains.length === 0 ? [...(scheduledServices ?? [])] : [];
}
