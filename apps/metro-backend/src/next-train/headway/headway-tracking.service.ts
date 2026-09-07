import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HeadwayCacheService } from './headway-cache.service';
import { HistoricalService } from '../../historical/historical.service';
import { NextTrainArrivalDto } from '../dto/next-train.dto';
import {
  StationHeadway,
  HeadwayBucketId,
  HEADWAY_MIN_SAMPLES,
  HEADWAY_MAX_SAMPLES,
  ExtendedNextTrainLineCode,
  getHeadwayBucket,
  getHeadwayBucketLabel,
  isHeadwayOffHoursSuppressionWindow,
  isActualCptmLine,
  isSpecialCptmLine,
} from '@metro/shared/utils';
import {
  CalculatedStationHeadway,
  StationSnapshot,
  DUPLICATE_COOLDOWN,
  MIN_PASSAGE_INTERVAL,
} from './headway-tracking.types';
import {
  detectHeadwayPassages,
  getCompletedBucketObservedAt,
} from './headway-tracking.utils';
import { calculateStationHeadwayForBucket as calculateHeadwayForBucket } from './headway-calculation.utils';

/**
 * Service that detects train passages from real-time API snapshots
 * and calculates average headway per direction.
 *
 * Handles L4, L8, and L9 only. CPTM lines (L10-L13) are handled by
 * CptmHeadwayTrackingService using individual-train tracking.
 *
 * Detection strategy varies by line behavior:
 *
 * **L8/L9:**
 * - Detects when a train observed at the platform is replaced or disappears
 * - Never treats decreasing or revised arrival predictions as passages
 *
 * **L4:**
 * - Detects when `expectedArrivalTime <= now()` (time has passed)
 * - Detects when a train disappears from the list
 */
@Injectable()
export class HeadwayTrackingService implements OnModuleDestroy {
  private readonly logger = new Logger(HeadwayTrackingService.name);

  /**
   * Previous snapshots: Map<"L9:HBR", StationSnapshot>
   * Used to compare consecutive poll results and detect passages.
   */
  private readonly previousSnapshots = new Map<string, StationSnapshot>();

  /**
   * Recently recorded passages to prevent duplicates.
   * Map<"L9:HBR:Varginha", lastRecordedTimestamp>
   */
  private readonly recentPassages = new Map<string, number>();

  /**
   * Active historical bucket per station, used as a fallback when Redis is
   * unavailable. Historical snapshots are committed only when this rolls over.
   */
  private readonly activeHistoricalBuckets = new Map<string, HeadwayBucketId>();

