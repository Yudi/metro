import { Service, OnDestroy, signal, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BikeStation } from '../components/map/map.types';
import type { BikeVehicleAvailability } from '@metro/shared/bike-contracts';
import { environment } from '../../../environments/environment';
import { LoggerService } from '@metro/shared/api';

interface BikeStationSummaryApiDto {
  stationId: string;
  latitude: number;
  longitude: number;
  capacity: number | null;
  effectiveCapacity: number;
  numBikesAvailable: number;
  electricBikesAvailable: number;
}

interface BikeStationDetailsApiDto extends BikeStationSummaryApiDto {
  capacity: number | null;
  numBikesDisabled: number;
  numDocksDisabled: number;
  isInstalled: boolean;
  vehicleAvailability: BikeVehicleAvailability[];
}

/**
 * Lightweight refresh signal. Station summaries are delivered by MVT.
 */
interface BikeStationsUpdatePayloadApi {
  type: 'full' | 'delta';
  lastUpdated: number;
  ttl: number;
  fetchedAt: number;
}

interface BikeStationDetailsPayloadApi {
  stationId: string;
  station: BikeStationDetailsApiDto | null;
  lastUpdated: number | null;
  fetchedAt: number | null;
}

const BIKE_WS_UPDATE_EVENT = 'stations_update';
const BIKE_WS_DETAILS_EVENT = 'station_details';
const BIKE_WS_DETAILS_REQUEST_EVENT = 'station_details_request';
const BIKE_DETAILS_REQUEST_TIMEOUT_MS = 10_000;
const BIKE_DETAILS_RETRY_DELAY_MS = 30_000;

@Service()
export class BikeStationsService implements OnDestroy {
  private readonly logger = inject(LoggerService);

  private socket: Socket | null = null;
  private readonly socketUrl = environment.apiUrl.replace(/\/api$/, '');
  private readonly namespace = '/bike';

  private readonly inFlightDetailRequests = new Set<string>();
  private readonly pendingDetailTimeouts = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly detailRetryAfter = new Map<string, number>();

  readonly stations = signal<BikeStation[]>([]);
  readonly lastUpdated = signal<number | null>(null);
  readonly ttl = signal<number | null>(null);
  readonly fetchedAt = signal<number | null>(null);
  readonly connected = signal(false);
  readonly paused = signal(false);
  readonly refreshTick = signal(0);

  async activate(): Promise<void> {
    this.paused.set(false);
    this.ensureSocket();
  }

  /**
   * Pause updates (when layer is hidden)
   * Keeps connection but stops processing updates
   */
  pause(): void {
    this.paused.set(true);
  }

  /**
   * Resume updates (when layer is shown)
   * If there's pending data, triggers an immediate update
   */
  resume(): void {
    this.paused.set(false);
    this.refreshTick.update((value) => value + 1);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected.set(false);
    }

