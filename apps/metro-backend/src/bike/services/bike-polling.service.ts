import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BikeApiService } from './bike-api.service';
import {
  BikeStationDto,
  BikeStationsPayloadDto,
  BikeStationsSummaryPayloadDto,
  BikeStationSummaryDto,
  BikeStationsUpdatePayloadDto,
  BikeStationDeltaDto,
} from '../dto/bike.dto';
import { PollingCoordinator } from '../../common/polling/polling-coordinator';

/** Internal type for tracking delta changes */
interface DeltaChanges {
  added: BikeStationSummaryDto[];
  updated: BikeStationDeltaDto[];
  removed: string[];
}

@Injectable()
export class BikePollingService implements OnModuleInit {
  private readonly logger = new Logger(BikePollingService.name);
  private latestPayload: BikeStationsPayloadDto | null = null;
  private latestSummary: BikeStationsSummaryPayloadDto | null = null;
  private latestDelta: DeltaChanges | null = null;
  private previousSummaryMap: Map<string, BikeStationSummaryDto> = new Map();
  private readonly pollingCoordinator = new PollingCoordinator(
    this.logger,
    () => this.pollStations(),
    15_000
  );

  constructor(private readonly bikeApi: BikeApiService) {}

  async onModuleInit(): Promise<void> {
    this.logger.debug('Initializing bike polling service');
    this.pollingCoordinator.ensurePolling();
  }

  onPollComplete(listener: () => void): void {
    this.pollingCoordinator.onPollComplete(listener);
  }

  offPollComplete(listener: () => void): void {
    this.pollingCoordinator.offPollComplete(listener);
  }

  getCachedPayload(): BikeStationsPayloadDto | null {
    return this.latestPayload;
  }

  getCachedSummaryPayload(): BikeStationsSummaryPayloadDto | null {
    return this.latestSummary;
  }

  /**
   * Get a lightweight refresh payload for initial connection.
   * Station summaries are now served through vector tiles.
   */
  getFullUpdatePayload(): BikeStationsUpdatePayloadDto | null {
    if (!this.latestSummary) {
      return null;
    }
    return {
      type: 'full',
      lastUpdated: this.latestSummary.lastUpdated,
      ttl: this.latestSummary.ttl,
      fetchedAt: this.latestSummary.fetchedAt,
    };
  }

  /**
   * Get a lightweight refresh payload for subsequent broadcasts.
   * Returns null if there are no changes
   */
  getDeltaUpdatePayload(): BikeStationsUpdatePayloadDto | null {
    if (!this.latestDelta || !this.latestSummary) {
      return null;
    }

    const hasChanges =
      this.latestDelta.added.length > 0 ||
      this.latestDelta.updated.length > 0 ||
      this.latestDelta.removed.length > 0;

    if (!hasChanges) {
      return null;
    }

    return {
      type: 'delta',
      lastUpdated: this.latestSummary.lastUpdated,
      ttl: this.latestSummary.ttl,
      fetchedAt: this.latestSummary.fetchedAt,
    };
  }

  async getLatestPayload(): Promise<BikeStationsPayloadDto> {
    if (!this.latestPayload) {
      this.logger.warn('Bike station cache empty. Triggering immediate poll.');
      await this.pollingCoordinator.triggerImmediatePoll();
    }

    if (!this.latestPayload) {
      throw new Error('Bike station data unavailable after polling');
    }

    this.ensureSummaryCache();

    return this.latestPayload;
  }

  async getLatestSummaryPayload(): Promise<BikeStationsSummaryPayloadDto> {
    if (!this.latestSummary) {
      await this.getLatestPayload();
    }

    if (!this.latestSummary) {
      throw new Error('Bike station summary data unavailable after polling');
    }

    return this.latestSummary;
  }

  getStationById(stationId: string): BikeStationDto | null {
    if (!this.latestPayload) {
      return null;
    }

    return (
      this.latestPayload.stations.find(
        (station) => station.stationId === stationId
      ) ?? null
    );
  }

  async triggerImmediatePoll(): Promise<void> {
    await this.pollingCoordinator.triggerImmediatePoll();
  }

  private async pollStations(): Promise<void> {
    const payload = await this.bikeApi.fetchStations();
    const newSummary = this.buildSummaryPayload(payload);

    // Compute delta before updating caches
    this.latestDelta = this.computeDelta(newSummary);

    // Update caches
    this.latestPayload = payload;
    this.latestSummary = newSummary;

    // Update previous map for next delta computation
    this.previousSummaryMap = new Map(
      newSummary.stations.map((s) => [s.stationId, s])
    );

    this.logger.debug(
      `Bike station data refreshed (${payload.stations.length} stations, ` +
        `delta: +${this.latestDelta.added.length} ~${this.latestDelta.updated.length} -${this.latestDelta.removed.length})`
    );
  }

  private computeDelta(
    newSummary: BikeStationsSummaryPayloadDto
  ): DeltaChanges {
    const added: BikeStationSummaryDto[] = [];
    const updated: BikeStationDeltaDto[] = [];
    const removed: string[] = [];

    const newStationIds = new Set<string>();

    for (const station of newSummary.stations) {
      newStationIds.add(station.stationId);
      const previous = this.previousSummaryMap.get(station.stationId);

      if (!previous) {
        // New station
        added.push(station);
        continue;
      }

      // Compute field-level delta for existing station
      const delta = this.computeStationDelta(previous, station);
      if (delta) {
        updated.push(delta);
      }
    }

    // Find removed stations
    for (const stationId of this.previousSummaryMap.keys()) {
      if (!newStationIds.has(stationId)) {
        removed.push(stationId);
      }
    }

    return { added, updated, removed };
  }

  private computeStationDelta(
    previous: BikeStationSummaryDto,
    current: BikeStationSummaryDto
  ): BikeStationDeltaDto | null {
    const delta: BikeStationDeltaDto = { stationId: current.stationId };
    let hasChanges = false;

    if (previous.numBikesAvailable !== current.numBikesAvailable) {
      delta.numBikesAvailable = current.numBikesAvailable;
      hasChanges = true;
    }

    if (previous.electricBikesAvailable !== current.electricBikesAvailable) {
      delta.electricBikesAvailable = current.electricBikesAvailable;
      hasChanges = true;
    }

    if (previous.effectiveCapacity !== current.effectiveCapacity) {
      delta.effectiveCapacity = current.effectiveCapacity;
      hasChanges = true;
    }

    if (previous.capacity !== current.capacity) {
      delta.capacity = current.capacity;
      hasChanges = true;
    }

    return hasChanges ? delta : null;
  }

  private ensureSummaryCache(): void {
    if (this.latestSummary || !this.latestPayload) {
      return;
    }

    this.latestSummary = this.buildSummaryPayload(this.latestPayload);
  }

  private buildSummaryPayload(
    payload: BikeStationsPayloadDto
  ): BikeStationsSummaryPayloadDto {
    return {
      lastUpdated: payload.lastUpdated,
      ttl: payload.ttl,
      fetchedAt: payload.fetchedAt,
      stations: payload.stations.map((station) =>
        this.toStationSummary(station)
      ),
    };
  }

  private toStationSummary(station: BikeStationDto): BikeStationSummaryDto {
    return {
      stationId: station.stationId,
      latitude: station.latitude,
      longitude: station.longitude,
      capacity: station.capacity,
      effectiveCapacity: station.effectiveCapacity,
      numBikesAvailable: station.numBikesAvailable,
      electricBikesAvailable: station.electricBikesAvailable,
    };
  }
}
