import { ChannelCredentials, Client, ServiceError } from '@grpc/grpc-js';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusVehiclePosition } from '@metro/shared/bus-itinerary-contracts';
import { loadBusItineraryGrpcDefinition } from '@metro/shared/bus-itinerary-contracts/grpc';
import { RAIL_INTEGRATION_GRPC_DEFAULT_CLIENT_URL } from '@metro/rail-integration-contracts';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ROUTE_CODE_LENGTH = 128;
const MAX_POSITIONS = 10_000;
const MAX_PLATE_LENGTH = 32;

@Injectable()
export class BusVehiclePositionsClient implements OnModuleDestroy {
  private readonly logger = new Logger(BusVehiclePositionsClient.name);
  private readonly client: BusItineraryGrpcClient;

  constructor(private readonly config: ConfigService) {
    const target =
      this.config.get<string>('RAIL_INTEGRATION_GRPC_URL')?.trim() ||
      RAIL_INTEGRATION_GRPC_DEFAULT_CLIENT_URL;
    const definition = loadBusItineraryGrpcDefinition();
    this.client = new definition.client(
      target,
      ChannelCredentials.createInsecure(),
    ) as unknown as BusItineraryGrpcClient;
  }

  onModuleDestroy(): void {
    this.client.close();
  }

  async getVehiclePositions(routeCode: string): Promise<BusVehiclePosition[]> {
    if (
      !routeCode.trim() ||
      routeCode.length > MAX_ROUTE_CODE_LENGTH ||
      routeCode !== routeCode.trim()
    ) {
      throw new Error('Invalid route code for vehicle positions');
    }

    try {
      return parseBusVehiclePositions(await this.invoke({ routeCode }));
    } catch (error) {
      const category = error instanceof Error ? error.name : typeof error;
      this.logger.warn(`Vehicle positions request failed (${category})`);
      throw error;
    }
  }

  private invoke(request: { routeCode: string }): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.client.getVehiclePositions(
        request,
        { deadline: new Date(Date.now() + REQUEST_TIMEOUT_MS) },
        (error, response) => {
          if (error) {
            reject(error);
            return;
          }
          if (response === undefined) {
            reject(new Error('Empty vehicle positions response'));
            return;
          }
          resolve(response);
        },
      );
    });
  }
}

interface BusItineraryGrpcClient extends Client {
  getVehiclePositions(
    request: { routeCode: string },
    options: { deadline: Date },
    callback: (error: ServiceError | null, response?: unknown) => void,
  ): unknown;
}

function parseBusVehiclePositions(value: unknown): BusVehiclePosition[] {
  if (!isRecord(value) || !Array.isArray(value.positions)) {
    throw new Error('Invalid vehicle positions response');
  }
  if (value.positions.length > MAX_POSITIONS) {
    throw new Error('Vehicle positions response exceeds the supported limit');
  }

  return value.positions.map(readBusVehiclePosition);
}

function readBusVehiclePosition(value: unknown): BusVehiclePosition {
  if (!isRecord(value)) throw new Error('Invalid vehicle position');

  const plate = readText(value.plate, MAX_PLATE_LENGTH);
  const latitude = readCoordinate(value.latitude, -90, 90);
  const longitude = readCoordinate(value.longitude, -180, 180);
  const recordedAt = readText(value.recordedAt, 64);
  if (!Number.isFinite(Date.parse(recordedAt))) {
    throw new Error('Invalid vehicle position timestamp');
  }

  const destination =
    value.destination === undefined || value.destination === ''
      ? undefined
      : readText(value.destination, 120);

  return {
    plate,
    latitude,
    longitude,
    recordedAt,
    ...(destination ? { destination } : {}),
  };
}

function readCoordinate(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error('Invalid vehicle position coordinate');
  }
  return value;
}

function readText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid vehicle position text');
  }
  const text = value.trim();
  if (!text || text.length > maxLength || hasControlCharacters(text)) {
    throw new Error('Invalid vehicle position text');
  }
  return text;
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
