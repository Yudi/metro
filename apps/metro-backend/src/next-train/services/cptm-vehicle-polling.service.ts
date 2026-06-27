import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  RailRealtimeSourcePort,
  RailVehiclePosition,
} from '@metro/rail-integration-contracts';
import {
  CptmLineCode,
  CPTM_LINE_CONFIG,
  hasExternalRailVehicles,
} from '@metro/shared/utils';

/**
 * Vehicle position update for a privately sourced rail line.
 */
export interface CptmVehicleUpdate {
  lineCode: CptmLineCode;
  lineName: string;
  bgcolor: string;
  fgcolor: string;
  vehicles: RailVehiclePosition[];
  timestamp: number;
}

/**
 * Delta update for vehicle positions
 */
export interface CptmVehicleDelta {
  lineCode: CptmLineCode;
  vehicles: RailVehiclePosition[];
  timestamp: number;
}

type PollCompleteListener = (deltas: CptmVehicleDelta[]) => void;

/**
 * Polling interval for vehicle positions (30 seconds for fair use)
 */
const POLL_INTERVAL = 25000;
const ERROR_POLL_INTERVAL = 60000;

/**
 * Service to poll vehicle positions from the rail integration source.
 * Only polls for lines that have active subscriptions
 */
@Injectable()
export class CptmVehiclePollingService implements OnModuleDestroy {
  private readonly logger = new Logger(CptmVehiclePollingService.name);

  // Line subscriptions: Map<"L4"|"L11"|..., Set<clientId>>
  private readonly subscriptions = new Map<CptmLineCode, Set<string>>();

  // Cache: Map<"L4"|"L11"|..., CptmVehicleUpdate>
  private readonly cache = new Map<CptmLineCode, CptmVehicleUpdate>();

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private pollInterval = POLL_INTERVAL;
  private hasError = false;

  private readonly pollCompleteListeners: Set<PollCompleteListener> = new Set();

  constructor(private readonly externalRailProvider: RailRealtimeSourcePort) {}

  onModuleDestroy(): void {
    this.stopPolling();
  }

  /**
   * Subscribe a client to vehicle positions for a line
   * Supports lines that expose private vehicle tracking.
   */
  subscribe(
    clientId: string,
    lineCode: CptmLineCode,
  ): CptmVehicleUpdate | null {
    if (!hasExternalRailVehicles(lineCode)) {
      this.logger.warn(`Invalid line code for private vehicles: ${lineCode}`);
      return null;
    }

    let clients = this.subscriptions.get(lineCode);
    if (!clients) {
      clients = new Set();
      this.subscriptions.set(lineCode, clients);
    }
    clients.add(clientId);

    this.logger.debug(
      `Client ${clientId} subscribed to ${lineCode} vehicles (${clients.size} subscriber(s))`,
    );

    this.ensurePolling();

    // Return cached data if available
    return this.cache.get(lineCode) ?? null;
  }

  /**
   * Unsubscribe a client from vehicle positions for a line
   */
  unsubscribe(clientId: string, lineCode: CptmLineCode): void {
    const clients = this.subscriptions.get(lineCode);

    if (clients) {
      clients.delete(clientId);
      this.logger.debug(
        `Client ${clientId} unsubscribed from ${lineCode} vehicles (${clients.size} subscriber(s) remaining)`,
      );

      if (clients.size === 0) {
        this.subscriptions.delete(lineCode);
        this.cache.delete(lineCode);
      }
    }

    this.cleanupPolling();
  }

  /**
   * Unsubscribe a client from all lines
   */
  unsubscribeAll(clientId: string): void {
    for (const [lineCode, clients] of this.subscriptions) {
      if (clients.has(clientId)) {
        clients.delete(clientId);
        this.logger.debug(
          `Client ${clientId} unsubscribed from ${lineCode} vehicles (${clients.size} subscriber(s) remaining)`,
        );

        if (clients.size === 0) {
          this.subscriptions.delete(lineCode);
          this.cache.delete(lineCode);
        }
      }
    }

    this.cleanupPolling();
  }

  /**
   * Get cached vehicle positions for a line
   */
  getCached(lineCode: CptmLineCode): CptmVehicleUpdate | null {
    return this.cache.get(lineCode) ?? null;
  }

  /**
   * Register a listener for poll completion with deltas
   */
  onPollComplete(listener: PollCompleteListener): void {
    this.pollCompleteListeners.add(listener);
  }

  /**
   * Unregister a poll completion listener
   */
  offPollComplete(listener: PollCompleteListener): void {
    this.pollCompleteListeners.delete(listener);
  }

