import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HeadwayCacheService } from './headway-cache.service';
import {
  HeadwayCalculationSamples,
  HistoricalService,
} from '../../historical/historical.service';
import {
  NextTrainArrivalDto,
  TrainPositionStatus,
} from '../dto/next-train.dto';
import {
  StationHeadway,
  DirectionHeadway,
  HeadwayBucketId,
  HEADWAY_BUCKETS,
  HEADWAY_MIN_SAMPLES,
  HEADWAY_MAX_SAMPLES,
  ExtendedNextTrainLineCode,
  getHeadwayBucket,
  getHeadwayBucketLabel,
  isActualCptmLine,
  isSpecialCptmLine,
} from '@metro/shared/utils';

/**
 * Previous train snapshot for a station + direction.
 * Used to detect when a train disappears (has passed the station).
 */
interface TrainSnapshot {
  destinationCode: string;
  destinationName: string;
  arrivalTime: string;
  isAtPlatform: boolean | null;
  trainPositionStatus?: TrainPositionStatus;
  trainCurrentStationName: string;
}

interface StationSnapshot {
  trains: TrainSnapshot[];
  fetchedAt: number;
}

interface CalculatedStationHeadway {
  headway: StationHeadway | null;
  samplesByDirection: Map<string, HeadwayCalculationSamples>;
  insufficientDirections: {
    direction: string;
    sampleCount: number;
  }[];
}

interface SaoPauloDateParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}

/** Minimum time between two recorded passages for the same direction (ms) */
const MIN_PASSAGE_INTERVAL = 60_000; // 1 minute

