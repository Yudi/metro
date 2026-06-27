import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HeadwayTrackingService } from './headway-tracking.service';
import { CptmHeadwayTrackingService } from './cptm-headway-tracking.service';
import { NextTrainPollingService } from './next-train-polling.service';
import { RailRealtimeSourcePort } from '@metro/rail-integration-contracts';
import {
  ExtendedNextTrainLineCode,
  getStationCodes,
  isActualCptmLine,
  ActualCptmLineCode,
  HEADWAY_DEFAULT_ENABLED_LINES,
  getHeadwayBucket,
  type RailStatusCode,
} from '@metro/shared/utils';
import { RailService } from '../../rail/rail.service';
import { HistoricalService } from '../../historical/historical.service';

/**
 * Polling intervals for headway-only polling (proactive, per station).
 * These are more conservative than user-triggered polling to avoid
 * overloading upstream sources.
 */
type HeadwayProvider = 'line8Line9' | 'line4' | 'extended';

const HEADWAY_POLL_INTERVALS: Record<HeadwayProvider, number> = {
  line8Line9: 30_000,
  line4: 60_000,
  extended: 45_000,
};

/**
 * Delay after a CPTM background request completes before dispatching the next.
 * The rail integration service applies the actual 10-15s upstream gate, so keeping one
 * request in flight reaches sustainable capacity without building a backlog.
 */
const CPTM_BACKGROUND_DISPATCH_DELAY = 1_000;

/** Add interval jitter to avoid robotic fixed cadence patterns */
const HEADWAY_POLL_JITTER_RATIO = 0.25; // ±25%

/** Don't schedule overly aggressive ticks when station count is low */
const MIN_POLL_TICK_INTERVAL = 2_000;

/** Reduce startup burst by warming only a subset of stations first */
const WARMUP_MAX_STATIONS = 3;
const WARMUP_OFF_HOURS_MAX_STATIONS = 1;

/** Stagger delay between stations to spread upstream load */
const STATION_STAGGER_MS = 500;

/** How often to recheck a non-operating line during off-hours (00:00-04:00) */
const OFF_HOURS_STATUS_RECHECK_INTERVAL = 300_000; // 5 minutes
const OFF_HOURS_START_MINUTES = 0;
const OFF_HOURS_END_MINUTES = 4 * 60;
const OFF_HOURS_REMAINING_TRAINS_TOLERANCE_MINUTES = 60;

/** Minimum interval between polls for a single station during normal hours */
const NORMAL_HOURS_POLL_INTERVAL = 20_000; // 20 seconds

const NON_OPERATING_STATUS_CODES = new Set<RailStatusCode>([
  'OperacaoEncerrada',
  'Paralisada',
]);

/** How often to run the prune job (12 hours) */
const PRUNE_INTERVAL = 12 * 60 * 60 * 1000;

/**
 * Proactive polling service for headway calculation.
 *
 * Polls stations on enabled lines at a fair rate to collect passage data.
 * CPTM lines share one work-conserving global round-robin because their
 * upstream provider has a strict global request interval.
 *
 * Integrates with the existing NextTrainPollingService: if a station is already
 * being polled for a live user, the headway service hooks into those poll results
 * instead of double-polling.
 */
