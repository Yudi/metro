import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RailLine, RailLinesStatus } from './entities/rail-line-status.entity';
import { RailCacheService } from './rail-cache.service';
import { RailApiService } from './rail-api.service';
import { HistoricalService } from '../historical/historical.service';

@Injectable()
export class RailService implements OnModuleInit {
  private readonly logger = new Logger(RailService.name);

  private cachedStatus: RailLinesStatus | null = null;
  private lastFetchTime: Date | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for fresh data
  private readonly STALE_TTL_MS = 10 * 60 * 1000; // 10 minutes before considering stale

  constructor(
    private readonly cacheService: RailCacheService,
    private readonly apiService: RailApiService,
    private readonly historicalService: HistoricalService,
  ) {}

  /**
   * Initial fetch on module init - try Redis first, then API
   */
  async onModuleInit(): Promise<void> {
    // Try to load from Redis first (persistent cache)
    const redisData = await this.cacheService.getFromRedis();
    if (redisData) {
      this.cachedStatus = redisData;
      this.lastFetchTime = redisData.lastUpdated;
      this.logger.debug('Loaded rail status from Redis cache');
    }

    // Fetch fresh data in background
    void this.fetchAndCacheStatus();
  }

  /**
   * Fetch status every 5 minutes to keep cache fresh
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCronFetch(): Promise<void> {
    this.logger.debug('Scheduled rail status fetch');
    await this.fetchAndCacheStatus();
  }

  /**
   * Get all rail lines status (cached)
   * Always returns data - either fresh, stale, or from Redis backup
   */
  async getLinesStatus(): Promise<RailLinesStatus> {
    // Return cached data if still fresh
    if (this.isCacheFresh() && this.cachedStatus) {
      this.logger.debug('Returning fresh cached rail status');
      return this.cachedStatus;
    }

    // If cache is stale but valid (< 10 min), return it and refresh in background
    if (this.isCacheStale() && this.cachedStatus) {
      this.logger.debug(
        'Returning stale cached data, triggering background refresh'
      );
      void this.fetchAndCacheStatus();
      return this.cachedStatus;
    }

    // No valid cache - try to fetch fresh, fall back to Redis
    return this.fetchAndCacheStatus();
  }

  /**
   * Get status for a specific line by code
   */
  async getLineStatus(code: number): Promise<RailLine | null> {
    const status = await this.getLinesStatus();
    return status.lines.find((line) => line.code === code) || null;
  }

  /**
   * Get status for multiple lines by codes
   */
  async getLineStatuses(codes: number[]): Promise<RailLine[]> {
    const status = await this.getLinesStatus();
    return status.lines.filter((line) => codes.includes(line.code));
  }

  /**
   * Check if cached data is fresh (< 1 minute)
   */
  private isCacheFresh(): boolean {
    if (!this.cachedStatus || !this.lastFetchTime) {
      return false;
    }
    const age = Date.now() - this.lastFetchTime.getTime();
    return age < this.CACHE_TTL_MS;
  }

  /**
   * Check if cached data is stale but still usable (< 10 minutes)
   */
  private isCacheStale(): boolean {
    if (!this.cachedStatus || !this.lastFetchTime) {
      return false;
    }
    const age = Date.now() - this.lastFetchTime.getTime();
    return age >= this.CACHE_TTL_MS && age < this.STALE_TTL_MS;
  }

  /**
   * Build a map of cached lines for merging
   */
  private getCachedLinesMap(): Map<number, RailLine> | undefined {
    if (!this.cachedStatus) return undefined;
    return new Map(this.cachedStatus.lines.map((l) => [l.code, l]));
  }

  /**
   * Fetch data from external APIs and cache it
    * Uses prioritized sources with progressive fallbacks
    * Merges data preferring valid statuses over "DadosIndisponiveis"
   */
  private async fetchAndCacheStatus(): Promise<RailLinesStatus> {
    try {
      this.logger.debug('Fetching rail status from external APIs');

      // Get cached lines to help resolve "DadosIndisponiveis" status
      const cachedLines = this.getCachedLinesMap();

      // Fetch from all configured APIs with intelligent merging
      const fetchResult =
        await this.apiService.fetchMergedStatusWithDiagnostics(cachedLines);
      const mergedStatus = fetchResult.status;

      // If all APIs failed, fall back to cache
      if (!mergedStatus) {
        await this.historicalService.recordRetrievalIssue({
          source: 'rail_status',
          attemptedAt: fetchResult.attemptedAt,
        });
        throw new Error('All APIs failed');
      }

      // Update cache
      this.cachedStatus = mergedStatus;
      this.lastFetchTime = new Date();
      this.logger.debug(
        `Rail status cached successfully: ${mergedStatus.lines.length} lines`
      );

      // Save to Redis for persistence across restarts
      await this.cacheService.saveToRedis(this.cachedStatus);

      await this.historicalService.recordRetrievalRecovered({
        source: 'rail_status',
        recoveredAt: mergedStatus.lastUpdated,
      });

      await this.historicalService.recordRailStatusObservations(
        mergedStatus.lines,
      );

      return this.cachedStatus;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to fetch rail status: ${errorMessage}`);

      // Return cached data if available (in-memory)
      if (this.cachedStatus) {
        this.logger.warn('Returning in-memory cached data due to API failure');
        return {
          ...this.cachedStatus,
          errorMessage: `Status atualizado pela última vez às ${this.cachedStatus.lastUpdated.toLocaleTimeString(
            'pt-BR'
          )}`,
        };
      }

      // Try Redis as last resort
      const redisData = await this.cacheService.getFromRedis();
      if (redisData) {
        this.logger.warn('Returning Redis cached data due to API failure');
        this.cachedStatus = redisData;
        this.lastFetchTime = redisData.lastUpdated;
        return {
          ...redisData,
          errorMessage: `Status atualizado pela última vez às ${redisData.lastUpdated.toLocaleTimeString(
            'pt-BR'
          )}`,
        };
      }

      // No cache available at all - return static lines with unavailable status
      this.logger.warn('No cache available, returning static fallback');
      return this.apiService.createStaticFallback();
    }
  }
}
