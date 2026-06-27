import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  ExtendedNextTrainLineCode,
  getHeadwayBucket,
  getStationName,
  isApi1RailLine,
  NextTrainLineCode,
  RailStatusCode,
} from '@metro/shared/utils';
import {
  NextTrainArrivalDto,
  NextTrainFetchResult,
} from '../dto/next-train.dto';
import { RailRealtimeSourcePort } from '@metro/rail-integration-contracts';
import { RailService } from '../../rail/rail.service';

export type LineCode = ExtendedNextTrainLineCode;

type PollBucket = 'line8Line9' | 'line4' | 'extended';
type OffHoursOperationState = 'operating' | 'nonOperating' | 'unknown';

export interface StationCacheEntry {
  lineCode: LineCode;
  stationCode: string;
  stationName: string;
  trains: NextTrainArrivalDto[];
  hash: string;
  fetchedAt: number;
  /** True if the last fetch returned an upstream error */
  hasError: boolean;
  /** True when operation is closed and no station arrival data remains relevant */
  operationClosed: boolean;
}

export interface StationDelta {
  lineCode: LineCode;
  stationCode: string;
  trains: NextTrainArrivalDto[];
  timestamp: number;
  /** True if the upstream source returned an error */
  hasError: boolean;
  /** True when operation is closed and no station arrival data remains relevant */
  operationClosed: boolean;
}

type PollCompleteListener = (deltas: StationDelta[]) => void;

const POLL_INTERVALS: Record<PollBucket, { normal: number; error: number }> = {
  line8Line9: {
    normal: 30000,
    error: 60000,
  },
  line4: {
    normal: 30000,
    error: 60000,
  },
  extended: {
    normal: 30000,
    error: 60000,
  },
};

const OFF_HOURS_STATUS_RECHECK_INTERVAL = 300_000;
const OFF_HOURS_START_MINUTES = 0;
const OFF_HOURS_END_MINUTES = 4 * 60;
const OFF_HOURS_REMAINING_TRAINS_TOLERANCE_MINUTES = 60;

const NON_OPERATING_STATUS_CODES = new Set<RailStatusCode>([
  'OperacaoEncerrada',
  'Paralisada',
]);

@Injectable()
export class NextTrainPollingService implements OnModuleDestroy {
  private readonly logger = new Logger(NextTrainPollingService.name);

  private readonly subscriptions = new Map<string, Set<string>>();
  private readonly cache = new Map<string, StationCacheEntry>();

  private readonly timers = new Map<
    PollBucket,
    ReturnType<typeof setInterval>
  >();
  private readonly isPolling = new Map<PollBucket, boolean>();
  private readonly intervals = new Map<PollBucket, number>(
    Object.entries(POLL_INTERVALS).map(([bucket, intervals]) => [
      bucket as PollBucket,
      intervals.normal,
    ]),
  );

  private readonly pollCompleteListeners: Set<PollCompleteListener> = new Set();
  private readonly immediatePolls = new Map<string, Promise<void>>();

  private readonly lineOperationChecks = new Map<
    LineCode,
    { checkedAt: number; state: OffHoursOperationState }
  >();

  constructor(
    private readonly externalRailProvider: RailRealtimeSourcePort,
    private readonly railService: RailService,
  ) {}

  onModuleDestroy(): void {
    this.stopAllPolling();
  }

  subscribe(
    clientId: string,
    lineCode: LineCode,
    stationCode: string,
  ): StationCacheEntry | null {
    const key = this.makeKey(lineCode, stationCode);
    const bucket = this.getPollBucket(lineCode);
    const bucketAlreadyPolling = this.timers.has(bucket);

    let clients = this.subscriptions.get(key);
    if (!clients) {
      clients = new Set();
      this.subscriptions.set(key, clients);
    }
    clients.add(clientId);

    this.logger.debug(
      `Client ${clientId} subscribed to ${key} (${clients.size} subscriber(s))`,
    );

    this.ensurePolling(lineCode);

    const cached = this.cache.get(key) ?? null;
    if (!cached && bucketAlreadyPolling) {
      void this.pollKeyImmediately(key);
    }

    return cached;
  }