/** How long to remember a recently recorded passage to avoid duplicates (ms) */
const DUPLICATE_COOLDOWN = 90_000; // 1.5 minutes

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
    // Group previous trains by direction (destination name)
    const prevByDirection = this.groupByDirection(previous.trains);
    const currByDirection = this.groupByDirection(currentTrains);

    for (const [direction, prevTrains] of prevByDirection) {
      const currTrains = currByDirection.get(direction) ?? [];

      // Strategy 1: Detect trains that were at platform and are now gone.
      // L8/L9 predictions can be revised when a train is delayed, so matching
      // must not depend on the arrival time remaining unchanged.
      for (const prevTrain of prevTrains) {
        if (this.wasAtPlatform(prevTrain)) {
          const stillPresent = currTrains.some((ct) =>
            this.isSamePlatformTrain(prevTrain, ct, lineCode),
          );
          if (!stillPresent) {
            await this.recordPassage(
              lineCode,
              stationCode,
              direction,
              fetchedAt,
              prevTrain.arrivalTime,
            );
          }
        }
      }

      // Strategy 2a (L4 only): Detect disappearance with fuzzy matching.
      // The L4 source removes trains as they arrive at the station, often slightly
      // BEFORE the expectedArrivalTime. The strict `arrivalMs <= fetchedAt`
      // check used for other lines would miss these. Additionally, L4 updates
      // the expectedArrivalTime ISO string between polls for the same physical
      // train, so we use fuzzy time matching instead of exact string comparison.
      if (lineCode === 'L4') {
        for (const prevTrain of prevTrains) {
          const arrivalMs = this.parseArrivalToMs(
            prevTrain.arrivalTime,
            previous.fetchedAt,
          );
          if (arrivalMs === null) continue;

          // Only consider trains whose arrival is reasonably close to now.
          // Skip trains far in the future that might just be temporarily
          // missing from the API response.
          if (arrivalMs - fetchedAt > 180_000) continue;

          // Fuzzy match: same destination and arrival time within 2 minutes.
          // L4 updates the ISO timestamp between polls for the same train,
          // so exact string matching would cause false disappearances.
          const stillPresent = currTrains.some((ct) => {
            if (ct.destinationCode !== prevTrain.destinationCode) return false;
            const ctMs = this.parseArrivalToMs(ct.arrivalTime, fetchedAt);
            if (ctMs === null) return false;
            return Math.abs(ctMs - arrivalMs) < 120_000;
          });

          if (!stillPresent) {
            // Clamp passage time to not be in the future
            const passageTime = Math.min(arrivalMs, fetchedAt);
            await this.recordPassage(
              lineCode,
              stationCode,
              direction,
              passageTime,
              prevTrain.arrivalTime,
            );
          }
        }
      }

      // L8/L9 passages intentionally require a confirmed platform observation
      // followed by replacement/disappearance. These snapshots do not include
      // a stable train ID, and an incoming train's ETA can move in either
      // direction while delayed, so prediction expiry is not reliable evidence
      // of passage.
    }
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
    const directionHeadways: DirectionHeadway[] = [];
    const samplesByDirection = new Map<string, HeadwayCalculationSamples>();
    const insufficientDirections: CalculatedStationHeadway['insufficientDirections'] =
      [];

    for (const direction of directions) {
      // Try Redis passages first
      let timestamps = await this.cache.getPassages(
        lineCode,
        stationCode,
        direction,
      );

      // Fallback to DB if Redis has insufficient data
      if (timestamps.length < HEADWAY_MIN_SAMPLES) {
        timestamps = await this.getPassagesFromDb(
          lineCode,
          stationCode,
          direction,
        );
      }

      const result = this.cache.calculateHeadwayForBucket(
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
          sampleCount: this.countPassagesInBucket(timestamps, targetBucket),
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

    const observedAt = this.getCompletedBucketObservedAt(activeBucket);
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

  private countPassagesInBucket(
    timestamps: number[],
    bucket: HeadwayBucketId,
  ): number {
    return timestamps.filter(
      (timestamp) => getHeadwayBucket(timestamp) === bucket,
    ).length;
  }

  private getCompletedBucketObservedAt(bucketId: HeadwayBucketId): Date {
    const bucket = HEADWAY_BUCKETS.find(({ id }) => id === bucketId);
    if (!bucket) {
      return new Date();
    }

    const saoPauloReference = this.getSaoPauloDateParts(new Date());
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
      this.buildSaoPauloDate(boundary).getTime() >
      this.buildSaoPauloDate(saoPauloReference).getTime()
    ) {
      boundary = {
        ...boundary,
        day: boundary.day - 1,
      };
    }

    return this.buildSaoPauloDate(boundary);
  }

  private getSaoPauloDateParts(date: Date): SaoPauloDateParts {
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

  private buildSaoPauloDate(date: Date | SaoPauloDateParts): Date {
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
   * Check if a previous train was at the viewing station's platform.
   */
  private wasAtPlatform(train: TrainSnapshot): boolean {
    if (train.isAtPlatform === true) return true;
    if (train.trainPositionStatus === 'at_station') return true;
    return false;
  }

  /**
   * Check if a current train is at the platform.
   */
  private isAtPlatform(
    train: Pick<TrainSnapshot, 'isAtPlatform' | 'trainPositionStatus'>,
  ): boolean {
    if (train.isAtPlatform === true) return true;
    if (train.trainPositionStatus === 'at_station') return true;
    return false;
  }

  /**
   * Match consecutive observations of a train that reached the platform.
   *
   * Some snapshots do not include a stable train ID. A delayed train may
   * receive a different ETA, but if it remains at the platform or at the same
   * reported location, it is still the same train and must not become a
   * headway sample.
   */
  private isSamePlatformTrain(
    previous: TrainSnapshot,
    current: TrainSnapshot,
    lineCode: ExtendedNextTrainLineCode,
  ): boolean {
    if (current.destinationCode !== previous.destinationCode) return false;
    if (current.arrivalTime === previous.arrivalTime) return true;

    if (lineCode === 'L8' || lineCode === 'L9') {
      if (this.isAtPlatform(current)) return true;

      const previousStation = this.normalizeStationName(
        previous.trainCurrentStationName,
      );
      const currentStation = this.normalizeStationName(
        current.trainCurrentStationName,
      );
      return previousStation !== '' && previousStation === currentStation;
    }

    return false;
  }

  private normalizeStationName(stationName: string): string {
    return stationName.trim().toLocaleLowerCase('pt-BR');
  }

  /**
   * Parse a normalized arrival time to epoch ms.
   */
  private parseArrivalToMs(
    arrivalTime: string,
    fetchedAt: number,
  ): number | null {
    const clockTime = this.parseClockArrivalTime(arrivalTime, fetchedAt);
    if (clockTime !== null) {
      return clockTime;
    }

    const parsed = Date.parse(arrivalTime);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Parse clock arrival times in São Paulo timezone.
   */
  private parseClockArrivalTime(
    arrivalTime: string,
    fetchedAt: number,
  ): number | null {
    const match = arrivalTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);

    const now = new Date(fetchedAt);
    const spParts = this.getSaoPauloDateParts(now);
    const spDate = this.buildSaoPauloDate({
      ...spParts,
      hours,
      minutes,
    });

    // Handle midnight crossing: if the parsed time is more than 6 hours behind,
    // assume it's tomorrow
    const diff = spDate.getTime() - now.getTime();
    if (diff < -6 * 3600_000) {
      return this.buildSaoPauloDate({
        ...spParts,
        day: spParts.day + 1,
        hours,
        minutes,
      }).getTime();
    }

    return spDate.getTime();
  }

  /**
   * Group trains by direction (destination name).
   */
  private groupByDirection(
    trains: TrainSnapshot[],
  ): Map<string, TrainSnapshot[]> {
    const map = new Map<string, TrainSnapshot[]>();
    for (const train of trains) {
      const dir = train.destinationName;
      const list = map.get(dir);
      if (list) {
        list.push(train);
      } else {
        map.set(dir, [train]);
      }
    }
    return map;
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
