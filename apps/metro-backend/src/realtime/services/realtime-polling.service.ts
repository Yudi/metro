import { Injectable, Logger } from '@nestjs/common';
import { OlhoVivoApiService } from './olhovivo-api.service';
import { RouteStopMappingService } from './route-stop-mapping.service';
import { VehicleDirectionBackendService } from './vehicle-direction-backend.service';
import {
  RealtimeSubscription,
  PositionResponse,
  StopArrivalResponse,
} from '../dto/realtime.dto';
import { PollingCoordinator } from '../../common/polling/polling-coordinator';

/**
 * Manages polling of real-time data based on active subscriptions
 * Polls every 30 seconds and emits events when new data is available
 */
@Injectable()
export class RealtimePollingService {
  private readonly logger = new Logger(RealtimePollingService.name);
  private readonly POLL_INTERVAL = 30_000;
  private readonly MAX_ACTIVE_ROUTES = 200;
  private readonly MAX_ACTIVE_STOPS = 500;
  private readonly pollingCoordinator = new PollingCoordinator(
    this.logger,
    () => this.poll(),
    this.POLL_INTERVAL,
  );

  private subscriptions: RealtimeSubscription = new RealtimeSubscription();
  private routeSubscriptionCounts = new Map<string, number>();
  private stopSubscriptionCounts = new Map<string, number>();

  // Cached data - individual direction entries
  private vehiclePositionsCache = new Map<
    string,
    { data: PositionResponse; timestamp: number }
  >();

  // Route index - maps route code to all its direction cache keys for O(1) lookup
  private routeToDirectionsIndex = new Map<string, Set<string>>();

  private arrivalPredictionsCache = new Map<
    string,
    { data: StopArrivalResponse; timestamp: number }
  >();

  constructor(
    private olhoVivoApi: OlhoVivoApiService,
    private mapping: RouteStopMappingService,
    private vehicleDirection: VehicleDirectionBackendService,
  ) {}

  /**
   * Subscribe to poll completion events
   */
  onPollComplete(listener: () => void): void {
    this.pollingCoordinator.onPollComplete(listener);
  }

  /**
   * Unsubscribe from poll completion events
   */
  offPollComplete(listener: () => void): void {
    this.pollingCoordinator.offPollComplete(listener);
  }

  /**
   * Subscribe to real-time data for a route
   */
  subscribeToRoute(routeShortName: string): boolean {
    if (
      !this.subscriptions.routeShortNames.has(routeShortName) &&
      this.subscriptions.routeShortNames.size >= this.MAX_ACTIVE_ROUTES
    ) {
      this.logger.warn(
        `Rejected route subscription ${routeShortName}: global route limit reached`,
      );
      return false;
    }

    const subscriptionCount =
      (this.routeSubscriptionCounts.get(routeShortName) ?? 0) + 1;

    this.routeSubscriptionCounts.set(routeShortName, subscriptionCount);
    this.subscriptions.routeShortNames.add(routeShortName);
    this.logger.debug(
      `Subscribed to route: ${routeShortName} (${subscriptionCount} subscriber(s))`,
    );
    this.ensurePolling();
    return true;
  }

  /**
   * Unsubscribe from real-time data for a route
   */
  unsubscribeFromRoute(routeShortName: string): void {
    const subscriptionCount =
      (this.routeSubscriptionCounts.get(routeShortName) ?? 0) - 1;

    if (subscriptionCount > 0) {
      this.routeSubscriptionCounts.set(routeShortName, subscriptionCount);
    } else {
      this.routeSubscriptionCounts.delete(routeShortName);
      this.subscriptions.routeShortNames.delete(routeShortName);
      this.clearRouteCache(routeShortName);
    }

    this.logger.debug(
      `Unsubscribed from route: ${routeShortName} (${Math.max(
        subscriptionCount,
        0,
      )} subscriber(s))`,
    );
    this.cleanupPolling();
  }

  /**
   * Subscribe to real-time data for a stop
   */
  subscribeToStop(stopCode: string): boolean {
    if (
      !this.subscriptions.stopCodes.has(stopCode) &&
      this.subscriptions.stopCodes.size >= this.MAX_ACTIVE_STOPS
    ) {
      this.logger.warn(
        `Rejected stop subscription ${stopCode}: global stop limit reached`,
      );
      return false;
    }

    const subscriptionCount =
      (this.stopSubscriptionCounts.get(stopCode) ?? 0) + 1;

    this.stopSubscriptionCounts.set(stopCode, subscriptionCount);
    this.subscriptions.stopCodes.add(stopCode);
    this.logger.debug(
      `Subscribed to stop: ${stopCode} (${subscriptionCount} subscriber(s))`,
    );
    this.ensurePolling();
    return true;
  }

  /**
   * Unsubscribe from real-time data for a stop
   */
  unsubscribeFromStop(stopCode: string): void {
    const subscriptionCount =
      (this.stopSubscriptionCounts.get(stopCode) ?? 0) - 1;

    if (subscriptionCount > 0) {
      this.stopSubscriptionCounts.set(stopCode, subscriptionCount);
    } else {
      this.stopSubscriptionCounts.delete(stopCode);
      this.subscriptions.stopCodes.delete(stopCode);
      this.arrivalPredictionsCache.delete(stopCode);
    }

    this.logger.debug(
      `Unsubscribed from stop: ${stopCode} (${Math.max(
        subscriptionCount,
        0,
      )} subscriber(s))`,
    );
    this.cleanupPolling();
  }

  /**
   * Get current vehicle positions cache
   */
  getVehiclePositionsCache(): Map<
    string,
    { data: PositionResponse; timestamp: number }
  > {
    return this.vehiclePositionsCache;
  }

