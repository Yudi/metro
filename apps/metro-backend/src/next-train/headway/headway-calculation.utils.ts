import {
  getHeadwayBucketLabel,
  getHeadwayBucket,
  type DirectionHeadway,
  type HeadwayBucketId,
  type StationHeadway,
} from '@metro/shared/utils';
import { HEADWAY_MAX_SAMPLES, HEADWAY_MIN_SAMPLES } from '@metro/shared/utils';
import type { HeadwayCalculationSamples } from '../../historical/historical.service';
import type { CalculatedStationHeadway } from './headway-tracking.types';

export interface HeadwayBucketCalculationResult {
  averageSeconds: number;
  sampleCount: number;
  bucket: HeadwayBucketId;
  isFallback: boolean;
  intervalSamplesSeconds: number[];
  discardedIntervalCount: number;
}

export interface HeadwayCalculationDependencies {
  getPassages: (
    lineCode: string,
    stationCode: string,
    direction: string,
  ) => Promise<number[]>;
  getPassagesFromDb: (
    lineCode: string,
    stationCode: string,
    direction: string,
  ) => Promise<number[]>;
  calculateHeadwayForBucket: (
    timestamps: number[],
    targetBucket: HeadwayBucketId,
    options: { allowFallback: boolean },
  ) => HeadwayBucketCalculationResult | null;
}

export async function calculateStationHeadwayForBucket(
  lineCode: string,
  stationCode: string,
  directions: string[],
  targetBucket: HeadwayBucketId,
  allowFallback: boolean,
  updatedAt: number,
  dependencies: HeadwayCalculationDependencies,
): Promise<CalculatedStationHeadway> {
  const directionHeadways: DirectionHeadway[] = [];
  const samplesByDirection = new Map<string, HeadwayCalculationSamples>();
  const insufficientDirections: CalculatedStationHeadway['insufficientDirections'] =
    [];

  for (const direction of directions) {
    let timestamps = await dependencies.getPassages(
      lineCode,
      stationCode,
      direction,
    );

    if (timestamps.length < HEADWAY_MIN_SAMPLES) {
      timestamps = await dependencies.getPassagesFromDb(
        lineCode,
        stationCode,
        direction,
      );
    }

    const result = dependencies.calculateHeadwayForBucket(
      timestamps,
      targetBucket,
      { allowFallback },
    );
    if (result) {
      samplesByDirection.set(direction, {
        intervalsSeconds: result.intervalSamplesSeconds,
        discardedIntervalCount: result.discardedIntervalCount,
        minimumIntervals: HEADWAY_MIN_SAMPLES - 1,
        maximumPassages: HEADWAY_MAX_SAMPLES,
        targetBucket,
        selectedBucket: result.bucket,
      });

      directionHeadways.push({
        direction,
        averageSeconds: result.averageSeconds,
        sampleCount: result.sampleCount,
        bucket: result.bucket,
        bucketLabel: getHeadwayBucketLabel(result.bucket),
        isFallback: result.isFallback,
      });
    } else {
      insufficientDirections.push({
        direction,
        sampleCount: timestamps.filter(
          (timestamp) => getHeadwayBucket(timestamp) === targetBucket,
        ).length,
      });
    }
  }

  if (directionHeadways.length === 0) {
    return {
      headway: null,
      samplesByDirection,
      insufficientDirections,
    };
  }

  const headway: StationHeadway = {
    lineCode,
    stationCode,
    directions: directionHeadways,
    updatedAt,
  };

  return {
    headway,
    samplesByDirection,
    insufficientDirections,
  };
}