    this.clearAllDetailTracking();
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.detailRetryAfter.clear();
  }

  ensureStationDetails(stationId: string): void {
    const station = this.getStation(stationId);
    if (
      station?.detailsLoaded ||
      this.inFlightDetailRequests.has(stationId) ||
      (this.detailRetryAfter.get(stationId) ?? 0) > Date.now()
    ) {
      return;
    }

    this.ensureSocket();
    this.inFlightDetailRequests.add(stationId);
    this.startDetailTimeout(stationId);

    this.socket?.emit(BIKE_WS_DETAILS_REQUEST_EVENT, { stationId });
  }

  getStation(stationId: string): BikeStation | null {
    return this.stations().find((item) => item.stationId === stationId) ?? null;
  }

  upsertStationSummary(summary: {
    stationId: string;
    name?: string;
    latitude: number;
    longitude: number;
    capacity: number | null;
    effectiveCapacity: number;
    numBikesAvailable: number;
    electricBikesAvailable: number;
  }): BikeStation {
    const stations = this.stations();
    const index = stations.findIndex(
      (item) => item.stationId === summary.stationId,
    );
    const previous = index >= 0 ? stations[index] : null;
    const station: BikeStation = {
      stationId: summary.stationId,
      name: previous?.name || summary.name || '',
      latitude: summary.latitude,
      longitude: summary.longitude,
      address: previous?.address ?? null,
      capacity: summary.capacity,
      effectiveCapacity: summary.effectiveCapacity,
      numBikesAvailable: summary.numBikesAvailable,
      numBikesDisabled: previous?.numBikesDisabled ?? 0,
      numDocksAvailable: previous?.numDocksAvailable ?? 0,
      numDocksDisabled: previous?.numDocksDisabled ?? 0,
      status: previous?.status ?? 'UNKNOWN',
      isInstalled: previous?.isInstalled ?? true,
      isRenting: previous?.isRenting ?? true,
      isReturning: previous?.isReturning ?? true,
      lastReported: previous?.lastReported ?? 0,
      lastReportedIso: previous?.lastReportedIso ?? '',
      fetchedAt: this.fetchedAt() ?? Date.now(),
      electricBikesAvailable: summary.electricBikesAvailable,
      hasElectricBikesAvailable: summary.electricBikesAvailable > 0,
      vehicleAvailability: previous?.vehicleAvailability ?? [],
      detailsLoaded: previous?.detailsLoaded ?? false,
      detailsError: previous?.detailsError ?? false,
    };

    if (index >= 0) {
      const next = [...stations];
      next[index] = station;
      this.stations.set(next);
    } else {
      this.stations.set([...stations, station]);
    }

    return station;
  }

  private ensureSocket(): void {
    if (this.socket) {
      return;
    }

    this.socket = io(this.socketUrl + this.namespace, {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      this.connected.set(true);
    });

    this.socket.on('disconnect', () => {
      this.connected.set(false);
    });

    this.socket.on(
      BIKE_WS_UPDATE_EVENT,
      (payload: BikeStationsUpdatePayloadApi) => {
        this.handleUpdatePayload(payload);
      },
    );

    this.socket.on(
      BIKE_WS_DETAILS_EVENT,
      (payload: BikeStationDetailsPayloadApi) => {
        this.handleDetailsPayload(payload);
      },
    );

    this.socket.on('error', (error: unknown) => {
      this.logger.error('Bike socket error', error);
    });
  }

  /**
   * Bike station updates are lightweight cache refresh signals. The map data
   * itself is served through vector tiles, and details are loaded on demand.
   */
  private handleUpdatePayload(payload: BikeStationsUpdatePayloadApi): void {
    // Skip processing if paused (layer hidden)
    if (this.paused()) {
      return;
    }

    this.updateTimestamps(payload);
    this.refreshTick.update((value) => value + 1);
  }

  private updateTimestamps(payload: {
    lastUpdated: number;
    ttl: number;
    fetchedAt: number;
  }): void {
    this.lastUpdated.set(payload.lastUpdated);
    this.ttl.set(payload.ttl);
    this.fetchedAt.set(payload.fetchedAt);
  }

  private handleDetailsPayload(payload: BikeStationDetailsPayloadApi): void {
    const { station, stationId } = payload;

    this.clearDetailTracking(stationId);

    if (!station) {
      this.logger.warn('Received empty bike station details payload', payload);
      this.markDetailsError(stationId);
      return;
    }

    this.detailRetryAfter.delete(stationId);

    const existing =
      this.getStation(stationId) ??
      this.upsertStationSummary({
        stationId,
        latitude: station.latitude,
        longitude: station.longitude,
        capacity: station.capacity,
        effectiveCapacity: station.effectiveCapacity,
        numBikesAvailable: station.numBikesAvailable,
        electricBikesAvailable: station.electricBikesAvailable,
      });

    const updatedStation: BikeStation = {
      ...existing,
      ...station,
      vehicleAvailability: station.vehicleAvailability,
      fetchedAt: payload.fetchedAt ?? existing.fetchedAt,
      detailsLoaded: true,
      detailsError: false,
    } satisfies BikeStation;

    const stations = this.stations();
    const index = stations.findIndex((item) => item.stationId === stationId);
    if (index >= 0) {
      const nextStations = [...stations];
      nextStations[index] = updatedStation;
      this.stations.set(nextStations);
    } else {
      this.stations.set([...stations, updatedStation]);
    }

    if (payload.lastUpdated) {
      this.lastUpdated.set(payload.lastUpdated);
    }
    if (payload.fetchedAt) {
      this.fetchedAt.set(payload.fetchedAt);
    }
  }

  private startDetailTimeout(stationId: string): void {
    const existing = this.pendingDetailTimeouts.get(stationId);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      this.inFlightDetailRequests.delete(stationId);
      this.pendingDetailTimeouts.delete(stationId);
      this.markDetailsError(stationId);
    }, BIKE_DETAILS_REQUEST_TIMEOUT_MS);

    this.pendingDetailTimeouts.set(stationId, timeout);
  }

  private clearDetailTracking(stationId: string): void {
    this.inFlightDetailRequests.delete(stationId);
    const timeout = this.pendingDetailTimeouts.get(stationId);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingDetailTimeouts.delete(stationId);
    }
  }

  private clearAllDetailTracking(): void {
    this.inFlightDetailRequests.clear();
    this.pendingDetailTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.pendingDetailTimeouts.clear();
  }

  private markDetailsError(stationId: string): void {
    this.detailRetryAfter.set(
      stationId,
      Date.now() + BIKE_DETAILS_RETRY_DELAY_MS,
    );

    const index = this.stations().findIndex(
      (item) => item.stationId === stationId,
    );
    if (index < 0) {
      return;
    }

    const nextStations = [...this.stations()];
    nextStations[index] = {
      ...nextStations[index],
      detailsError: true,
    };
    this.stations.set(nextStations);
  }
}