  unsubscribe(clientId: string, lineCode: LineCode, stationCode: string): void {
    const key = this.makeKey(lineCode, stationCode);
    const clients = this.subscriptions.get(key);

    if (clients) {
      clients.delete(clientId);
      this.logger.debug(
        `Client ${clientId} unsubscribed from ${key} (${clients.size} subscriber(s) remaining)`,
      );

      if (clients.size === 0) {
        this.subscriptions.delete(key);
        this.cache.delete(key);
      }
    }

    this.cleanupPolling();
  }

  unsubscribeAll(clientId: string): void {
    for (const [key, clients] of this.subscriptions) {
      if (clients.has(clientId)) {
        clients.delete(clientId);
        this.logger.debug(
          `Client ${clientId} unsubscribed from ${key} (${clients.size} subscriber(s) remaining)`,
        );

        if (clients.size === 0) {
          this.subscriptions.delete(key);
          this.cache.delete(key);
        }
      }
    }

    this.cleanupPolling();
  }

  getCached(lineCode: LineCode, stationCode: string): StationCacheEntry | null {
    return this.cache.get(this.makeKey(lineCode, stationCode)) ?? null;
  }

  onPollComplete(listener: PollCompleteListener): void {
    this.pollCompleteListeners.add(listener);
  }

  offPollComplete(listener: PollCompleteListener): void {
    this.pollCompleteListeners.delete(listener);
  }

  getSubscribers(lineCode: LineCode, stationCode: string): Set<string> {
    return (
      this.subscriptions.get(this.makeKey(lineCode, stationCode)) ?? new Set()
    );
  }

  private makeKey(lineCode: LineCode, stationCode: string): string {
    return `${lineCode}:${stationCode}`;
  }

  private parseKey(key: string): { lineCode: LineCode; stationCode: string } {
    const [lineCode, stationCode] = key.split(':') as [LineCode, string];
    return { lineCode, stationCode };
  }

  private getPollBucket(lineCode: LineCode): PollBucket {
    if (lineCode === 'L4') return 'line4';
    if (isApi1RailLine(lineCode)) return 'extended';
    return 'line8Line9';
  }

  private getKeysByBucket(bucket: PollBucket): string[] {
    return Array.from(this.subscriptions.keys()).filter(
      (key) => this.getPollBucket(this.parseKey(key).lineCode) === bucket,
    );
  }

  private ensurePolling(lineCode: LineCode): void {
    const bucket = this.getPollBucket(lineCode);
    if (this.timers.has(bucket)) return;

    const keys = this.getKeysByBucket(bucket);
    if (keys.length === 0) return;

    const interval =
      this.intervals.get(bucket) ?? POLL_INTERVALS[bucket].normal;
    this.logger.debug(
      `Starting ${bucket} polling (${interval / 1000}s interval)`,
    );
    this.timers.set(
      bucket,
      setInterval(() => void this.pollBucket(bucket), interval),
    );

    void this.pollBucket(bucket);
  }

  private stopAllPolling(): void {
    for (const bucket of this.timers.keys()) {
      this.stopPolling(bucket);
    }
  }

  private stopPolling(bucket: PollBucket): void {
    const timer = this.timers.get(bucket);
    if (!timer) return;

    clearInterval(timer);
    this.timers.delete(bucket);
    this.logger.debug(`Stopped ${bucket} polling`);
  }

  private adjustInterval(bucket: PollBucket, hasErrors: boolean): void {
    const newInterval = hasErrors
      ? POLL_INTERVALS[bucket].error
      : POLL_INTERVALS[bucket].normal;
    const currentInterval =
      this.intervals.get(bucket) ?? POLL_INTERVALS[bucket].normal;

    if (newInterval !== currentInterval) {
      this.intervals.set(bucket, newInterval);
      this.logger.warn(
        `Adjusted ${bucket} polling interval to ${newInterval / 1000}s (errors: ${hasErrors})`,
      );

      const timer = this.timers.get(bucket);
      if (timer) {
        clearInterval(timer);
        this.timers.set(
          bucket,
          setInterval(() => void this.pollBucket(bucket), newInterval),
        );
      }
    }
  }