@Injectable()
export class HeadwayPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeadwayPollingService.name);

  private readonly enabledLines: ExtendedNextTrainLineCode[];
  private readonly pollingTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly activePollers = new Set<string>();
  private readonly cptmPollingStations: Array<{
    lineCode: ActualCptmLineCode;
    stationCode: string;
  }> = [];
  private cptmPollingIndex = 0;
  private isRunning = false;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  /** Per-station last poll timestamp used to avoid rapid repolls */
  private readonly lastPollTimes = new Map<string, number>();
  private readonly lineOperationChecks = new Map<
    ExtendedNextTrainLineCode,
    { checkedAt: number; statusCode: RailStatusCode | null }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly externalRailProvider: RailRealtimeSourcePort,
    private readonly headwayTracking: HeadwayTrackingService,
    private readonly cptmHeadwayTracking: CptmHeadwayTrackingService,
    private readonly nextTrainPolling: NextTrainPollingService,
    private readonly railService: RailService,
    @Optional()
    private readonly historicalService?: HistoricalService,
  ) {
    // Parse enabled lines from config, falling back to defaults
    const configLines = this.configService.get<string>('HEADWAY_ENABLED_LINES');
    if (configLines) {
      this.enabledLines = configLines
        .split(',')
        .map((l) => l.trim())
        .filter((l): l is ExtendedNextTrainLineCode =>
          HEADWAY_DEFAULT_ENABLED_LINES.includes(
            l as ExtendedNextTrainLineCode,
          ),
        );
    } else {
      this.enabledLines = [...HEADWAY_DEFAULT_ENABLED_LINES];
    }
  }

  async onModuleInit(): Promise<void> {
    const pollingEnabled = this.configService.get<string>(
      'HEADWAY_POLLING_ENABLED',
      'true',
    );
    if (pollingEnabled.toLowerCase() === 'false') {
      this.logger.log(
        'Headway polling disabled via HEADWAY_POLLING_ENABLED=false',
      );
      return;
    }

    if (this.enabledLines.length === 0) {
      this.logger.log('Headway polling disabled (no enabled lines)');
      return;
    }

    this.logger.log(
      `Starting headway polling for lines: ${this.enabledLines.join(', ')}`,
    );

    // Hook into existing next-train polling to reuse data.
    // For L4/L8/L9: feed formatted trains to snapshot-based tracking.
    // For CPTM (L10-L13): read sanitized headway observations from the
    //   integration source and feed individual-train tracking.
    this.nextTrainPolling.onPollComplete((deltas) => {
      for (const delta of deltas) {
        if (delta.hasError) continue;

        this.lastPollTimes.set(
          `${delta.lineCode}:${delta.stationCode}`,
          delta.timestamp,
        );

        if (isActualCptmLine(delta.lineCode)) {
          void this.processCptmDelta(
            delta.lineCode as ActualCptmLineCode,
            delta.stationCode,
            delta.timestamp,
          );
        } else {
          void this.headwayTracking.processPollResult(
            delta.lineCode,
            delta.stationCode,
            delta.trains,
            delta.timestamp,
          );
        }
      }
    });

    // Start proactive polling after a short delay to let other services init
    setTimeout(() => void this.startProactivePolling(), 5000);

    // Setup periodic passage pruning
    this.pruneTimer = setInterval(() => {
      void this.headwayTracking.pruneOldPassages(24);
    }, PRUNE_INTERVAL);
  }

  onModuleDestroy(): void {
    this.stopAllPolling();
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
    }
  }

  /**
   * Start proactive polling for all stations on enabled lines.
   * Staggers requests to avoid burst traffic.
   */
  private async startProactivePolling(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    for (const lineCode of this.enabledLines) {
      try {
        await this.startLinePolling(lineCode);
      } catch (error) {
        this.logger.error(
          `Failed to start headway polling for ${lineCode}: ${error}`,
        );
      }
    }
  }

  private async startLinePolling(
    lineCode: ExtendedNextTrainLineCode,
  ): Promise<void> {
    if (isActualCptmLine(lineCode)) {
      await this.registerCptmLinePolling(lineCode as ActualCptmLineCode);
      return;
    }

    const stationCodes = await this.getStationCodes(lineCode);
    if (stationCodes.length === 0) {
      this.logger.warn(`No stations found for ${lineCode}, skipping`);
      return;
    }

    const provider = this.getProvider(lineCode);
    const interval = HEADWAY_POLL_INTERVALS[provider];
    const shuffledStations = this.shuffleStations(stationCodes);
    const pollsPerInterval = Math.min(shuffledStations.length, 5);
    const baseTickInterval = Math.max(
      MIN_POLL_TICK_INTERVAL,
      Math.floor(interval / pollsPerInterval),
    );

    const timerKey = `headway:${lineCode}`;
    if (this.activePollers.has(timerKey)) return;
    this.activePollers.add(timerKey);

    this.logger.log(
      `Headway polling ${lineCode}: ${shuffledStations.length} stations, ~${Math.round(baseTickInterval / 1000)}s tick (±${Math.round(HEADWAY_POLL_JITTER_RATIO * 100)}% jitter)`,
    );

    // Create a round-robin poller that cycles through stations with jitter
    const stationIndex = {
      value: Math.floor(Math.random() * shuffledStations.length),
    };
    this.scheduleNextLinePoll(
      timerKey,
      lineCode,
      shuffledStations,
      baseTickInterval,
      stationIndex,
    );

    // Warm up a subset of stations to avoid startup burst requests
    const warmupLimit =
      getHeadwayBucket() === 'off_hours'
        ? WARMUP_OFF_HOURS_MAX_STATIONS
        : WARMUP_MAX_STATIONS;
    const warmupCount = Math.min(shuffledStations.length, warmupLimit);

    for (let i = 0; i < warmupCount; i++) {
      const stationCode =
        shuffledStations[(stationIndex.value + i) % shuffledStations.length];
      const warmupDelay =
        i * STATION_STAGGER_MS +
        this.getStartupJitterOffset(STATION_STAGGER_MS);
      const warmupKey = `${timerKey}:warmup:${i}`;
      const warmupTimer = setTimeout(() => {
        if (!this.isRunning || !this.activePollers.has(timerKey)) return;

        // Reuse user-facing polling data when available
        if (this.nextTrainPolling.getCached(lineCode, stationCode)) {
          return;
        }

        void this.pollStation(lineCode, stationCode);
      }, warmupDelay);

      this.pollingTimers.set(warmupKey, warmupTimer);
    }
  }

  private async registerCptmLinePolling(
    lineCode: ActualCptmLineCode,
  ): Promise<void> {
    const stationCodes = await this.getStationCodes(lineCode);
    if (stationCodes.length === 0) {
      this.logger.warn(`No stations found for ${lineCode}, skipping`);
      return;
    }

    const existingKeys = new Set(
      this.cptmPollingStations.map(
        (station) => `${station.lineCode}:${station.stationCode}`,
      ),
    );
    for (const stationCode of this.shuffleStations(stationCodes)) {
      const key = `${lineCode}:${stationCode}`;
      if (!existingKeys.has(key)) {
        this.cptmPollingStations.push({ lineCode, stationCode });
        existingKeys.add(key);
      }
    }
    this.shuffleCptmPollingStations();

    this.logger.log(
      `Headway polling ${lineCode}: registered ${stationCodes.length} stations in shared CPTM round-robin`,
    );
    this.ensureCptmPolling();
  }

  private ensureCptmPolling(): void {
    const timerKey = 'headway:cptm-global';
    if (this.activePollers.has(timerKey)) return;

    this.activePollers.add(timerKey);
    this.scheduleNextCptmPoll(timerKey);
  }

  private scheduleNextCptmPoll(timerKey: string): void {
    if (!this.isRunning || !this.activePollers.has(timerKey)) return;

    const timer = setTimeout(async () => {
      if (!this.isRunning || !this.activePollers.has(timerKey)) return;

      const station =
        this.cptmPollingStations[
          this.cptmPollingIndex % this.cptmPollingStations.length
        ];
      this.cptmPollingIndex++;

      if (
        station &&
        !this.nextTrainPolling.getCached(station.lineCode, station.stationCode)
      ) {
        await this.pollStation(station.lineCode, station.stationCode);
      }

      this.scheduleNextCptmPoll(timerKey);
    }, CPTM_BACKGROUND_DISPATCH_DELAY);

    this.pollingTimers.set(timerKey, timer);
  }

  private shuffleCptmPollingStations(): void {
    for (let i = this.cptmPollingStations.length - 1; i > 0; i--) {
      const randomIndex = Math.floor(Math.random() * (i + 1));
      const current = this.cptmPollingStations[i];
      this.cptmPollingStations[i] = this.cptmPollingStations[randomIndex];
      this.cptmPollingStations[randomIndex] = current;
    }
  }

  private scheduleNextLinePoll(
    timerKey: string,
    lineCode: ExtendedNextTrainLineCode,
    stationCodes: string[],
    baseTickInterval: number,
    stationIndex: { value: number },
  ): void {
    if (!this.isRunning || !this.activePollers.has(timerKey)) return;

    const delay = this.getJitteredInterval(baseTickInterval);
    const timer = setTimeout(async () => {
      if (!this.isRunning || !this.activePollers.has(timerKey)) return;

      const stationCode =
        stationCodes[stationIndex.value % stationCodes.length];
      stationIndex.value++;

      // Reuse user-facing polling data when available
      if (!this.nextTrainPolling.getCached(lineCode, stationCode)) {
        await this.pollStation(lineCode, stationCode);
      }

      this.scheduleNextLinePoll(
        timerKey,
        lineCode,
        stationCodes,
        baseTickInterval,
        stationIndex,
      );
    }, delay);

    this.pollingTimers.set(timerKey, timer);
  }

  private getJitteredInterval(baseInterval: number): number {
    const jitterRange = Math.max(
      1,
      Math.floor(baseInterval * HEADWAY_POLL_JITTER_RATIO),
    );
    const minInterval = Math.max(
      MIN_POLL_TICK_INTERVAL,
      baseInterval - jitterRange,
    );
    const maxInterval = baseInterval + jitterRange;

    return (
      minInterval + Math.floor(Math.random() * (maxInterval - minInterval + 1))
    );
  }

  private getStartupJitterOffset(baseDelay: number): number {
    const jitterRange = Math.max(
      1,
      Math.floor(baseDelay * HEADWAY_POLL_JITTER_RATIO),
    );
    return Math.floor(Math.random() * (jitterRange + 1));
  }

  private shuffleStations(stationCodes: string[]): string[] {
    const shuffled = [...stationCodes];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const randomIndex = Math.floor(Math.random() * (i + 1));
      const current = shuffled[i];
      shuffled[i] = shuffled[randomIndex];
      shuffled[randomIndex] = current;
    }
    return shuffled;
  }

  /**
   * Process a CPTM delta from user-facing polling.
   * Reads sanitized headway observations and feeds them to tracking.
   */
  private async processCptmDelta(
    lineCode: ActualCptmLineCode,
    stationCode: string,
    timestamp: number,
  ): Promise<void> {
    // Mark as recently polled to avoid duplicate work from proactive polling
    this.lastPollTimes.set(`${lineCode}:${stationCode}`, timestamp);
    try {
      const observations =
        await this.externalRailProvider.fetchHeadwayObservations(
          lineCode,
          stationCode,
        );
      await this.cptmHeadwayTracking.processObservations(
        lineCode,
        stationCode,
        observations,
        timestamp,
      );
    } catch {
      await this.recordHeadwayPollError(lineCode, stationCode, {
        reason: 'cptm_delta_processing_failed',
        observedAt: new Date(timestamp),
      });
    }
  }

  /**
   * Poll a single station and feed results to headway tracking.
   * During off-hours, skips lines whose status indicates no train data will be
   * available.
   */
  private async pollStation(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ): Promise<void> {
    const key = `${lineCode}:${stationCode}`;
    const now = Date.now();
    const last = this.lastPollTimes.get(key);

    if (last && now - last < NORMAL_HOURS_POLL_INTERVAL) {
      return;
    }

    if (
      getHeadwayBucket(now) === 'off_hours' &&
      (await this.shouldSkipOffHoursPolling(lineCode, now))
    ) {
      return;
    }

    this.lastPollTimes.set(key, now);
    try {
      // CPTM lines: fetch sanitized observations and use individual-train tracking
      if (isActualCptmLine(lineCode)) {
        const observations =
          await this.externalRailProvider.fetchHeadwayObservations(
            lineCode as ActualCptmLineCode,
            stationCode,
          );
        await this.cptmHeadwayTracking.processObservations(
          lineCode as ActualCptmLineCode,
          stationCode,
          observations,
          now,
        );
        return;
      }

      const result = await this.fetchTrains(lineCode, stationCode);

      if (result.success && !result.isApiError) {
        await this.headwayTracking.processPollResult(
          lineCode,
          stationCode,
          result.trains,
          now,
        );
        return;
      }

      await this.recordHeadwayPollError(lineCode, stationCode, {
        reason: result.isApiError
          ? 'upstream_api_error'
          : 'upstream_unsuccessful',
        observedAt: new Date(now),
      });
    } catch {
      await this.recordHeadwayPollError(lineCode, stationCode, {
        reason: 'station_poll_failed',
        observedAt: new Date(now),
      });
    }
  }

  private async recordHeadwayPollError(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
    params: {
      reason: string;
      observedAt: Date;
    },
  ): Promise<void> {
    await this.historicalService?.recordHeadwayError({
      lineCode,
      stationCode,
      source: 'headway_polling',
      observedAt: params.observedAt,
      reason: params.reason,
    });
  }

  private async shouldSkipOffHoursPolling(
    lineCode: ExtendedNextTrainLineCode,
    now: number,
  ): Promise<boolean> {
    const statusCode = await this.getLineOperationStatusCode(lineCode, now);

    if (statusCode === 'Paralisada') {
      return true;
    }

    if (statusCode !== 'OperacaoEncerrada') {
      return false;
    }

    return this.isOffHoursSuppressionWindow(now);
  }

  private async getLineOperationStatusCode(
    lineCode: ExtendedNextTrainLineCode,
    now: number,
  ): Promise<RailStatusCode | null> {
    const cachedCheck = this.lineOperationChecks.get(lineCode);
    if (
      cachedCheck &&
      now - cachedCheck.checkedAt < OFF_HOURS_STATUS_RECHECK_INTERVAL
    ) {
      return cachedCheck.statusCode;
    }

    try {
      const lineNumber = Number(lineCode.slice(1));
      const status = await this.railService.getLineStatus(lineNumber);
      const statusCode =
        status !== null && NON_OPERATING_STATUS_CODES.has(status.statusCode)
          ? status.statusCode
          : null;

      this.lineOperationChecks.set(lineCode, { checkedAt: now, statusCode });

      return statusCode;
    } catch {
      this.lineOperationChecks.set(lineCode, {
        checkedAt: now,
        statusCode: null,
      });
      return null;
    }
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

  private async fetchTrains(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ) {
    return this.externalRailProvider.fetchNextTrains(lineCode, stationCode);
  }

  private async getStationCodes(
    lineCode: ExtendedNextTrainLineCode,
  ): Promise<string[]> {
    if (isActualCptmLine(lineCode)) {
      return this.externalRailProvider.getStationCodes(
        lineCode as ActualCptmLineCode,
      );
    }
    return getStationCodes(lineCode as 'L4' | 'L8' | 'L9');
  }

  private getProvider(lineCode: ExtendedNextTrainLineCode): HeadwayProvider {
    if (lineCode === 'L4') return 'line4';
    if (isActualCptmLine(lineCode)) return 'extended';
    return 'line8Line9';
  }

  private stopAllPolling(): void {
    this.activePollers.clear();
    for (const [, timer] of this.pollingTimers) {
      clearTimeout(timer);
    }
    this.pollingTimers.clear();
    this.isRunning = false;
  }
}
