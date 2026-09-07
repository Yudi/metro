import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  StationHeadway,
  HeadwayBucketId,
  HEADWAY_BUCKETS,
  HEADWAY_MIN_SAMPLES,
  HEADWAY_MAX_SAMPLES,
  getHeadwayBucket,
  getHeadwayBucketFallbackOrder,
} from '@metro/shared/utils';

const REDIS_KEY_PREFIX = 'headway';
/** Headway result cache (calculated averages) - 5 minutes */
const REDIS_HEADWAY_TTL = 5 * 60;
/** Passage timestamps stored per direction - 6 hours (covers any full bucket) */
const REDIS_PASSAGES_TTL = 6 * 60 * 60;
/** CPTM tracked trains per station - 10 minutes (matches stale train cleanup) */
const REDIS_CPTM_TRACKING_TTL = 10 * 60;
/** CPTM last passage per direction - 2 minutes */
const REDIS_CPTM_LAST_PASSAGE_TTL = 2 * 60;
/** Active historical bucket per station - long enough to survive restarts */
const REDIS_HISTORY_BUCKET_TTL = 48 * 60 * 60;

/**
 * Serializable tracked train state for Redis storage.
 */
export interface SerializedTrackedTrain {
  prefix: string;
  direction: string;
  prediction: number;
  lastSeenAt: number;
  firstSeenAt: number;
  passageRecorded: boolean;
}

export interface SerializedTrackingState {
  trains: Record<string, SerializedTrackedTrain>;
  lastPollAt: number;
}

/**
 * Redis cache for headway data.
 * Stores passage timestamps and calculated headways in Redis for fast access.
 * Falls back gracefully if Redis is unavailable.
 */