  private cleanupPolling(): void {
    for (const bucket of Object.keys(POLL_INTERVALS) as PollBucket[]) {
      if (this.getKeysByBucket(bucket).length === 0) {
        this.stopPolling(bucket);
      }
    }

    if (this.subscriptions.size === 0) {
      this.cache.clear();
    }
  }

  private async fetchTrains(
    lineCode: LineCode,
    stationCode: string,
  ): Promise<NextTrainFetchResult> {
    return this.externalRailProvider.fetchNextTrains(lineCode, stationCode);
  }

  private async pollBucket(bucket: PollBucket): Promise<void> {
    if (this.isPolling.get(bucket)) return;

    const keys = this.getKeysByBucket(bucket);
    if (keys.length === 0) return;

    this.isPolling.set(bucket, true);
    await this.pollKeys(keys, (hasErrors) =>
      this.adjustInterval(bucket, hasErrors),
    );
    this.isPolling.set(bucket, false);
  }

  private async pollKeyImmediately(key: string): Promise<void> {
    const existingPoll = this.immediatePolls.get(key);
    if (existingPoll) {
      await existingPoll;
      return;
    }

    const pollPromise = (async () => {
      try {
        const result = await this.fetchAndCacheKey(key, Date.now());
        if (result.delta) {
          this.notifyPollComplete([result.delta]);
        }
      } catch (error) {
        this.logger.error(
          `Error during immediate station poll for ${key}`,
          error,
        );
      } finally {
        this.immediatePolls.delete(key);
      }
    })();

    this.immediatePolls.set(key, pollPromise);
    await pollPromise;
  }

  private async pollKeys(
    keys: string[],
    adjustInterval: (hasErrors: boolean) => void,
  ): Promise<void> {
    const timestamp = Date.now();

    try {
      const results = await Promise.all(
        keys.map((key) => this.fetchAndCacheKey(key, timestamp)),
      );

      const deltas = results.flatMap((result) =>
        result.delta ? [result.delta] : [],
      );
      const anyError = results.some((result) => result.hasError);

      adjustInterval(anyError);

      if (deltas.length > 0) {
        this.notifyPollComplete(deltas);
      }
    } catch (error) {
      this.logger.error('Error during next train polling', error);
    }
  }

  private async fetchAndCacheKey(
    key: string,
    timestamp: number,
  ): Promise<{ delta: StationDelta | null; hasError: boolean }> {
    const { lineCode, stationCode } = this.parseKey(key);
    const cached = this.cache.get(key);
    const operationClosed = await this.shouldCloseOperation(
      lineCode,
      cached,
      timestamp,
    );
    const { trains, isApiError } = operationClosed
      ? { trains: [], isApiError: false }
      : await this.fetchTrains(lineCode, stationCode);
    const newHash = this.computeHash(trains, isApiError, operationClosed);

    const stationName =
      (await this.externalRailProvider.getStationName(lineCode, stationCode)) ??
      (!isApi1RailLine(lineCode)
        ? getStationName(lineCode as NextTrainLineCode, stationCode)
        : undefined) ??
      stationCode;

    const entry: StationCacheEntry = {
      lineCode,
      stationCode,
      stationName,
      trains,
      hash: newHash,
      fetchedAt: timestamp,
      hasError: isApiError,
      operationClosed,
    };
    this.cache.set(key, entry);

    const errorStateChanged = cached?.hasError !== isApiError;
    const operationStateChanged = cached?.operationClosed !== operationClosed;
    if (
      !cached ||
      cached.hash !== newHash ||
      errorStateChanged ||
      operationStateChanged
    ) {
      return {
        delta: {
          lineCode,
          stationCode,
          trains,
          timestamp,
          hasError: isApiError,
          operationClosed,
        },
        hasError: isApiError,
      };
    }

    return { delta: null, hasError: isApiError };
  }