  /**
   * Get route-to-directions index for O(1) route lookups
   */
  getRouteToDirectionsIndex(): Map<string, Set<string>> {
    return this.routeToDirectionsIndex;
  }

  /**
   * Get current arrival predictions cache
   */
  getArrivalPredictionsCache(): Map<
    string,
    { data: StopArrivalResponse; timestamp: number }
  > {
    return this.arrivalPredictionsCache;
  }

  /**
   * Start polling if not already started
   */
  private ensurePolling(): void {
    if (!this.hasActiveSubscriptions()) {
      return;
    }

    this.pollingCoordinator.ensurePolling();
  }

  /**
   * Stop polling if no more subscriptions
   */
  private cleanupPolling(): void {
    if (!this.hasActiveSubscriptions()) {
      this.logger.debug(
        'Stopping real-time data polling (no active subscriptions)',
      );
      this.pollingCoordinator.stopPolling();

      // Clear caches
      this.vehiclePositionsCache.clear();
      this.routeToDirectionsIndex.clear();
      this.arrivalPredictionsCache.clear();
    }
  }

  /**
   * Poll data for all active subscriptions
   */
  private async poll(): Promise<void> {
    const timestamp = Date.now();

    // Poll vehicle positions for subscribed routes
    await this.pollRoutePositions(timestamp);

    // Poll arrival predictions for subscribed stops
    await this.pollStopArrivals(timestamp);
  }

  /**
   * Poll vehicle positions for all subscribed routes
   * Uses the /Posicao endpoint which returns ALL vehicles in the system
   * Then filters to only the routes we're subscribed to
   */
  private async pollRoutePositions(timestamp: number): Promise<void> {
    if (this.subscriptions.routeShortNames.size === 0) {
      return;
    }

    this.logger.debug(
      `Polling vehicle positions for ${this.subscriptions.routeShortNames.size} subscribed route(s)`,
    );
    try {
      const allData = await this.olhoVivoApi.getAllPositions();
      this.logger.debug(`Received ${allData.l?.length ?? 0} lines from API`);
      const subscribedRoutes = new Set(this.subscriptions.routeShortNames);
      for (const routeShortName of subscribedRoutes) {
        this.clearRouteCache(routeShortName);
      }
      // For each line, add heading to all vehicles and cache by route+direction
      // Note: line.c is the route code, line.sl is the direction (1 or 2)
      // We must cache separately for each direction to avoid overwriting
      for (const line of allData.l || []) {
        if (!subscribedRoutes.has(line.c)) {
          continue;
        }

        const combinedData: PositionResponse = {
          hr: allData.hr,
          l: [line],
        };
        this.vehicleDirection.addHeadingsToPositionResponse(combinedData);

        // Cache key includes both route code and direction to keep them separate
        const cacheKey = `${line.c}-dir${line.sl}`;
        this.vehiclePositionsCache.set(cacheKey, {
          data: combinedData,
          timestamp,
        });

        // Update the route-to-directions index for O(1) lookups
        if (!this.routeToDirectionsIndex.has(line.c)) {
          this.routeToDirectionsIndex.set(line.c, new Set());
        }
        const directions = this.routeToDirectionsIndex.get(line.c);
        if (directions) {
          directions.add(cacheKey);
        }
      }
      this.logger.debug(
        `Polling complete: Updated ${this.routeToDirectionsIndex.size} subscribed routes with vehicle data`,
      );
    } catch (error) {
      this.logger.error('Error polling all positions:', error);
    }
  }

  /**
   * Poll arrival predictions for all subscribed stops
   */
  private async pollStopArrivals(timestamp: number): Promise<void> {
    for (const stopCode of this.subscriptions.stopCodes) {
      try {
        const apiCode = await this.mapping.getApiStopCode(stopCode);

        if (apiCode === null) {
          this.logger.debug(
            `Skipping stop ${stopCode} - not supported for real-time`,
          );
          continue;
        }

        const data = await this.olhoVivoApi.getStopArrivals(apiCode);

        this.arrivalPredictionsCache.set(stopCode, {
          data,
          timestamp,
        });

        this.logger.debug(
          `Updated arrival predictions for stop ${stopCode} (${
            data.p?.l?.length ?? 0
          } lines)`,
        );
      } catch (error) {
        this.logger.error(
          `Error polling arrivals for stop ${stopCode}:`,
          error,
        );
      }
    }
  }

  /**
   * Get current subscription count
   */
  getSubscriptionCount(): {
    routes: number;
    stops: number;
    total: number;
  } {
    return {
      routes: this.subscriptions.routeShortNames.size,
      stops: this.subscriptions.stopCodes.size,
      total:
        this.subscriptions.routeShortNames.size +
        this.subscriptions.stopCodes.size,
    };
  }

  /**
   * Trigger an immediate poll for all subscribed routes and stops
   * Useful when a new subscription is added and cached data is not available
   */
  async triggerImmediatePoll(): Promise<void> {
    if (!this.hasActiveSubscriptions()) {
      this.logger.debug('Immediate poll skipped (no active subscriptions)');
      return;
    }

    this.logger.debug('Immediate poll triggered');
    await this.pollingCoordinator.triggerImmediatePoll();
  }

  private hasActiveSubscriptions(): boolean {
    return (
      this.subscriptions.routeShortNames.size > 0 ||
      this.subscriptions.stopCodes.size > 0
    );
  }

  private clearRouteCache(routeShortName: string): void {
    const directionKeys = this.routeToDirectionsIndex.get(routeShortName);
    if (!directionKeys) {
      return;
    }

    for (const cacheKey of directionKeys) {
      this.vehiclePositionsCache.delete(cacheKey);
    }
    this.routeToDirectionsIndex.delete(routeShortName);
  }
}