@Injectable()
export class HeadwayCacheService {
  private readonly logger = new Logger(HeadwayCacheService.name);
  private redis: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });
      await this.redis.connect();
      this.logger.debug('Connected to Redis for headway cache');
    } catch {
      this.logger.warn(
        'Redis connection failed for headway cache, using DB only',
      );
      this.redis = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  /**
   * Record a passage timestamp for a station direction in Redis.
   * Keeps the list trimmed to HEADWAY_MAX_SAMPLES.
   */
  async recordPassage(
    lineCode: string,
    stationCode: string,
    direction: string,
    timestamp: number,
  ): Promise<void> {
    if (!this.redis) return;

    const key = `${REDIS_KEY_PREFIX}:passages:${lineCode}:${stationCode}:${direction}`;
    try {
      await this.redis.lpush(key, timestamp.toString());
      await this.redis.ltrim(key, 0, HEADWAY_MAX_SAMPLES - 1);
      await this.redis.expire(key, REDIS_PASSAGES_TTL);
    } catch {
      this.logger.warn(`Failed to record passage in Redis for ${key}`);
    }
  }

  /**
   * Get recent passage timestamps for a station direction from Redis.
   */
  async getPassages(
    lineCode: string,
    stationCode: string,
    direction: string,
  ): Promise<number[]> {
    if (!this.redis) return [];

    const key = `${REDIS_KEY_PREFIX}:passages:${lineCode}:${stationCode}:${direction}`;
    try {
      const values = await this.redis.lrange(key, 0, HEADWAY_MAX_SAMPLES - 1);
      return values.map(Number).filter((n) => !isNaN(n));
    } catch {
      return [];
    }
  }

  /**
   * Cache calculated headway result for a station + bucket.
   */
  async cacheHeadway(
    headway: StationHeadway,
    bucket: HeadwayBucketId,
  ): Promise<void> {
    if (!this.redis) return;

    const key = `${REDIS_KEY_PREFIX}:result:${headway.lineCode}:${headway.stationCode}:${bucket}`;
    try {
      await this.redis.setex(key, REDIS_HEADWAY_TTL, JSON.stringify(headway));
    } catch {
      this.logger.warn(`Failed to cache headway for ${key}`);
    }
  }

  /**
   * Invalidate cached headway for a station + bucket.
   * Forces recalculation on next read.
   */
  async invalidateHeadway(
    lineCode: string,
    stationCode: string,
    bucket: HeadwayBucketId,
  ): Promise<void> {
    if (!this.redis) return;

    const key = `${REDIS_KEY_PREFIX}:result:${lineCode}:${stationCode}:${bucket}`;
    try {
      await this.redis.del(key);
    } catch {
      // ignore
    }
  }

  /**
   * Get cached headway result for a station + bucket.
   */
  async getCachedHeadway(
    lineCode: string,
    stationCode: string,
    bucket: HeadwayBucketId,
  ): Promise<StationHeadway | null> {
    if (!this.redis) return null;

    const key = `${REDIS_KEY_PREFIX}:result:${lineCode}:${stationCode}:${bucket}`;
    try {
      const data = await this.redis.get(key);
      return data ? (JSON.parse(data) as StationHeadway) : null;
    } catch {
      return null;
    }
  }

  /**
   * Calculate headway for a specific time-of-day bucket.
   *
   * Intervals are assigned to the bucket of the **departing** (later) train,
   * which correctly handles bucket-crossing intervals.
   *
   * Falls back to the most recent bucket with sufficient data when the
   * target bucket does not have enough samples yet.
   */
  calculateHeadwayForBucket(
    timestamps: number[],
    targetBucket: HeadwayBucketId,
    options: { allowFallback?: boolean } = {},
  ): {
    averageSeconds: number;
    sampleCount: number;
    bucket: HeadwayBucketId;
    isFallback: boolean;
    intervalSamplesSeconds: number[];
    discardedIntervalCount: number;
  } | null {
    if (timestamps.length < HEADWAY_MIN_SAMPLES) return null;

    const sorted = [...timestamps].sort((a, b) => b - a);

    // Group intervals by the bucket of the departing (later) train
    const intervalsByBucket = new Map<HeadwayBucketId, number[]>();
    let discardedIntervalCount = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const interval = Math.round((sorted[i] - sorted[i + 1]) / 1000);
      if (interval < 25 || interval > 3_600) {
        discardedIntervalCount++;
        continue;
      }

      const bucket = getHeadwayBucket(sorted[i]);
      const list = intervalsByBucket.get(bucket);
      if (list) {
        list.push(interval);
      } else {
        intervalsByBucket.set(bucket, [interval]);
      }
    }

    // Try target bucket first
    const targetIntervals = intervalsByBucket.get(targetBucket);
    if (targetIntervals && targetIntervals.length >= HEADWAY_MIN_SAMPLES - 1) {
      const avg =
        targetIntervals.reduce((s, v) => s + v, 0) / targetIntervals.length;
      return {
        averageSeconds: Math.round(avg),
        sampleCount: targetIntervals.length,
        bucket: targetBucket,
        isFallback: false,
        intervalSamplesSeconds: targetIntervals,
        discardedIntervalCount,
      };
    }

    if (options.allowFallback === false) {
      return null;
    }

    // Fallback: most recent bucket with sufficient data
    const fallbackOrder = getHeadwayBucketFallbackOrder(targetBucket);
    for (const fallbackBucket of fallbackOrder) {
      const intervals = intervalsByBucket.get(fallbackBucket);
      if (intervals && intervals.length >= HEADWAY_MIN_SAMPLES - 1) {
        const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
        return {
          averageSeconds: Math.round(avg),
          sampleCount: intervals.length,
          bucket: fallbackBucket,
          isFallback: true,
          intervalSamplesSeconds: intervals,
          discardedIntervalCount,
        };
      }
    }

    return null;
  }

  async getActiveHeadwayHistoryBucket(
    lineCode: string,
    stationCode: string,
  ): Promise<HeadwayBucketId | null> {
    if (!this.redis) return null;

    const key = `${REDIS_KEY_PREFIX}:history-active-bucket:${lineCode}:${stationCode}`;
    try {
      const value = await this.redis.get(key);
      if (!value) return null;

      const validBuckets = new Set(HEADWAY_BUCKETS.map((bucket) => bucket.id));
      return validBuckets.has(value as HeadwayBucketId)
        ? (value as HeadwayBucketId)
        : null;
    } catch {
      return null;
    }
  }

  async saveActiveHeadwayHistoryBucket(
    lineCode: string,
    stationCode: string,
    bucket: HeadwayBucketId,
  ): Promise<void> {
    if (!this.redis) return;

    const key = `${REDIS_KEY_PREFIX}:history-active-bucket:${lineCode}:${stationCode}`;
    try {
      await this.redis.setex(key, REDIS_HISTORY_BUCKET_TTL, bucket);
    } catch {
      this.logger.warn(
        `Failed to save active headway history bucket for ${key}`,
      );
    }
  }

  /**
   * Save the tracked-trains state for a CPTM station to Redis.
   */
  async saveCptmTrackingState(
    lineCode: string,
    stationCode: string,
    state: SerializedTrackingState,
  ): Promise<void> {
    if (!this.redis) return;
    const key = `${REDIS_KEY_PREFIX}:cptm:tracked:${lineCode}:${stationCode}`;
    try {
      await this.redis.setex(
        key,
        REDIS_CPTM_TRACKING_TTL,
        JSON.stringify(state),
      );
    } catch {
      this.logger.warn(`Failed to save CPTM tracking state for ${key}`);
    }
  }

  /**
   * Get the tracked-trains state for a CPTM station from Redis.
   */
  async getCptmTrackingState(
    lineCode: string,
    stationCode: string,
  ): Promise<SerializedTrackingState | null> {
    if (!this.redis) return null;
    const key = `${REDIS_KEY_PREFIX}:cptm:tracked:${lineCode}:${stationCode}`;
    try {
      const data = await this.redis.get(key);
      return data ? (JSON.parse(data) as SerializedTrackingState) : null;
    } catch {
      return null;
    }
  }

  /**
   * Save the last passage timestamp for a CPTM station direction.
   */
  async saveCptmLastPassage(
    lineCode: string,
    stationCode: string,
    direction: string,
    timestamp: number,
  ): Promise<void> {
    if (!this.redis) return;
    const key = `${REDIS_KEY_PREFIX}:cptm:last-passage:${lineCode}:${stationCode}:${direction}`;
    try {
      await this.redis.setex(
        key,
        REDIS_CPTM_LAST_PASSAGE_TTL,
        timestamp.toString(),
      );
    } catch {
      this.logger.warn(`Failed to save CPTM last passage for ${key}`);
    }
  }

  /**
   * Get the last passage timestamp for a CPTM station direction.
   */
  async getCptmLastPassage(
    lineCode: string,
    stationCode: string,
    direction: string,
  ): Promise<number | null> {
    if (!this.redis) return null;
    const key = `${REDIS_KEY_PREFIX}:cptm:last-passage:${lineCode}:${stationCode}:${direction}`;
    try {
      const data = await this.redis.get(key);
      if (!data) return null;
      const ts = Number(data);
      return isNaN(ts) ? null : ts;
    } catch {
      return null;
    }
  }
}
