import {
  HEADWAY_BUCKETS,
  type ExtendedNextTrainLineCode,
  type HeadwayBucketId,
} from '@metro/shared/utils';
import {
  SaoPauloDateParts,
  HeadwayPassageDetection,
  TrainSnapshot,
} from './headway-tracking.types';

export function getCompletedBucketObservedAt(bucketId: HeadwayBucketId): Date {
  const bucket = HEADWAY_BUCKETS.find(({ id }) => id === bucketId);
  if (!bucket) {
    return new Date();
  }

  const saoPauloReference = getSaoPauloDateParts(new Date());
  const endHours = Math.floor(bucket.endMinutes / 60);
  const endMinutes = bucket.endMinutes % 60;
  let boundary: SaoPauloDateParts = {
    ...saoPauloReference,
    hours: endHours,
    minutes: endMinutes,
  };

  if (bucket.endMinutes === 24 * 60) {
    boundary = {
      ...saoPauloReference,
      day: saoPauloReference.day + 1,
      hours: 0,
      minutes: 0,
    };
  }

  if (
    buildSaoPauloDate(boundary).getTime() >
    buildSaoPauloDate(saoPauloReference).getTime()
  ) {
    boundary = {
      ...boundary,
      day: boundary.day - 1,
    };
  }

  return buildSaoPauloDate(boundary);
}

export function getSaoPauloDateParts(date: Date): SaoPauloDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hours: value('hour'),
    minutes: value('minute'),
  };
}

export function buildSaoPauloDate(date: Date | SaoPauloDateParts): Date {
  const parts =
    date instanceof Date
      ? {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          hours: date.getHours(),
          minutes: date.getMinutes(),
        }
      : date;

  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hours + 3,
      parts.minutes,
    ),
  );
}

export async function detectHeadwayPassages({
  lineCode,
  stationCode,
  previous,
  currentTrains,
  fetchedAt,
  recordPassage,
}: HeadwayPassageDetection): Promise<void> {
  const prevByDirection = groupByDirection(previous.trains);
  const currByDirection = groupByDirection(currentTrains);

  for (const [direction, prevTrains] of prevByDirection) {
    const currTrains = currByDirection.get(direction) ?? [];

    for (const prevTrain of prevTrains) {
      if (!wasAtPlatform(prevTrain)) {
        continue;
      }

      const stillPresent = currTrains.some((current) =>
        isSamePlatformTrain(prevTrain, current, lineCode),
      );
      if (!stillPresent) {
        await recordPassage(
          lineCode,
          stationCode,
          direction,
          fetchedAt,
          prevTrain.arrivalTime,
        );
      }
    }

    if (lineCode !== 'L4') {
      continue;
    }

    for (const prevTrain of prevTrains) {
      const arrivalMs = parseArrivalToMs(
        prevTrain.arrivalTime,
        previous.fetchedAt,
      );
      if (arrivalMs === null || arrivalMs - fetchedAt > 180_000) {
        continue;
      }

      const stillPresent = currTrains.some((current) => {
        if (current.destinationCode !== prevTrain.destinationCode) {
          return false;
        }
        const currentArrivalMs = parseArrivalToMs(
          current.arrivalTime,
          fetchedAt,
        );
        return (
          currentArrivalMs !== null &&
          Math.abs(currentArrivalMs - arrivalMs) < 120_000
        );
      });

      if (!stillPresent) {
        await recordPassage(
          lineCode,
          stationCode,
          direction,
          Math.min(arrivalMs, fetchedAt),
          prevTrain.arrivalTime,
        );
      }
    }
  }
}

export function wasAtPlatform(train: TrainSnapshot): boolean {
  return (
    train.isAtPlatform === true || train.trainPositionStatus === 'at_station'
  );
}

export function isAtPlatform(
  train: Pick<TrainSnapshot, 'isAtPlatform' | 'trainPositionStatus'>,
): boolean {
  return (
    train.isAtPlatform === true || train.trainPositionStatus === 'at_station'
  );
}

export function isSamePlatformTrain(
  previous: TrainSnapshot,
  current: TrainSnapshot,
  lineCode: ExtendedNextTrainLineCode,
): boolean {
  if (current.destinationCode !== previous.destinationCode) return false;
  if (current.arrivalTime === previous.arrivalTime) return true;

  if (lineCode === 'L8' || lineCode === 'L9') {
    if (isAtPlatform(current)) return true;

    const previousStation = normalizeStationName(
      previous.trainCurrentStationName,
    );
    const currentStation = normalizeStationName(
      current.trainCurrentStationName,
    );
    return previousStation !== '' && previousStation === currentStation;
  }

  return false;
}

export function normalizeStationName(stationName: string): string {
  return stationName.trim().toLocaleLowerCase('pt-BR');
}

export function parseArrivalToMs(
  arrivalTime: string,
  fetchedAt: number,
): number | null {
  const clockTime = parseClockArrivalTime(arrivalTime, fetchedAt);
  if (clockTime !== null) {
    return clockTime;
  }

  const parsed = Date.parse(arrivalTime);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseClockArrivalTime(
  arrivalTime: string,
  fetchedAt: number,
): number | null {
  const match = arrivalTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const now = new Date(fetchedAt);
  const spParts = getSaoPauloDateParts(now);
  const spDate = buildSaoPauloDate({ ...spParts, hours, minutes });

  const diff = spDate.getTime() - now.getTime();
  if (diff < -6 * 3600_000) {
    return buildSaoPauloDate({
      ...spParts,
      day: spParts.day + 1,
      hours,
      minutes,
    }).getTime();
  }

  return spDate.getTime();
}

export function groupByDirection(
  trains: TrainSnapshot[],
): Map<string, TrainSnapshot[]> {
  const map = new Map<string, TrainSnapshot[]>();
  for (const train of trains) {
    const list = map.get(train.destinationName);
    if (list) {
      list.push(train);
    } else {
      map.set(train.destinationName, [train]);
    }
  }
  return map;
}
