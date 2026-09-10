import { createHash } from 'crypto';
import type { RailScheduledService } from '@metro/shared/utils';
import type { NextTrainArrivalDto } from '../dto/next-train.dto';
import type { LineCode } from './next-train-polling.types';

export function computeStationCacheHash(
  trains: NextTrainArrivalDto[],
  hasError: boolean,
  operationClosed: boolean,
  outOfSchedule: boolean,
  scheduledServices: RailScheduledService[] = [],
): string {
  const sorted = [...trains].sort((a, b) => {
    const destCompare = a.destinationCode.localeCompare(b.destinationCode);
    if (destCompare !== 0) return destCompare;
    return a.arrivalTime.localeCompare(b.arrivalTime);
  });

  const data = {
    hasError,
    operationClosed,
    outOfSchedule,
    scheduledServices: [...scheduledServices]
      .sort((a, b) => {
        const departureCompare = a.nextDepartureAt.localeCompare(
          b.nextDepartureAt,
        );
        if (departureCompare !== 0) return departureCompare;
        const destinationCompare = a.destinationCode.localeCompare(
          b.destinationCode,
        );
        if (destinationCompare !== 0) return destinationCompare;
        return a.originStationCode.localeCompare(b.originStationCode);
      })
      .map((service) => ({
        destinationCode: service.destinationCode,
        destinationName: service.destinationName,
        originStationCode: service.originStationCode,
        originStationName: service.originStationName,
        nextDepartureAt: service.nextDepartureAt,
        intervalLabel: service.intervalLabel,
        nextArrivalAt: service.nextArrivalAt,
        arrivalEstimated: service.arrivalEstimated,
        followingDepartures: service.followingDepartures?.map((departure) => ({
          departureAt: departure.departureAt,
          arrivalAt: departure.arrivalAt,
        })),
      })),
    trains: sorted.map((train) => ({
      dest: train.destinationCode,
      curr: train.trainCurrentStationName,
      time: train.arrivalTime,
      plat: train.isAtPlatform,
      stopped: train.isTrainStopped,
      position: train.trainPositionStatus,
      near: train.trainNearStationName,
      passed: train.trainLastPassedStationName,
      cars: train.cars,
    })),
  };

  return createHash('md5').update(JSON.stringify(data)).digest('hex');
}

export function getLineNumber(lineCode: LineCode): number | null {
  const match = lineCode.match(/^L(\d+)$/);
  return match ? Number(match[1]) : null;
}
