import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { isKnownRailLineCode } from '@metro/shared/utils';
import { RailLinesStatus } from './entities/rail-line-status.entity';

const REDIS_KEY = 'rail:lines:status';
const REDIS_TTL_SECONDS = 60 * 60; // 1 hour TTL in Redis (backup cache)

@Injectable()
export class RailCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RailCacheService.name);
  private redis: Redis | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379'
    );

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });

      await this.redis.connect();
      this.logger.debug('Connected to Redis');
    } catch (error) {
      this.logger.warn(
        'Redis connection failed, using in-memory cache only',
        error
      );
      this.redis = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.debug('Redis connection closed');
    }
  }

  /**
   * Get cached status from Redis
   */
  async getFromRedis(): Promise<RailLinesStatus | null> {
    if (!this.redis) return null;

    try {
      const data = await this.redis.get(REDIS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Convert lastUpdated string back to Date
        parsed.lastUpdated = new Date(parsed.lastUpdated);
        parsed.lines = parsed.lines.filter((line: { code: number }) =>
          isKnownRailLineCode(line.code),
        );
        if (parsed.lines.length === 0) {
          return null;
        }
        this.logger.debug('Retrieved rail status from Redis cache');
        return parsed as RailLinesStatus;
      }
    } catch (error) {
      this.logger.warn('Failed to get data from Redis', error);
    }

    return null;
  }

  /**
   * Save status to Redis
   */
  async saveToRedis(status: RailLinesStatus): Promise<void> {
    if (!this.redis) return;

    const sanitizedStatus: RailLinesStatus = {
      ...status,
      lines: status.lines.filter((line) => isKnownRailLineCode(line.code)),
    };

    if (sanitizedStatus.lines.length === 0) return;

    try {
      await this.redis.setex(
        REDIS_KEY,
        REDIS_TTL_SECONDS,
        JSON.stringify(sanitizedStatus)
      );
      this.logger.debug('Saved rail status to Redis cache');
    } catch (error) {
      this.logger.warn('Failed to save data to Redis', error);
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }
}
