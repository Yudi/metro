import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { WsThrottlerGuard } from '../../common/guards/ws-throttler.guard';
import { Server, Socket } from 'socket.io';
import { RealtimePollingService } from '../services/realtime-polling.service';
import { RouteStopMappingService } from '../services/route-stop-mapping.service';
import {
  RealtimeMessageType,
  SubscriptionRequest,
  PositionResponse,
  StopArrivalResponse,
  StopArrivalUpdate,
  VehiclePositionUpdate,
} from '../dto/realtime.dto';

type PositionCacheEntry = [string, { data: PositionResponse; timestamp: number }];
type StopArrivalCacheEntry = { data: StopArrivalResponse; timestamp: number };

/**
 * WebSocket gateway for real-time bus data
 * Allows clients to subscribe to specific routes/stops and receive updates
 */
@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  namespace: '/realtime',
  path: '/api/socket.io',
  cors: {
    origin:
      process.env.NODE_ENV === 'production' ? 'https://metro.yudi.com.br' : '*',
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  // Track what each client is subscribed to
  private clientSubscriptions = new Map<
    string,
    { routes: Set<string>; stops: Set<string> }
  >();
  private readonly maxRoutesPerClient = 20;
  private readonly maxStopsPerClient = 50;

  // Bound method for poll completion handler
  private readonly handlePollComplete = this.broadcastUpdates.bind(this);

  constructor(
    private pollingService: RealtimePollingService,
    private routeStopMapping: RouteStopMappingService,
  ) {
    // Subscribe to poll completion events
    this.pollingService.onPollComplete(this.handlePollComplete);
  }

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
    this.clientSubscriptions.set(client.id, {
      routes: new Set(),
      stops: new Set(),
    });
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);

    // Unsubscribe client from all their subscriptions.
    const subscriptions = this.clientSubscriptions.get(client.id);
    if (subscriptions) {
      for (const route of subscriptions.routes) {
        this.pollingService.unsubscribeFromRoute(route);
      }
      for (const stop of subscriptions.stops) {
        this.pollingService.unsubscribeFromStop(stop);
      }
    }

    this.clientSubscriptions.delete(client.id);
  }

  @SubscribeMessage('subscribe_route')
  async handleSubscribeRoute(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SubscriptionRequest,
  ): Promise<void> {
    const routeShortName = data.routeShortName?.trim();
    if (!routeShortName) {
      this.emitSubscriptionError(client, 'Route subscription is missing routeShortName');
      return;
    }

    const isKnownRoute =
      await this.routeStopMapping.isKnownRealtimeRoute(routeShortName);
    if (!isKnownRoute) {
      this.emitSubscriptionError(client, 'Route is not available for realtime bus polling');
      return;
    }

    this.logger.debug(
      `Client ${client.id} subscribing to route: ${routeShortName}`,
    );

    // Track this client's subscription
    const subscriptions = this.clientSubscriptions.get(client.id);
    if (!subscriptions) {
      this.emitSubscriptionError(client, 'Client is not connected to realtime subscriptions');
      return;
    }

    const alreadySubscribed =
      subscriptions.routes.has(routeShortName);
    if (!alreadySubscribed) {
      if (subscriptions.routes.size >= this.maxRoutesPerClient) {
        this.emitSubscriptionError(client, 'Route subscription limit exceeded');
        return;
      }

      if (!this.pollingService.subscribeToRoute(routeShortName)) {
        this.emitSubscriptionError(client, 'Global route subscription limit exceeded');
        return;
      }

      subscriptions.routes.add(routeShortName);
    }

    // Check if we have cached data for this route (both directions) - O(1) lookup
    const cache = this.pollingService.getVehiclePositionsCache();
    const routeIndex = this.pollingService.getRouteToDirectionsIndex();
    const directionKeys = routeIndex.get(routeShortName);

    if (directionKeys && directionKeys.size > 0) {
      // Gather all cache entries for this route's directions
      const routeCacheEntries: Array<
        [string, { data: PositionResponse; timestamp: number }]
      > = [];
      for (const cacheKey of directionKeys) {
        const cacheEntry = cache.get(cacheKey);
        if (cacheEntry) {
          routeCacheEntries.push([cacheKey, cacheEntry]);
        }
      }

      const totalVehicles = this.countVehicles(routeCacheEntries);

      // Send immediate cached response with all directions combined
      this.logger.debug(
        `Sending immediate cached data for route ${routeShortName} (${totalVehicles} vehicles across ${routeCacheEntries.length} direction(s))`,
      );

      client.emit(
        RealtimeMessageType.VEHICLE_POSITIONS,
        this.buildVehiclePositionsMessage(
          routeShortName,
          routeCacheEntries,
        ),
      );
    } else {
      // No cached data - trigger immediate poll
      this.logger.debug(
        `No cached data for route ${routeShortName}, triggering immediate poll`,
      );

      // Trigger poll and wait for it
      await this.pollingService.triggerImmediatePoll();

      // Now try to get the data again using the index
      const freshDirectionKeys = routeIndex.get(routeShortName);

      if (freshDirectionKeys && freshDirectionKeys.size > 0) {
        // Gather all cache entries for this route's directions
        const freshCacheEntries: Array<
          [string, { data: PositionResponse; timestamp: number }]
        > = [];
        for (const cacheKey of freshDirectionKeys) {
          const cacheEntry = cache.get(cacheKey);
          if (cacheEntry) {
            freshCacheEntries.push([cacheKey, cacheEntry]);
          }
        }

        const totalVehicles = this.countVehicles(freshCacheEntries);

        this.logger.debug(
          `Sending fresh data for route ${routeShortName} (${totalVehicles} vehicles across ${freshCacheEntries.length} direction(s))`,
        );

        client.emit(
          RealtimeMessageType.VEHICLE_POSITIONS,
          this.buildVehiclePositionsMessage(
            routeShortName,
            freshCacheEntries,
          ),
        );
      } else {
        this.logger.warn(
          `No vehicles found for route ${routeShortName} after immediate poll`,
        );
      }
    }
  }

  @SubscribeMessage(RealtimeMessageType.UNSUBSCRIBE_ROUTE)
  handleUnsubscribeRoute(
    @MessageBody() data: SubscriptionRequest,
    @ConnectedSocket() client: Socket,
  ): void {
    const routeShortName = data.routeShortName?.trim();
    if (!routeShortName) {
      this.logger.warn('Unsubscribe route request missing routeShortName');
      return;
    }

    this.logger.debug(
      `Client ${client.id} unsubscribing from route: ${routeShortName}`,
    );

    const subscriptions = this.clientSubscriptions.get(client.id);
    const wasSubscribed =
      subscriptions?.routes.has(routeShortName) ?? false;
    if (subscriptions) {
      subscriptions.routes.delete(routeShortName);
    }

    if (wasSubscribed) {
      this.pollingService.unsubscribeFromRoute(routeShortName);
    }
  }

  @SubscribeMessage(RealtimeMessageType.SUBSCRIBE_STOP)
  async handleSubscribeStop(
    @MessageBody() data: SubscriptionRequest,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const stopCode = data.stopCode?.trim();
    if (!stopCode) {
      this.emitSubscriptionError(client, 'Stop subscription is missing stopCode');
      return;
    }

    const isKnownStop = await this.routeStopMapping.isKnownRealtimeStop(stopCode);
    if (!isKnownStop) {
      this.emitSubscriptionError(client, 'Stop is not available for realtime bus polling');
      return;
    }

    this.logger.debug(
      `Client ${client.id} subscribing to stop: ${stopCode}`,
    );

    const subscriptions = this.clientSubscriptions.get(client.id);
    if (!subscriptions) {
      this.emitSubscriptionError(client, 'Client is not connected to realtime subscriptions');
      return;
    }

    const alreadySubscribed = subscriptions.stops.has(stopCode);
    if (!alreadySubscribed) {
      if (subscriptions.stops.size >= this.maxStopsPerClient) {
        this.emitSubscriptionError(client, 'Stop subscription limit exceeded');
        return;
      }

      if (!this.pollingService.subscribeToStop(stopCode)) {
        this.emitSubscriptionError(client, 'Global stop subscription limit exceeded');
        return;
      }

      subscriptions.stops.add(stopCode);
    }

    // Immediately send cached data if available
    const cache = this.pollingService.getArrivalPredictionsCache();
    const cachedData = cache.get(stopCode);

    if (cachedData) {
      this.logger.debug(
        `Sending immediate cached data to client ${client.id} for stop ${stopCode}`,
      );
      client.emit(
        RealtimeMessageType.ARRIVAL_PREDICTIONS,
        this.buildStopArrivalMessage(stopCode, cachedData),
      );
    } else {
      // No cached data - trigger immediate poll
      this.logger.debug(
        `No cached data for stop ${stopCode}, triggering immediate poll`,
      );

      // Trigger poll and wait for it
      await this.pollingService.triggerImmediatePoll();

      // Now try to get the data again
      const freshData = cache.get(stopCode);

      if (freshData) {
        this.logger.debug(
          `Sending fresh data to client ${client.id} for stop ${stopCode}`,
        );
        client.emit(
          RealtimeMessageType.ARRIVAL_PREDICTIONS,
          this.buildStopArrivalMessage(stopCode, freshData),
        );
      } else {
        this.logger.warn(
          `No arrival data found for stop ${stopCode} after immediate poll`,
        );
      }
    }
  }

  @SubscribeMessage(RealtimeMessageType.UNSUBSCRIBE_STOP)
  handleUnsubscribeStop(
    @MessageBody() data: SubscriptionRequest,
    @ConnectedSocket() client: Socket,
  ): void {
    const stopCode = data.stopCode?.trim();
    if (!stopCode) {
      this.logger.warn('Unsubscribe stop request missing stopCode');
      return;
    }

    this.logger.debug(
      `Client ${client.id} unsubscribing from stop: ${stopCode}`,
    );

    const subscriptions = this.clientSubscriptions.get(client.id);
    const wasSubscribed = subscriptions?.stops.has(stopCode) ?? false;
    if (subscriptions) {
      subscriptions.stops.delete(stopCode);
    }

    if (wasSubscribed) {
      this.pollingService.unsubscribeFromStop(stopCode);
    }
  }

  /**
   * Broadcast updates to all subscribed clients
   * Called automatically after each poll completes
   */
  private broadcastUpdates(): void {
    // Skip if no clients are connected
    if (this.clientSubscriptions.size === 0) {
      return;
    }

    const vehiclePositions = this.pollingService.getVehiclePositionsCache();
    const routeIndex = this.pollingService.getRouteToDirectionsIndex();
    const arrivalPredictions = this.pollingService.getArrivalPredictionsCache();

    this.logger.debug(
      `Broadcasting updates: ${routeIndex.size} routes, ${arrivalPredictions.size} stops`,
    );

    // Use the route index for O(1) lookups instead of iterating all cache entries
    for (const [routeShortName, directionKeys] of routeIndex) {
      // Gather all cache entries for this route's directions
      const cacheEntries: Array<
        [string, { data: PositionResponse; timestamp: number }]
      > = [];
      for (const cacheKey of directionKeys) {
        const cacheEntry = vehiclePositions.get(cacheKey);
        if (cacheEntry) {
          cacheEntries.push([cacheKey, cacheEntry]);
        }
      }

      if (cacheEntries.length === 0) {
        continue;
      }

      // Combine all directions into a single response
      const combinedLines = cacheEntries.flatMap(
        ([, entry]) => entry.data.l || [],
      );
      const totalVehicles = combinedLines.reduce(
        (sum, line) => sum + (line.vs?.length ?? 0),
        0,
      );
      // Find all clients subscribed to this route
      const subscribedClients: string[] = [];
      for (const [clientId, subs] of this.clientSubscriptions) {
        if (subs.routes.has(routeShortName)) {
          subscribedClients.push(clientId);
        }
      }

      if (subscribedClients.length > 0) {
        this.logger.debug(
          `Broadcasting vehicle positions for route ${routeShortName}: ${totalVehicles} vehicles across ${cacheEntries.length} direction(s) to ${subscribedClients.length} client(s)`,
        );

        const message = this.buildVehiclePositionsMessage(
          routeShortName,
          cacheEntries,
        );

        // Emit to each subscribed client individually
        for (const clientId of subscribedClients) {
          this.server
            .to(clientId)
            .emit(RealtimeMessageType.VEHICLE_POSITIONS, message);
        }
      }
    }

    // Broadcast arrival predictions - only to clients subscribed to each stop
    for (const [stopCode, cache] of arrivalPredictions) {
      const linesCount = cache.data.p?.l?.length ?? 0;

      // Find all clients subscribed to this stop
      const subscribedClients: string[] = [];
      for (const [clientId, subs] of this.clientSubscriptions) {
        if (subs.stops.has(stopCode)) {
          subscribedClients.push(clientId);
        }
      }

      if (subscribedClients.length > 0) {
        this.logger.debug(
          `Broadcasting arrival predictions for stop ${stopCode}: ${linesCount} lines to ${subscribedClients.length} client(s)`,
        );

        const message = this.buildStopArrivalMessage(stopCode, cache);

        // Emit to each subscribed client individually
        for (const clientId of subscribedClients) {
          this.server
            .to(clientId)
            .emit(RealtimeMessageType.ARRIVAL_PREDICTIONS, message);
        }
      }
    }
  }

  private buildVehiclePositionsMessage(
    routeShortName: string,
    cacheEntries: PositionCacheEntry[],
  ): {
    type: RealtimeMessageType.VEHICLE_POSITIONS;
    data: VehiclePositionUpdate;
  } {
    const latestTimestamp = Math.max(
      ...cacheEntries.map(([, entry]) => entry.timestamp),
    );

    return {
      type: RealtimeMessageType.VEHICLE_POSITIONS,
      data: {
        routeShortName,
        hr: cacheEntries[0][1].data.hr,
        l: cacheEntries.flatMap(([, entry]) => entry.data.l || []),
        cacheTimestamp: latestTimestamp,
      },
    };
  }

  private countVehicles(cacheEntries: PositionCacheEntry[]): number {
    return cacheEntries.reduce(
      (sum, [, entry]) =>
        sum +
        (entry.data.l?.reduce(
          (lineSum, line) => lineSum + (line.vs?.length ?? 0),
          0,
        ) ?? 0),
      0,
    );
  }

  private buildStopArrivalMessage(
    stopCode: string,
    cache: StopArrivalCacheEntry,
  ): {
    type: RealtimeMessageType.ARRIVAL_PREDICTIONS;
    data: StopArrivalUpdate;
  } {
    return {
      type: RealtimeMessageType.ARRIVAL_PREDICTIONS,
      data: {
        stopCode,
        ...cache.data,
        cacheTimestamp: cache.timestamp,
      },
    };
  }

  private emitSubscriptionError(client: Socket, message: string): void {
    client.emit(RealtimeMessageType.ERROR, { message });
  }
}