  /**
   * Get subscribers for a specific line
   */
  getSubscribers(lineCode: CptmLineCode): Set<string> {
    return this.subscriptions.get(lineCode) ?? new Set();
  }

  /**
   * Get all subscribed line codes
   */
  getSubscribedLines(): CptmLineCode[] {
    return Array.from(this.subscriptions.keys());
  }

  private ensurePolling(): void {
    if (this.pollTimer) return;
    if (this.subscriptions.size === 0) return;

    this.logger.debug(
      `Starting CPTM vehicle polling (${this.pollInterval / 1000}s interval)`,
    );
    this.pollTimer = setInterval(() => void this.poll(), this.pollInterval);

    // Trigger immediate poll
    void this.poll();
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.logger.debug('Stopped CPTM vehicle polling');
    }
  }

  private cleanupPolling(): void {
    if (this.subscriptions.size === 0) {
      this.stopPolling();
      this.cache.clear();
    }
  }

  private adjustPollInterval(hasErrors: boolean): void {
    const newInterval = hasErrors ? ERROR_POLL_INTERVAL : POLL_INTERVAL;

    if (newInterval !== this.pollInterval) {
      this.pollInterval = newInterval;
      this.logger.warn(
        `Adjusted CPTM vehicle polling interval to ${newInterval / 1000}s (errors: ${hasErrors})`,
      );

      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => void this.poll(), this.pollInterval);
      }
    }
    this.hasError = hasErrors;
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;

    const lineCodes = Array.from(this.subscriptions.keys());
    if (lineCodes.length === 0) return;

    this.isPolling = true;
    const deltas: CptmVehicleDelta[] = [];
    const timestamp = Date.now();
    let anyError = false;

    try {
      // Poll all subscribed lines in parallel
      const results = await Promise.all(
        lineCodes.map(async (lineCode) => {
          try {
            const vehicles =
              await this.externalRailProvider.getVehiclesForLine(lineCode);
            return { lineCode, vehicles, error: false };
          } catch (error) {
            this.logger.error(`Error fetching vehicles for ${lineCode}`, error);
            return { lineCode, vehicles: [], error: true };
          }
        }),
      );

      for (const { lineCode, vehicles, error } of results) {
        if (error) {
          anyError = true;
          continue;
        }

        const config = CPTM_LINE_CONFIG[lineCode];
        const cached = this.cache.get(lineCode);

        // Check if vehicles changed
        const vehiclesChanged = this.hasVehiclesChanged(
          cached?.vehicles ?? [],
          vehicles,
        );

        // Update cache
        const update: CptmVehicleUpdate = {
          lineCode,
          lineName: config.name,
          bgcolor: config.bgcolor,
          fgcolor: config.fgcolor,
          vehicles,
          timestamp,
        };
        this.cache.set(lineCode, update);

        // Emit delta if changed
        if (vehiclesChanged) {
          deltas.push({
            lineCode,
            vehicles,
            timestamp,
          });
        }
      }

      this.adjustPollInterval(anyError);

      // Notify listeners
      if (deltas.length > 0) {
        this.logger.debug(
          `Broadcasting ${deltas.length} CPTM vehicle delta(s)`,
        );
        for (const listener of this.pollCompleteListeners) {
          try {
            listener(deltas);
          } catch (error) {
            this.logger.error(
              'Error in CPTM vehicle poll complete listener',
              error,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error('Error during CPTM vehicle polling', error);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Check if vehicle positions have changed
   */
  private hasVehiclesChanged(
    oldVehicles: RailVehiclePosition[],
    newVehicles: RailVehiclePosition[],
  ): boolean {
    if (oldVehicles.length !== newVehicles.length) {
      return true;
    }

    // Sort by prefix for comparison
    const sortByPrefix = (
      a: RailVehiclePosition,
      b: RailVehiclePosition,
    ) =>
      a.prefix.localeCompare(b.prefix);
    const sortedOld = [...oldVehicles].sort(sortByPrefix);
    const sortedNew = [...newVehicles].sort(sortByPrefix);

    for (let i = 0; i < sortedOld.length; i++) {
      const oldV = sortedOld[i];
      const newV = sortedNew[i];

      // Check if position or bearing changed significantly
      if (
        oldV.prefix !== newV.prefix ||
        Math.abs(oldV.lat - newV.lat) > 0.0001 ||
        Math.abs(oldV.lng - newV.lng) > 0.0001 ||
        oldV.bearing !== newV.bearing
      ) {
        return true;
      }
    }

    return false;
  }
}