  private notifyPollComplete(deltas: StationDelta[]): void {
    this.logger.debug(`Broadcasting ${deltas.length} delta update(s)`);
    for (const listener of this.pollCompleteListeners) {
      try {
        listener(deltas);
      } catch (error) {
        this.logger.error('Error in poll complete listener', error);
      }
    }
  }

  private computeHash(
    trains: NextTrainArrivalDto[],
    hasError: boolean,
    operationClosed: boolean,
  ): string {
    const sorted = [...trains].sort((a, b) => {
      const destCompare = a.destinationCode.localeCompare(b.destinationCode);
      if (destCompare !== 0) return destCompare;
      return a.arrivalTime.localeCompare(b.arrivalTime);
    });

    const data = {
      hasError,
      operationClosed,
      trains: sorted.map((t) => ({
        dest: t.destinationCode,
        curr: t.trainCurrentStationName,
        time: t.arrivalTime,
        plat: t.isAtPlatform,
        cars: t.cars,
      })),
    };

    return createHash('md5').update(JSON.stringify(data)).digest('hex');
  }

  private async shouldCloseOperation(
    lineCode: LineCode,
    cached: StationCacheEntry | null | undefined,
    timestamp: number,
  ): Promise<boolean> {
    if (getHeadwayBucket(timestamp) !== 'off_hours') {
      return false;
    }

    if (!this.isOffHoursSuppressionWindow(timestamp)) {
      return false;
    }

    if ((cached?.trains.length ?? 0) > 0) {
      return false;
    }

    const operationState = await this.getLineOperationState(
      lineCode,
      timestamp,
    );

    return operationState !== 'operating';
  }

  private async getLineOperationState(
    lineCode: LineCode,
    timestamp: number,
  ): Promise<OffHoursOperationState> {
    const cachedCheck = this.lineOperationChecks.get(lineCode);
    if (
      cachedCheck &&
      timestamp - cachedCheck.checkedAt < OFF_HOURS_STATUS_RECHECK_INTERVAL
    ) {
      return cachedCheck.state;
    }

    const lineNumber = this.getLineNumber(lineCode);
    if (lineNumber === null) {
      this.lineOperationChecks.set(lineCode, {
        checkedAt: timestamp,
        state: 'unknown',
      });
      return 'unknown';
    }

    try {
      const status = await this.railService.getLineStatus(lineNumber);
      const state =
        status === null
          ? 'unknown'
          : NON_OPERATING_STATUS_CODES.has(status.statusCode)
            ? 'nonOperating'
            : 'operating';

      this.lineOperationChecks.set(lineCode, {
        checkedAt: timestamp,
        state,
      });

      return state;
    } catch {
      this.lineOperationChecks.set(lineCode, {
        checkedAt: timestamp,
        state: 'unknown',
      });
      return 'unknown';
    }
  }

  private getLineNumber(lineCode: LineCode): number | null {
    const match = lineCode.match(/^L(\d+)$/);
    if (!match) return null;

    return Number(match[1]);
  }

  private isOffHoursSuppressionWindow(timestamp: number): boolean {
    const minutes = this.getSaoPauloMinutesFromMidnight(timestamp);
    return (
      minutes >=
        OFF_HOURS_START_MINUTES +
          OFF_HOURS_REMAINING_TRAINS_TOLERANCE_MINUTES &&
      minutes <
        OFF_HOURS_END_MINUTES -
          OFF_HOURS_REMAINING_TRAINS_TOLERANCE_MINUTES
    );
  }

  private getSaoPauloMinutesFromMidnight(timestamp: number): number {
    const date = new Date(timestamp);
    const saoPauloTime = new Date(
      date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }),
    );
    return saoPauloTime.getHours() * 60 + saoPauloTime.getMinutes();
  }
}
