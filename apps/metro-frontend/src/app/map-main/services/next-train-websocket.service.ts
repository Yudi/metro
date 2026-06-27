import { Injectable, signal, OnDestroy, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { LoggerService } from '@metro/shared/api';
import {
  ExtendedNextTrainLineCode,
  CptmLineCode,
  hasExternalRailVehicles,
  TrackedRailVehicle,
  DirectionHeadway,
  TrainCarOccupancy,
} from '@metro/shared/utils';

/**
 * Train position status relative to a station
 */
export type TrainPositionStatus =
  | 'approaching' // Within ~500m and prediction < 2min
  | 'at_station' // Within ~150m of station
  | 'departing' // Just left station
  | 'in_transit' // Moving between stations
  | null; // Unknown

/**
 * Next train arrival data from backend
 * Optimized to only include fields needed for display
 */
export interface NextTrainArrival {
  destinationCode: string;
  destinationName: string;
  trainCurrentStationName: string;
  arrivalTime: string;
  isAtPlatform: boolean | null;
  isTrainStopped: boolean | null;
  // CPTM-specific fields for live position tracking
  trainPositionStatus?: TrainPositionStatus;
  trainNearStationName?: string | null;
  cars?: TrainCarOccupancy[];
}

/**
 * WebSocket update payload
 */
export interface NextTrainUpdate {
  type: 'full' | 'delta';
  lineCode: string;
  stationCode: string;
  trains: NextTrainArrival[];
  timestamp: number;
  /** True if API returned an error (vs no data available) */
  hasError?: boolean;
  /** True while the backend request is queued or running */
  processing?: boolean;
  /** True when operation is closed and no station arrival data remains relevant */
  operationClosed?: boolean;
  /** Average headway per direction (if available) */
  headway?: DirectionHeadway[];
}

/**
 * Station data with error state
 */
export interface StationTrainData {
  trains: NextTrainArrival[];
  hasError: boolean;
  /** True once we've received data from backend (even if trains array is empty) */
  dataReceived: boolean;
  /** True while the backend request is queued or running */
  processing: boolean;
  /** True when operation is closed and no station arrival data remains relevant */
  operationClosed: boolean;
  /** Average headway per direction (if available) */
  headway?: DirectionHeadway[];
}

/**
 * Subscription key format
 */
type SubscriptionKey = `${string}:${string}`;

const NEXT_TRAIN_SUBSCRIBE_EVENT = 'subscribe_station';
const NEXT_TRAIN_UNSUBSCRIBE_EVENT = 'unsubscribe_station';
const NEXT_TRAIN_UPDATE_EVENT = 'next_train_update';

// CPTM vehicle events
const CPTM_VEHICLE_SUBSCRIBE_EVENT = 'subscribe_cptm_vehicles';
const CPTM_VEHICLE_UNSUBSCRIBE_EVENT = 'unsubscribe_cptm_vehicles';
const CPTM_VEHICLE_UPDATE_EVENT = 'cptm_vehicle_update';

/**
 * CPTM vehicle update payload from backend
 */
export interface CptmVehicleUpdate {
  type: 'full' | 'delta';
  lineCode: CptmLineCode;
  vehicles: TrackedRailVehicle[];
  timestamp: number;
}

/**
 * Service for real-time next train data via WebSocket
 * Supports L4 (ViaQuatro), L8/L9 (ViaMobilidade), and L10-L13 (CPTM) lines
 */
@Injectable({
  providedIn: 'root',
})
export class NextTrainWebsocketService implements OnDestroy {
  private socket: Socket | null = null;
  private readonly socketUrl = environment.apiUrl.replace(/\/api$/, '');
  private readonly namespace = '/next-train';
  private readonly logger = inject(LoggerService);

  // Signals for reactive state
  readonly connected = signal(false);
  readonly lastUpdate = signal<number | null>(null);

  // Station data: Map<"L9:HBR", StationTrainData>
  private readonly _stationData = signal<
    Map<SubscriptionKey, StationTrainData>
  >(new Map());

  // CPTM vehicle data: Map<"L10", TrackedRailVehicle[]>
  private readonly _cptmVehicles = signal<
    Map<CptmLineCode, TrackedRailVehicle[]>
  >(new Map());

  // Track active subscriptions for reconnection
  private readonly activeSubscriptions = new Set<SubscriptionKey>();

  // Track CPTM vehicle subscriptions
  private readonly cptmVehicleSubscriptions = new Set<CptmLineCode>();

  constructor() {
    // Don't auto-connect, let components trigger connection on demand
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  /**
   * Subscribe to next train updates for a station
   * Automatically connects if not already connected
   */
  subscribe(lineCode: ExtendedNextTrainLineCode, stationCode: string): void {
    const key: SubscriptionKey = `${lineCode}:${stationCode}`;

    if (this.activeSubscriptions.has(key)) {
      return; // Already subscribed
    }

    this.activeSubscriptions.add(key);
    this.ensureConnected();

    if (this.socket?.connected) {
      this.socket.emit(NEXT_TRAIN_SUBSCRIBE_EVENT, { lineCode, stationCode });
    }
  }

  /**
   * Unsubscribe from next train updates for a station
   */
  unsubscribe(lineCode: ExtendedNextTrainLineCode, stationCode: string): void {
    const key: SubscriptionKey = `${lineCode}:${stationCode}`;

    this.activeSubscriptions.delete(key);

    if (this.socket?.connected) {
      this.socket.emit(NEXT_TRAIN_UNSUBSCRIBE_EVENT, { lineCode, stationCode });
    }

    // Clear data for this station
    this._stationData.update((map) => {
      const newMap = new Map(map);
      newMap.delete(key);
      return newMap;
    });

    // Disconnect if no more subscriptions (including vehicle subscriptions)
    if (
      this.activeSubscriptions.size === 0 &&
      this.cptmVehicleSubscriptions.size === 0
    ) {
      this.disconnect();
    }
  }

  /**
   * Get current train arrivals for a station
   */
  getTrains(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ): NextTrainArrival[] {
    const key: SubscriptionKey = `${lineCode}:${stationCode}`;
    return this._stationData().get(key)?.trains ?? [];
  }

  /**
   * Get station data including error state
   */
  getStationData(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ): StationTrainData | null {
    const key: SubscriptionKey = `${lineCode}:${stationCode}`;
    return this._stationData().get(key) ?? null;
  }

  /**
   * Subscribe to vehicle positions for private-tracked lines (L4, L10-L13)
   */
  subscribeToCptmVehicles(lineCode: CptmLineCode): void {
    if (!hasExternalRailVehicles(lineCode)) {
      this.logger.warn(`Invalid line code for private vehicles: ${lineCode}`);
      return;
    }

    if (this.cptmVehicleSubscriptions.has(lineCode)) {
      return; // Already subscribed
    }

    this.cptmVehicleSubscriptions.add(lineCode);
    this.ensureConnected();

    if (this.socket?.connected) {
      this.socket.emit(CPTM_VEHICLE_SUBSCRIBE_EVENT, { lineCode });
    }
  }

  /**
   * Unsubscribe from CPTM vehicle positions for a line
   */
  unsubscribeFromCptmVehicles(lineCode: CptmLineCode): void {
    if (!this.cptmVehicleSubscriptions.has(lineCode)) {
      return;
    }

    this.cptmVehicleSubscriptions.delete(lineCode);

    if (this.socket?.connected) {
      this.socket.emit(CPTM_VEHICLE_UNSUBSCRIBE_EVENT, { lineCode });
    }

    // Clear vehicle data for this line
    this._cptmVehicles.update((map) => {
      const newMap = new Map(map);
      newMap.delete(lineCode);
      return newMap;
    });

    // Disconnect if no more subscriptions
    if (
      this.activeSubscriptions.size === 0 &&
      this.cptmVehicleSubscriptions.size === 0
    ) {
      this.disconnect();
    }
  }

  /**
   * Get CPTM vehicles for a line
   */
  getCptmVehicles(lineCode: CptmLineCode): TrackedRailVehicle[] {
    return this._cptmVehicles().get(lineCode) ?? [];
  }

  /**
   * Get the CPTM vehicles signal for reactive updates
   */
  get cptmVehicles() {
    return this._cptmVehicles.asReadonly();
  }

  /**
   * Get the station data signal for reactive updates
   */
  get stationData() {
    return this._stationData.asReadonly();
  }

  private ensureConnected(): void {
    if (this.socket?.connected) {
      return;
    }

    this.connect();
  }

  private connect(): void {
    if (this.socket) {
      this.socket.connect();
      return;
    }

    this.logger.debug(`Connecting to next train WebSocket: ${this.socketUrl}`);

    this.socket = io(this.socketUrl + this.namespace, {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      this.logger.debug('Connected to next train WebSocket');
      this.connected.set(true);

      // Re-subscribe to all active subscriptions
      this.resubscribeAll();
    });

    this.socket.on('disconnect', () => {
      this.logger.debug('Disconnected from next train WebSocket');
      this.connected.set(false);
    });

    this.socket.on(NEXT_TRAIN_UPDATE_EVENT, (data: NextTrainUpdate) => {
      this.handleUpdate(data);
    });

    this.socket.on(CPTM_VEHICLE_UPDATE_EVENT, (data: CptmVehicleUpdate) => {
      this.handleCptmVehicleUpdate(data);
    });

    this.socket.on('error', (error: unknown) => {
      this.logger.error('Next train WebSocket error', error);
    });
  }

  private disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected.set(false);
    }
  }

  private resubscribeAll(): void {
    for (const key of this.activeSubscriptions) {
      const [lineCode, stationCode] = key.split(':') as [
        ExtendedNextTrainLineCode,
        string,
      ];
      this.socket?.emit(NEXT_TRAIN_SUBSCRIBE_EVENT, { lineCode, stationCode });
    }

    // Re-subscribe to CPTM vehicle updates
    for (const lineCode of this.cptmVehicleSubscriptions) {
      this.socket?.emit(CPTM_VEHICLE_SUBSCRIBE_EVENT, { lineCode });
    }
  }

  private handleUpdate(update: NextTrainUpdate): void {
    const key: SubscriptionKey = `${update.lineCode}:${update.stationCode}`;

    this._stationData.update((map) => {
      const newMap = new Map(map);
      newMap.set(key, {
        trains: update.trains,
        hasError: update.hasError ?? false,
        dataReceived: !(update.processing ?? false),
        processing: update.processing ?? false,
        operationClosed: update.operationClosed ?? false,
        headway: update.headway,
      });
      return newMap;
    });

    this.lastUpdate.set(update.timestamp);

    this.logger.debug(
      `Received ${update.type} update for ${key}: ${
        update.trains.length
      } train(s)${update.processing ? ' (processing)' : ''}${
        update.hasError ? ' (API error)' : ''
      }${update.operationClosed ? ' (operation closed)' : ''}`,
    );
  }

  private handleCptmVehicleUpdate(update: CptmVehicleUpdate): void {
    this._cptmVehicles.update((map) => {
      const newMap = new Map(map);
      newMap.set(update.lineCode, update.vehicles);
      return newMap;
    });

    this.lastUpdate.set(update.timestamp);

    this.logger.debug(
      `Received ${update.type} CPTM vehicle update for ${update.lineCode}: ${update.vehicles.length} vehicle(s)`,
    );
  }
}