  /** Periodic cleanup timer */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: HeadwayCacheService,
    private readonly historicalService: HistoricalService,
  ) {
    // Clean up old in-memory data every 10 minutes
    this.cleanupTimer = setInterval(
      () => this.cleanupStaleData(),
      10 * 60 * 1000,
    );
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * Process a new poll result for a station.
   * Compares with previous snapshot to detect train passages.
   *
   * Only handles L4, L8, L9. CPTM lines (L10-L13) are skipped
   * and handled by CptmHeadwayTrackingService.
   *
   * Call this from the polling service after each successful fetch.
   */
  async processPollResult(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
    trains: NextTrainArrivalDto[],
    fetchedAt: number,
  ): Promise<void> {
    // CPTM lines use individual-train tracking in CptmHeadwayTrackingService
    if (isActualCptmLine(lineCode) || isSpecialCptmLine(lineCode)) return;

    const key = `${lineCode}:${stationCode}`;

    // Clear an earlier snapshot inside the central overnight suppression
    // window, so a disappearance cannot be interpreted as a passage when
    // service resumes. The first and final hours remain available for trains
    // that still run around the timetable boundary.
    if (isHeadwayOffHoursSuppressionWindow(fetchedAt)) {
      this.previousSnapshots.delete(key);
      return;
    }

    const previous = this.previousSnapshots.get(key);

    if (previous) {
      await this.detectPassages(
        lineCode,
        stationCode,
        previous,
        trains,
        fetchedAt,
      );
    }

    // Store current snapshot for next comparison
    this.previousSnapshots.set(key, {
      trains: trains.map((t) => ({
        destinationCode: t.destinationCode,
        destinationName: t.destinationName,
        arrivalTime: t.arrivalTime,
        isAtPlatform: t.isAtPlatform,
        trainPositionStatus: t.trainPositionStatus,
        trainCurrentStationName: t.trainCurrentStationName,
      })),
      fetchedAt,
    });
  }

  /**
   * Get headway data for a station.
   * Uses the current time-of-day bucket, falling back to recent buckets.
   * Tries Redis cache first, then calculates from passages.
   */
  async getHeadway(
    lineCode: string,
    stationCode: string,
  ): Promise<StationHeadway | null> {
    if (isSpecialCptmLine(lineCode)) {
      return null;
    }

    const bucket = getHeadwayBucket();

    // Try Redis cache first (keyed by bucket)
    const cached = await this.cache.getCachedHeadway(
      lineCode,
      stationCode,
      bucket,
    );
    if (cached) return cached;

    // Calculate from DB passages
    return this.calculateAndCacheHeadway(lineCode, stationCode);
  }

  /**
   * Detect passages by comparing previous and current train snapshots.
   */
  private async detectPassages(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
    previous: StationSnapshot,
    currentTrains: NextTrainArrivalDto[],
    fetchedAt: number,
  ): Promise<void> {
    await detectHeadwayPassages({
      lineCode,
      stationCode,
      previous,
      currentTrains,
      fetchedAt,
      recordPassage: this.recordPassage.bind(this),
    });
  }

  /**
   * Record a train passage, with deduplication.
   */
  private async recordPassage(
    lineCode: string,
    stationCode: string,
    direction: string,
    timestamp: number,
    trainId?: string,
  ): Promise<void> {
    const dedupeKey = `${lineCode}:${stationCode}:${direction}`;
    const lastRecorded = this.recentPassages.get(dedupeKey);

    // Debounce: skip if we recorded a passage for this direction very recently.
    // Use Math.abs to handle non-monotonic timestamps (e.g., L4 clamped arrival
    // times that may be slightly out of order across detections).
    if (
      lastRecorded &&
      Math.abs(timestamp - lastRecorded) < MIN_PASSAGE_INTERVAL
    ) {
      return;
    }

    this.recentPassages.set(dedupeKey, timestamp);

    // Store in Redis for fast headway calculation
    await this.cache.recordPassage(lineCode, stationCode, direction, timestamp);

    // Persist to DB for long-term storage
    try {
      await this.prisma.trainPassage.create({
        data: {
          lineCode,
          stationCode,
          direction,
          passedAt: new Date(timestamp),
          trainId: trainId ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist passage to DB for ${dedupeKey}: ${error}`,
      );
    }

    // Recalculate headway after recording a new passage
    await this.calculateAndCacheHeadway(lineCode, stationCode);
  }

  /**
   * Calculate headway from stored passages and cache the result.
   * Groups intervals by time-of-day bucket and uses the current bucket
   * (with fallback to the most recent bucket that has enough data).
   *
   * Public so CptmHeadwayTrackingService can trigger recalculation
   * after recording passages.
   */
  async calculateAndCacheHeadway(
    lineCode: string,
    stationCode: string,
  ): Promise<StationHeadway | null> {
    try {
      return await this.calculateAndCacheHeadwayInternal(lineCode, stationCode);
    } catch (error) {
      this.logger.warn(
        `Failed to calculate headway for ${lineCode}:${stationCode}: ${error}`,
      );
      await this.historicalService.recordHeadwayError({
        lineCode,
        stationCode,
        reason: 'calculation_failed',
        error,
      });
      return null;
    }
  }

  private async calculateAndCacheHeadwayInternal(
    lineCode: string,
    stationCode: string,
  ): Promise<StationHeadway | null> {
    const currentBucket = getHeadwayBucket();
    // Get distinct directions for this station
    const directions = await this.getDirections(lineCode, stationCode);
    if (directions.length === 0) return null;

    await this.recordCompletedHistoricalBucket(
      lineCode,
      stationCode,
      currentBucket,
      directions,
    );

    const { headway } = await this.calculateStationHeadwayForBucket(
      lineCode,
      stationCode,
      directions,
      currentBucket,
      true,
      Date.now(),
    );

    if (!headway) return null;

    await this.cache.cacheHeadway(headway, currentBucket);
    return headway;
  }

  private async calculateStationHeadwayForBucket(
    lineCode: string,
    stationCode: string,
    directions: string[],
    targetBucket: HeadwayBucketId,
    allowFallback: boolean,
    updatedAt: number,
  ): Promise<CalculatedStationHeadway> {
    return calculateHeadwayForBucket(
      lineCode,
      stationCode,
      directions,
      targetBucket,
      allowFallback,
      updatedAt,
      {
        getPassages: this.cache.getPassages.bind(this.cache),
        getPassagesFromDb: this.getPassagesFromDb.bind(this),
        calculateHeadwayForBucket: this.cache.calculateHeadwayForBucket.bind(
          this.cache,
        ),
      },
    );
  }

  private async recordCompletedHistoricalBucket(
    lineCode: string,
    stationCode: string,
    currentBucket: HeadwayBucketId,
    directions: string[],
  ): Promise<void> {
    const stationKey = `${lineCode}:${stationCode}`;
    const activeBucket =
      (await this.cache.getActiveHeadwayHistoryBucket(lineCode, stationCode)) ??
      this.activeHistoricalBuckets.get(stationKey);

    if (!activeBucket) {
      await this.saveActiveHistoricalBucket(
        lineCode,
        stationCode,
        stationKey,
        currentBucket,
      );
      return;
    }

    if (activeBucket === currentBucket) {
      this.activeHistoricalBuckets.set(stationKey, currentBucket);
      return;
    }

    const observedAt = getCompletedBucketObservedAt(activeBucket);
    const { headway, samplesByDirection, insufficientDirections } =
      await this.calculateStationHeadwayForBucket(
        lineCode,
        stationCode,
        directions,
        activeBucket,
        false,
        observedAt.getTime(),
      );

    if (headway) {
      await this.historicalService.recordHeadwayResult(
        headway,
        samplesByDirection,
      );
    }

    await Promise.all(
      insufficientDirections.map(({ direction, sampleCount }) =>
        this.historicalService.recordHeadwayError({
          lineCode,
          stationCode,
          direction,
          observedAt,
          sampleCount,
          bucket: activeBucket,
          bucketLabel: getHeadwayBucketLabel(activeBucket),
          reason: 'insufficient_samples',
          metadata: {
            minSamples: HEADWAY_MIN_SAMPLES,
          },
        }),
      ),
    );

    await this.saveActiveHistoricalBucket(
      lineCode,
      stationCode,
      stationKey,
      currentBucket,
    );
  }

  private async saveActiveHistoricalBucket(
    lineCode: string,
    stationCode: string,
    stationKey: string,
    bucket: HeadwayBucketId,
  ): Promise<void> {
    this.activeHistoricalBuckets.set(stationKey, bucket);
    await this.cache.saveActiveHeadwayHistoryBucket(
      lineCode,
      stationCode,
      bucket,
    );
  }

  /**
   * Get distinct directions observed for a station.
   */
  private async getDirections(
    lineCode: string,
    stationCode: string,
  ): Promise<string[]> {
    try {
      const result = await this.prisma.trainPassage.findMany({
        where: { lineCode, stationCode },
        select: { direction: true },
        distinct: ['direction'],
      });
      return result.map((r) => r.direction);
    } catch {
      return [];
    }
  }

  /**
   * Fetch passage timestamps from DB as fallback.
   */
  private async getPassagesFromDb(
    lineCode: string,
    stationCode: string,
    direction: string,
  ): Promise<number[]> {
    try {
      const passages = await this.prisma.trainPassage.findMany({
        where: { lineCode, stationCode, direction },
        orderBy: { passedAt: 'desc' },
        take: HEADWAY_MAX_SAMPLES,
        select: { passedAt: true },
      });
      return passages.map((p) => p.passedAt.getTime());
    } catch {
      return [];
    }
  }

  /**
   * Clean up stale in-memory data for stations no longer being polled.
   */
  private cleanupStaleData(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [key, snapshot] of this.previousSnapshots) {
      if (now - snapshot.fetchedAt > maxAge) {
        this.previousSnapshots.delete(key);
      }
    }

    for (const [key, timestamp] of this.recentPassages) {
      if (now - timestamp > DUPLICATE_COOLDOWN * 2) {
        this.recentPassages.delete(key);
      }
    }
  }

  /**
   * Prune old passages from the database.
   * Should be called periodically (e.g., daily) to keep the table small.
   */
  async pruneOldPassages(maxAgeHours = 24): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeHours * 3600_000);
    try {
      const result = await this.prisma.trainPassage.deleteMany({
        where: { passedAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(`Pruned ${result.count} old train passages`);
      }
      return result.count;
    } catch (error) {
      this.logger.warn(`Failed to prune old passages: ${error}`);
      return 0;
    }
  }
}
