import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HeadwayCacheService,
  SerializedTrackedTrain,
  SerializedTrackingState,
} from './headway-cache.service';
import { HeadwayTrackingService } from './headway-tracking.service';
import { RailHeadwayObservation } from '@metro/rail-integration-contracts';
import { ActualCptmLineCode } from '@metro/shared/utils';

/**
 * When a train's prediction drops to this value or below, it is
 * considered to have arrived at the station.
 */
const ARRIVAL_THRESHOLD_SECONDS = 30;

/**
 * If a train disappears from predictions and its last prediction was
 * at or below this threshold, count it as a passage (it departed).
 */
const DEPARTURE_THRESHOLD_SECONDS = 120;

/** Minimum gap between two recorded passages for the same direction (ms) */
const MIN_DIRECTION_INTERVAL = 60_000;

/**
 * Headway tracking service for CPTM lines (L10-L13) served by the rail
 * integration source.
 *
 * Unlike the generic HeadwayTrackingService which compares anonymous
 * snapshots, this service tracks individual trains by their unique
 * key from the sanitized headway-observation stream.
 *
 * All tracking state is stored in Redis for durability across restarts
 * and to share data between potential instances.
 *
 * Passage detection:
 * 1. A tracked train's prediction drops to ≤ 30 s → passage recorded.
 * 2. A tracked train disappears from predictions while its last
 *    prediction was ≤ 120 s → passage recorded (it left the station).
 * 3. A train first appears with prediction ≤ 30 s → passage recorded
 *    immediately (we missed the approach).
 */
@Injectable()
export class CptmHeadwayTrackingService {
  private readonly logger = new Logger(CptmHeadwayTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: HeadwayCacheService,
    private readonly headwayTracking: HeadwayTrackingService,
  ) {}

  /**
   * Process current headway observations for a CPTM station.
   *
   * Reads current tracking state from Redis, detects passages,
   * then writes the updated state back.
   */
  async processObservations(
    lineCode: ActualCptmLineCode,
    stationCode: string,
    observations: RailHeadwayObservation[],
    fetchedAt: number,
  ): Promise<void> {
    // Load current tracking state from Redis (or start fresh)
    const stored = await this.cache.getCptmTrackingState(lineCode, stationCode);
    const trains = new Map<string, SerializedTrackedTrain>(
      stored ? Object.entries(stored.trains) : [],
    );

    // Collect all current live vehicles
    const currentVehicles = new Map<
      string,
      { direction: string; prediction: number }
    >();

    for (const observation of observations) {
      if (!observation.trainKey) continue;

      currentVehicles.set(observation.trainKey, {
        direction: observation.directionName,
        prediction: observation.secondsToStation,
      });
    }

    // Step 1: Detect departures — trains that disappeared from predictions
    for (const [prefix, tracked] of trains) {
      if (currentVehicles.has(prefix)) continue;

      if (
        !tracked.passageRecorded &&
        tracked.prediction <= DEPARTURE_THRESHOLD_SECONDS
      ) {
        await this.recordPassage(
          lineCode,
          stationCode,
          tracked.direction,
          fetchedAt,
          prefix,
        );
      }

      trains.delete(prefix);
    }

    // Step 2: Update existing trains and detect arrivals
    for (const [prefix, current] of currentVehicles) {
      const existing = trains.get(prefix);

      if (existing) {
        const prevPrediction = existing.prediction;
        existing.prediction = current.prediction;
        existing.lastSeenAt = fetchedAt;
        existing.direction = current.direction;

        // Prediction crossed the arrival threshold downward
        if (
          !existing.passageRecorded &&
          prevPrediction > ARRIVAL_THRESHOLD_SECONDS &&
          current.prediction <= ARRIVAL_THRESHOLD_SECONDS
        ) {
          existing.passageRecorded = true;
          await this.recordPassage(
            lineCode,
            stationCode,
            current.direction,
            fetchedAt,
            prefix,
          );
        }
      } else {
        // New train — start tracking
        const alreadyAtStation =
          current.prediction <= ARRIVAL_THRESHOLD_SECONDS;

        trains.set(prefix, {
          prefix,
          direction: current.direction,
          prediction: current.prediction,
          lastSeenAt: fetchedAt,
          firstSeenAt: fetchedAt,
          passageRecorded: alreadyAtStation,
        });

        if (alreadyAtStation) {
          await this.recordPassage(
            lineCode,
            stationCode,
            current.direction,
            fetchedAt,
            prefix,
          );
        }
      }
    }

    // Persist updated state to Redis
    const serialized: SerializedTrackingState = {
      trains: Object.fromEntries(trains),
      lastPollAt: fetchedAt,
    };
    await this.cache.saveCptmTrackingState(lineCode, stationCode, serialized);
  }

  private async recordPassage(
    lineCode: string,
    stationCode: string,
    direction: string,
    timestamp: number,
    trainPrefix: string,
  ): Promise<void> {
    // Deduplicate using Redis-backed last passage time
    const lastPassage = await this.cache.getCptmLastPassage(
      lineCode,
      stationCode,
      direction,
    );

    if (
      lastPassage &&
      Math.abs(timestamp - lastPassage) < MIN_DIRECTION_INTERVAL
    ) {
      return;
    }

    await this.cache.saveCptmLastPassage(
      lineCode,
      stationCode,
      direction,
      timestamp,
    );

    // Store in Redis for fast headway calculation
    await this.cache.recordPassage(lineCode, stationCode, direction, timestamp);

    // Persist to DB
    try {
      await this.prisma.trainPassage.create({
        data: {
          lineCode,
          stationCode,
          direction,
          passedAt: new Date(timestamp),
          trainId: trainPrefix,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist CPTM passage for ${lineCode}:${stationCode}:${direction} (${trainPrefix}): ${error}`,
      );
    }

    // Recalculate headway
    await this.headwayTracking.calculateAndCacheHeadway(lineCode, stationCode);
  }
}
