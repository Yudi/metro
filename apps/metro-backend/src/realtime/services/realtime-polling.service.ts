import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OLHOVIVO_POLL_INTERVAL_MS } from '@metro/shared/utils';
import { OlhoVivoApiService } from './olhovivo-api.service';
import { BusVehiclePositionsClient } from './bus-vehicle-positions.client';
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
export class RealtimePollingService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimePollingService.name);
  private readonly POLL_INTERVAL = OLHOVIVO_POLL_INTERVAL_MS;
  private readonly MAX_ACTIVE_ROUTES = 200;
  private readonly MAX_ACTIVE_STOPS = 500;
  private readonly STOP_POLL_CONCURRENCY = 8;
  private readonly ARTESP_ROUTE_POLL_CONCURRENCY = 8;
  private readonly pollingCoordinator = new PollingCoordinator(
    this.logger,
    () => this.poll(),
    this.POLL_INTERVAL,
  );
  private readonly artespPollingCoordinator = new PollingCoordinator(
    this.logger,
    () => this.pollArtespRoutePositions(Date.now()),
    this.POLL_INTERVAL,
  );

  private subscriptions: RealtimeSubscription = new RealtimeSubscription();
  private routeSubscriptionCounts = new Map<string, number>();
  private stopSubscriptionCounts = new Map<string, number>();
  private routeSubscriptionTokens = new Map<string, object>();

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
    private vehiclePositionsClient: BusVehiclePositionsClient,
  ) {}

  async onModuleDestroy(): Promise<void> {
    this.routeSubscriptionTokens.clear();
    await Promise.all([
      this.pollingCoordinator.stopAndDrain(),
      this.artespPollingCoordinator.stopAndDrain(),
    ]);
    this.routeSubscriptionCounts.clear();
    this.stopSubscriptionCounts.clear();
    this.subscriptions.routeShortNames.clear();
    this.subscriptions.stopCodes.clear();
    this.vehiclePositionsCache.clear();
    this.routeToDirectionsIndex.clear();
    this.arrivalPredictionsCache.clear();
  }

  /**
   * Subscribe to poll completion events
   */
  onPollComplete(listener: () => void): void {
    this.pollingCoordinator.onPollComplete(listener);
    this.artespPollingCoordinator.onPollComplete(listener);
  }

  /**
   * Unsubscribe from poll completion events
   */
  offPollComplete(listener: () => void): void {
    this.pollingCoordinator.offPollComplete(listener);
    this.artespPollingCoordinator.offPollComplete(listener);
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

    if (subscriptionCount === 1) {
      this.routeSubscriptionTokens.set(routeShortName, {});
    }
    this.routeSubscriptionCounts.set(routeShortName, subscriptionCount);
    this.subscriptions.routeShortNames.add(routeShortName);
    this.logger.debug(
      `Subscribed to route: ${routeShortName} (${subscriptionCount} subscriber${subscriptionCount === 1 ? '' : 's'})`,
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
      this.routeSubscriptionTokens.delete(routeShortName);
      this.clearRouteCache(routeShortName);
    }

    this.logger.debug(
      `Unsubscribed from route: ${routeShortName} (${Math.max(
        subscriptionCount,
        0,
      )} subscriber${subscriptionCount === 1 ? '' : 's'})`,
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
      `Subscribed to stop: ${stopCode} (${subscriptionCount} subscriber${subscriptionCount === 1 ? '' : 's'})`,
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
      )} subscriber${subscriptionCount === 1 ? '' : 's'})`,
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

    if (this.hasSptransSubscriptions()) {
      this.pollingCoordinator.ensurePolling();
    }
    if (this.hasArtespSubscriptions()) {
      this.artespPollingCoordinator.ensurePolling();
    }
  }

  /**
   * Stop polling if no more subscriptions
   */
  private cleanupPolling(): void {
    if (!this.hasSptransSubscriptions()) {
      this.pollingCoordinator.stopPolling();
    }
    if (!this.hasArtespSubscriptions()) {
      this.artespPollingCoordinator.stopPolling();
    }

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
    const subscribedRoutes = new Map(
      Array.from(this.subscriptions.routeShortNames)
        .filter((routeId) => !isArtespRouteId(routeId))
        .map((routeId) => [
          routeId,
          this.routeSubscriptionTokens.get(routeId),
        ] as const),
    );
    if (subscribedRoutes.size === 0) {
      return;
    }

    this.logger.debug(
      `Polling vehicle positions for ${subscribedRoutes.size} subscribed route${subscribedRoutes.size === 1 ? '' : 's'}`,
    );
    try {
      const allData = await this.olhoVivoApi.getAllPositions();
      this.logger.debug(`Received ${allData.l?.length ?? 0} lines from API`);
      const activeVehicleIds = new Set<number>();
      for (const routeShortName of subscribedRoutes.keys()) {
        this.clearRouteCache(routeShortName);
      }
      // For each line, add heading to all vehicles and cache by route+direction
      // Note: line.c is the route code, line.sl is the direction (1 or 2)
      // We must cache separately for each direction to avoid overwriting
      for (const line of allData.l || []) {
        const token = subscribedRoutes.get(line.c);
        if (
          !token ||
          !this.isCurrentRouteSubscription(line.c, token)
        ) {
          continue;
        }

        const combinedData: PositionResponse = {
          hr: allData.hr,
          l: [line],
        };
        this.vehicleDirection.addHeadingsToPositionResponse(combinedData);
        for (const vehicle of line.vs ?? []) {
          activeVehicleIds.add(vehicle.p);
        }

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
      this.vehicleDirection.cleanupStaleVehicles(activeVehicleIds);
      this.logger.debug(
        `Polling complete: Updated ${this.routeToDirectionsIndex.size} subscribed routes with vehicle data`,
      );
    } catch (error) {
      this.logger.error('Error polling all positions:', error);
    }
  }

  private async pollArtespRoutePositions(timestamp: number): Promise<void> {
    const subscribedRoutes = Array.from(this.subscriptions.routeShortNames)
      .filter((routeId) => isArtespRouteId(routeId))
      .map((routeId) => ({
        routeId,
        token: this.routeSubscriptionTokens.get(routeId),
      }))
      .filter(
        (route): route is { routeId: string; token: object } =>
          route.token !== undefined,
      );

    for (
      let offset = 0;
      offset < subscribedRoutes.length;
      offset += this.ARTESP_ROUTE_POLL_CONCURRENCY
    ) {
      const batch = subscribedRoutes.slice(
        offset,
        offset + this.ARTESP_ROUTE_POLL_CONCURRENCY,
      );
      await Promise.all(
        batch.map(async ({ routeId, token }) => {
          if (!this.isCurrentRouteSubscription(routeId, token)) return;
          let routeLabel = this.getCachedRouteLabel(routeId);
          try {
            const resolvedRouteLabel =
              await this.mapping.getArtespRouteShortName(routeId);
            if (!this.isCurrentRouteSubscription(routeId, token)) return;
            if (!resolvedRouteLabel) {
              throw new Error('Route is missing from the GTFS catalogue');
            }
            routeLabel = resolvedRouteLabel;

            const positions =
              await this.vehiclePositionsClient.getVehiclePositions(
                resolvedRouteLabel,
              );
            if (!this.isCurrentRouteSubscription(routeId, token)) return;

            this.replaceRouteSnapshot(
              routeId,
              {
                hr: new Date(timestamp).toISOString(),
                l: [],
                positions,
                routeLabel: resolvedRouteLabel,
              },
              timestamp,
            );
          } catch (error) {
            const category = error instanceof Error ? error.name : typeof error;
            this.logger.warn(
              `Vehicle positions polling failed for ${routeId} (${category})`,
            );
            if (!this.isCurrentRouteSubscription(routeId, token)) return;

            this.replaceRouteSnapshot(
              routeId,
              {
                hr: new Date(timestamp).toISOString(),
                l: [],
                positions: [],
                ...(routeLabel ? { routeLabel } : {}),
              },
              timestamp,
            );
          }
        }),
      );
    }
  }

  private replaceRouteSnapshot(
    routeId: string,
    data: PositionResponse,
    timestamp: number,
  ): void {
    this.clearRouteCache(routeId);
    const cacheKey = `${routeId}:positions`;
    this.vehiclePositionsCache.set(cacheKey, { data, timestamp });
    this.routeToDirectionsIndex.set(routeId, new Set([cacheKey]));
  }

  private getCachedRouteLabel(routeId: string): string | undefined {
    const keys = this.routeToDirectionsIndex.get(routeId);
    if (!keys) return undefined;
    for (const key of keys) {
      const label = this.vehiclePositionsCache.get(key)?.data.routeLabel;
      if (label) return label;
    }
    return undefined;
  }

  private isCurrentRouteSubscription(routeId: string, token: object): boolean {
    return (
      this.subscriptions.routeShortNames.has(routeId) &&
      this.routeSubscriptionTokens.get(routeId) === token
    );
  }

  /**
   * Poll arrival predictions for all subscribed stops
   */
  private async pollStopArrivals(timestamp: number): Promise<void> {
    const stopCodes = Array.from(this.subscriptions.stopCodes);
    for (
      let offset = 0;
      offset < stopCodes.length;
      offset += this.STOP_POLL_CONCURRENCY
    ) {
      const batch = stopCodes.slice(
        offset,
        offset + this.STOP_POLL_CONCURRENCY,
      );
      await Promise.all(
        batch.map(async (stopCode) => {
          try {
            const apiCode = await this.mapping.getApiStopCode(stopCode);

            if (apiCode === null) {
              this.logger.debug(
                `Skipping stop ${stopCode} - not supported for real-time`,
              );
              return;
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
        }),
      );
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

  async triggerImmediateRoutePoll(routeId: string): Promise<void> {
    if (isArtespRouteId(routeId)) {
      if (!this.subscriptions.routeShortNames.has(routeId)) return;
      this.logger.debug('Immediate ARTESP route poll triggered');
      await this.artespPollingCoordinator.triggerImmediatePoll();
      return;
    }
    await this.triggerImmediatePoll();
  }

  private hasActiveSubscriptions(): boolean {
    return (
      this.subscriptions.routeShortNames.size > 0 ||
      this.subscriptions.stopCodes.size > 0
    );
  }

  private hasArtespSubscriptions(): boolean {
    return Array.from(this.subscriptions.routeShortNames).some((routeId) =>
      isArtespRouteId(routeId),
    );
  }

  private hasSptransSubscriptions(): boolean {
    return (
      this.subscriptions.stopCodes.size > 0 ||
      Array.from(this.subscriptions.routeShortNames).some(
        (routeId) => !isArtespRouteId(routeId),
      )
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

function isArtespRouteId(routeId: string): boolean {
  return /^artesp:/i.test(routeId);
}
