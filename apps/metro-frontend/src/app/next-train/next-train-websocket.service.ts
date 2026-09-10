import { Service, signal, OnDestroy, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { LoggerService } from '@metro/shared/api';
import {
  ExtendedNextTrainLineCode,
  hasExternalRailVehicles,
  hasNextTrainInformation,
  TrackedRailLineCode,
  TrackedRailVehicle,
} from '@metro/shared/utils';
import type {
  CptmVehicleUpdate,
  NextTrainArrival,
  NextTrainUpdate,
  StationTrainData,
} from './next-train.types';
import { isRenderableTrackedRailVehicle } from './next-train-vehicle.utils';

export type {
  CptmVehicleUpdate,
  NextTrainArrival,
  NextTrainUpdate,
  StationTrainData,
  TrainPositionStatus,
} from './next-train.types';

/**
 * Subscription key format
 */
type SubscriptionKey = `${string}:${string}`;
export type NextTrainSubscriptionRelease = () => void;

const NEXT_TRAIN_SUBSCRIBE_EVENT = 'subscribe_station';
const NEXT_TRAIN_UNSUBSCRIBE_EVENT = 'unsubscribe_station';
const NEXT_TRAIN_UPDATE_EVENT = 'next_train_update';

// CPTM vehicle events
const CPTM_VEHICLE_SUBSCRIBE_EVENT = 'subscribe_cptm_vehicles';
const CPTM_VEHICLE_UNSUBSCRIBE_EVENT = 'unsubscribe_cptm_vehicles';
const CPTM_VEHICLE_UPDATE_EVENT = 'cptm_vehicle_update';

/**
 * Service for real-time next train data via WebSocket
 * Supports L4 (Motiva), L8/L9 (ViaMobilidade), and L10-L13 (CPTM) lines
 */
@Service()
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

  // Tracked rail vehicle data: Map<TrackedRailLineCode, TrackedRailVehicle[]>
  private readonly _cptmVehicles = signal<
    Map<TrackedRailLineCode, TrackedRailVehicle[]>
  >(new Map());

  // Track owners rather than only keys. Multiple cards can render the same
  // station (for example in different dialogs) and must share one upstream
  // subscription without being able to release one another's owner.
  private readonly activeSubscriptions = new Map<SubscriptionKey, number>();

  // Track CPTM vehicle subscriptions
  private readonly cptmVehicleSubscriptions = new Map<
    TrackedRailLineCode,
    number
  >();

  private readonly latestStationUpdateTimestamps = new Map<
    SubscriptionKey,
    number
  >();
  private readonly latestVehicleUpdateTimestamps = new Map<
    TrackedRailLineCode,
    number
  >();

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
  subscribe(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ): NextTrainSubscriptionRelease {
    if (!hasNextTrainInformation(lineCode)) {
      this.logger.warn(`No next-train information for line: ${lineCode}`);
      return () => undefined;
    }

    const key: SubscriptionKey = `${lineCode}:${stationCode}`;
    const owners = this.activeSubscriptions.get(key) ?? 0;
    this.activeSubscriptions.set(key, owners + 1);
    this.ensureConnected();

    if (owners === 0 && this.socket?.connected) {
      this.socket.emit(NEXT_TRAIN_SUBSCRIBE_EVENT, { lineCode, stationCode });
    }

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.unsubscribe(lineCode, stationCode);
    };
  }

  /**
   * Unsubscribe from next train updates for a station
   */
  unsubscribe(lineCode: ExtendedNextTrainLineCode, stationCode: string): void {
    const key: SubscriptionKey = `${lineCode}:${stationCode}`;

    const owners = this.activeSubscriptions.get(key);
    if (!owners) {
      return;
    }

    if (owners > 1) {
      this.activeSubscriptions.set(key, owners - 1);
      return;
    }

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
    this.latestStationUpdateTimestamps.delete(key);

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
   * Subscribe to vehicle positions for tracked rail lines (L4, L8-L13, EA, 10X)
   */
  subscribeToCptmVehicles(
    lineCode: TrackedRailLineCode,
  ): NextTrainSubscriptionRelease {
    if (!hasExternalRailVehicles(lineCode)) {
      this.logger.warn(`Invalid line code for private vehicles: ${lineCode}`);
      return () => undefined;
    }

    const owners = this.cptmVehicleSubscriptions.get(lineCode) ?? 0;
    this.cptmVehicleSubscriptions.set(lineCode, owners + 1);
    this.ensureConnected();

    if (owners === 0 && this.socket?.connected) {
      this.socket.emit(CPTM_VEHICLE_SUBSCRIBE_EVENT, { lineCode });
    }

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.unsubscribeFromCptmVehicles(lineCode);
    };
  }

  /**
   * Unsubscribe from tracked rail vehicle positions for a line
   */
  unsubscribeFromCptmVehicles(lineCode: TrackedRailLineCode): void {
    const owners = this.cptmVehicleSubscriptions.get(lineCode);
    if (!owners) {
      return;
    }

    if (owners > 1) {
      this.cptmVehicleSubscriptions.set(lineCode, owners - 1);
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
    this.latestVehicleUpdateTimestamps.delete(lineCode);

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
  getCptmVehicles(lineCode: TrackedRailLineCode): TrackedRailVehicle[] {
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
      // Estimated positions are snapshots, not a durable cache. Drop them on
      // disconnect so reconnect cannot re-render an old prediction before its
      // first fresh vehicle update arrives. Measured positions remain available
      // as the existing degraded state.
      this._cptmVehicles.update((map) => {
        const newMap = new Map<TrackedRailLineCode, TrackedRailVehicle[]>();
        for (const [lineCode, vehicles] of map) {
          newMap.set(
            lineCode,
            vehicles.filter((vehicle) => vehicle.estimated !== true),
          );
        }
        return newMap;
      });
      this.latestVehicleUpdateTimestamps.clear();
      this._stationData.update((map) => {
        const newMap = new Map<SubscriptionKey, StationTrainData>();
        for (const [key, station] of map) {
          newMap.set(key, {
            ...station,
            trains: [],
            hasError: false,
            dataReceived: false,
            processing: false,
            operationClosed: false,
            outOfSchedule: false,
            headway: undefined,
            scheduledServices: undefined,
          });
        }
        return newMap;
      });
      this.latestStationUpdateTimestamps.clear();
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
    for (const key of this.activeSubscriptions.keys()) {
      const [lineCode, stationCode] = key.split(':') as [
        ExtendedNextTrainLineCode,
        string,
      ];
      this.socket?.emit(NEXT_TRAIN_SUBSCRIBE_EVENT, { lineCode, stationCode });
    }

    // Re-subscribe to CPTM vehicle updates
    for (const lineCode of this.cptmVehicleSubscriptions.keys()) {
      this.socket?.emit(CPTM_VEHICLE_SUBSCRIBE_EVENT, { lineCode });
    }
  }

  private handleUpdate(update: NextTrainUpdate): void {
    const key: SubscriptionKey = `${update.lineCode}:${update.stationCode}`;
    const latestTimestamp = this.latestStationUpdateTimestamps.get(key);
    if (
      latestTimestamp !== undefined &&
      Number.isFinite(update.timestamp) &&
      update.timestamp < latestTimestamp
    ) {
      this.logger.debug(`Ignoring stale next-train update for ${key}`);
      return;
    }

    this._stationData.update((map) => {
      const newMap = new Map(map);
      newMap.set(key, {
        trains: update.trains,
        hasError: update.hasError ?? false,
        dataReceived: !(update.processing ?? false),
        processing: update.processing ?? false,
        operationClosed: update.operationClosed ?? false,
        outOfSchedule: update.outOfSchedule ?? false,
        headway: update.headway,
        scheduledServices: update.scheduledServices,
      });
      return newMap;
    });

    if (!update.processing && Number.isFinite(update.timestamp)) {
      this.latestStationUpdateTimestamps.set(key, update.timestamp);
    }

    this.updateLastUpdateTimestamp(update.timestamp);

    this.logger.debug(
      `Received ${update.type} update for ${key}: ${
        update.trains.length
      } train${update.trains.length === 1 ? '' : 's'}${update.processing ? ' (processing)' : ''}${
        update.hasError ? ' (API error)' : ''
      }${update.operationClosed ? ' (operation closed)' : ''}`,
    );
  }

  private handleCptmVehicleUpdate(update: CptmVehicleUpdate): void {
    if (
      !update ||
      typeof update !== 'object' ||
      typeof update.lineCode !== 'string' ||
      !hasExternalRailVehicles(update.lineCode) ||
      !Array.isArray(update.vehicles) ||
      typeof update.timestamp !== 'number' ||
      !Number.isFinite(update.timestamp)
    ) {
      this.logger.warn('Ignoring malformed CPTM vehicle update');
      return;
    }

    const vehicles = update.vehicles.filter(isRenderableTrackedRailVehicle);
    const latestTimestamp = this.latestVehicleUpdateTimestamps.get(
      update.lineCode,
    );
    if (
      latestTimestamp !== undefined &&
      Number.isFinite(update.timestamp) &&
      update.timestamp < latestTimestamp
    ) {
      this.logger.debug(
        `Ignoring stale CPTM vehicle update for ${update.lineCode}`,
      );
      return;
    }

    this._cptmVehicles.update((map) => {
      const newMap = new Map(map);
      // Every vehicle event is a complete line snapshot.  Replacing the array,
      // including with [], is what removes predictions that disappeared from
      // the refreshed source response.
      newMap.set(update.lineCode, vehicles);
      return newMap;
    });

    if (Number.isFinite(update.timestamp)) {
      this.latestVehicleUpdateTimestamps.set(update.lineCode, update.timestamp);
    }

    this.updateLastUpdateTimestamp(update.timestamp);

    this.logger.debug(
      `Received ${update.type} CPTM vehicle update for ${update.lineCode}: ${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'}`,
    );
  }

  private updateLastUpdateTimestamp(timestamp: number): void {
    const current = this.lastUpdate();
    const next = Number.isFinite(timestamp) ? timestamp : Date.now();
    this.lastUpdate.set(current === null ? next : Math.max(current, next));
  }
}
