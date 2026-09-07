import { createHash } from 'crypto';
import type { NextTrainArrivalDto } from '../dto/next-train.dto';
import type { LineCode } from './next-train-polling.types';

export function computeStationCacheHash(
  trains: NextTrainArrivalDto[],
  hasError: boolean,
  operationClosed: boolean,
  outOfSchedule: boolean,
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
