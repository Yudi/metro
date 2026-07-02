import { Injectable, signal, OnDestroy, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { LoggerService } from '@metro/shared/api';

export interface VehiclePosition {
  p: number; // Vehicle prefix
  a: boolean; // Is accessible
  ta: string; // Timestamp (ISO 8601)
  py: number; // Latitude
  px: number; // Longitude
  t?: string; // Predicted arrival time (for arrival predictions)
  heading?: number | null; // Heading in radians (from backend)
}

export interface LineWithVehicles {
  c: string; // Full route code
  cl: number; // Line API code
  sl: number; // Direction (1 or 2)
  lt0: string; // Destination
  lt1: string; // Origin
  qv: number; // Number of vehicles
  vs: VehiclePosition[]; // Vehicle positions
}

export interface VehiclePositionUpdate {
  routeShortName: string;
  hr: string; // Reference time
  l: LineWithVehicles[];
  cacheTimestamp: number;
}

export interface StopArrivalUpdate {
  stopCode: string;
  hr: string; // Reference time
  p: {
    cp: number; // Stop code
    np: string; // Stop name
    py: number; // Latitude
    px: number; // Longitude
    l: LineWithVehicles[]; // Lines with arrivals
  } | null;
  cacheTimestamp: number;
}

enum RealtimeMessageType {
  SUBSCRIBE_ROUTE = 'subscribe_route',
  UNSUBSCRIBE_ROUTE = 'unsubscribe_route',
  SUBSCRIBE_STOP = 'subscribe_stop',
  UNSUBSCRIBE_STOP = 'unsubscribe_stop',
  VEHICLE_POSITIONS = 'vehicle_positions',
  ARRIVAL_PREDICTIONS = 'arrival_predictions',
  ERROR = 'error',
}

/**
 * Service to manage WebSocket connection for real-time bus data
 */
@Injectable({
  providedIn: 'root',
})
export class RealtimeWebsocketService implements OnDestroy {
  private socket: Socket | null = null;
  private readonly socketUrl = environment.apiUrl.replace(/\/api$/, '');
  private readonly namespace = '/realtime';

  private readonly logger = inject(LoggerService);

  /** Backend poll interval in milliseconds - matches POLL_INTERVAL in realtime-polling.service.ts */
  readonly POLL_INTERVAL_MS = 30_000; // 15 seconds

  // Signals for reactive data
  readonly connected = signal(false);
  readonly lastUpdateTimestamp = signal<number | null>(null);
  readonly vehiclePositions = signal<Map<string, VehiclePositionUpdate>>(
    new Map(),
  );
  readonly stopArrivals = signal<Map<string, StopArrivalUpdate>>(new Map());

  // Track active subscriptions
  private subscribedRoutes = new Set<string>();
  private subscribedStops = new Set<string>();

  constructor() {
    this.connect();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  /**
   * Connect to WebSocket server
   */
  private connect(): void {
    if (this.socket?.connected) {
      return;
    }

    this.logger.debug(`🔌 Connecting to WebSocket: ${this.socketUrl}`);

    this.socket = io(this.socketUrl + this.namespace, {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      this.logger.debug('Connected to real-time WebSocket');
      this.connected.set(true);

      // Re-subscribe to all active subscriptions
      this.resubscribeAll();
    });

    this.socket.on('disconnect', () => {
      this.logger.debug('Disconnected from real-time WebSocket');
      this.connected.set(false);
    });

    this.socket.on(
      RealtimeMessageType.VEHICLE_POSITIONS,
      (data: { type: string; data: VehiclePositionUpdate }) => {
        this.handleVehiclePositions(data.data);
      },
    );

    this.socket.on(
      RealtimeMessageType.ARRIVAL_PREDICTIONS,
      (data: { type: string; data: StopArrivalUpdate }) => {
        this.handleArrivalPredictions(data.data);
      },
    );

    this.socket.on(RealtimeMessageType.ERROR, (error: unknown) => {
      this.logger.error('Real-time WebSocket error', error);
    });

    this.socket.on('error', (error: unknown) => {
      this.logger.error('Socket.IO error', error);
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  private disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected.set(false);
    }
  }

  /**
   * Subscribe to real-time vehicle positions for a route
   */
  subscribeToRoute(routeShortName: string): void {
    if (this.subscribedRoutes.has(routeShortName)) {
      this.logger.debug(`Already subscribed to route: ${routeShortName}`);
      return; // Already subscribed
    }

    this.logger.debug(`Subscribing to route: ${routeShortName}`);
    this.subscribedRoutes.add(routeShortName);

    if (this.socket?.connected) {
      this.socket.emit(RealtimeMessageType.SUBSCRIBE_ROUTE, {
        routeShortName,
      });
      this.logger.debug(
        `Sent subscription request for route: ${routeShortName}`,
      );
    } else {
      this.logger.warn('Socket not connected, will subscribe when connected');
    }
  }

  /**
   * Unsubscribe from real-time vehicle positions for a route
   */
  unsubscribeFromRoute(routeShortName: string): void {
    if (!this.subscribedRoutes.has(routeShortName)) {
      return; // Not subscribed
    }

    this.subscribedRoutes.delete(routeShortName);

    if (this.socket?.connected) {
      this.socket.emit(RealtimeMessageType.UNSUBSCRIBE_ROUTE, {
        routeShortName,
      });
      this.logger.debug(`Unsubscribed from route: ${routeShortName}`);
    }

    // Remove from cache
    const positions = this.vehiclePositions();
    positions.delete(routeShortName);
    this.vehiclePositions.set(new Map(positions));
  }

  /**
   * Subscribe to real-time arrival predictions for a stop
   */
  subscribeToStop(stopCode: string): void {
    if (this.subscribedStops.has(stopCode)) {
      return; // Already subscribed
    }

    this.subscribedStops.add(stopCode);

    if (this.socket?.connected) {
      this.socket.emit(RealtimeMessageType.SUBSCRIBE_STOP, {
        stopCode,
      });
      this.logger.debug(`Subscribed to stop: ${stopCode}`);
    }
  }

  /**
   * Unsubscribe from real-time arrival predictions for a stop
   */
  unsubscribeFromStop(stopCode: string): void {
    if (!this.subscribedStops.has(stopCode)) {
      return; // Not subscribed
    }

    this.subscribedStops.delete(stopCode);

    if (this.socket?.connected) {
      this.socket.emit(RealtimeMessageType.UNSUBSCRIBE_STOP, {
        stopCode,
      });
      this.logger.debug(`📡 Unsubscribed from stop: ${stopCode}`);
    }

    // Remove from cache
    const arrivals = this.stopArrivals();
    arrivals.delete(stopCode);
    this.stopArrivals.set(new Map(arrivals));
  }

  /**
   * Re-subscribe to all active subscriptions after reconnection
   */
  private resubscribeAll(): void {
    for (const routeShortName of this.subscribedRoutes) {
      this.socket?.emit(RealtimeMessageType.SUBSCRIBE_ROUTE, {
        routeShortName,
      });
    }

    for (const stopCode of this.subscribedStops) {
      this.socket?.emit(RealtimeMessageType.SUBSCRIBE_STOP, {
        stopCode,
      });
    }

    this.logger.debug(
      `Re-subscribed to ${this.subscribedRoutes.size} routes and ${this.subscribedStops.size} stops`,
    );
  }

  /**
   * Handle incoming vehicle position updates
   */
  private handleVehiclePositions(data: VehiclePositionUpdate): void {
    const positions = this.vehiclePositions();
    positions.set(data.routeShortName, data);
    this.vehiclePositions.set(new Map(positions));
    this.lastUpdateTimestamp.set(Date.now());

    this.logger.debug(
      `Updated vehicle positions for route ${data.routeShortName}: ${
        data.l?.length ?? 0
      } lines, ${data.l?.reduce((sum, line) => sum + line.qv, 0) ?? 0} vehicles`,
    );
  }

  /**
   * Handle incoming arrival prediction updates
   */
  private handleArrivalPredictions(data: StopArrivalUpdate): void {
    const arrivals = this.stopArrivals();
    arrivals.set(data.stopCode, data);
    this.stopArrivals.set(new Map(arrivals));
    this.lastUpdateTimestamp.set(Date.now());

    this.logger.debug(
      `Updated arrival predictions for stop ${data.stopCode}: ${
        data.p?.l?.length ?? 0
      } lines`,
    );
  }

  /**
   * Get vehicle positions for a specific route
   */
  getVehiclePositionsForRoute(
    routeShortName: string,
  ): VehiclePositionUpdate | undefined {
    return this.vehiclePositions().get(routeShortName);
  }

  /**
   * Get arrival predictions for a specific stop
   */
  getArrivalPredictionsForStop(
    stopCode: string,
  ): StopArrivalUpdate | undefined {
    return this.stopArrivals().get(stopCode);
  }

  /**
   * Check if connected to WebSocket
   */
  isConnected(): boolean {
    return this.connected();
  }
}
