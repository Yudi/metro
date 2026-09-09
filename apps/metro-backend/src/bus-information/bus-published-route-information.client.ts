import { ChannelCredentials, Client, ServiceError } from '@grpc/grpc-js';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PublishedDayKind,
  PublishedRouteDirection,
  PublishedRouteInformation,
  PublishedServiceDay,
} from '@metro/shared/bus-itinerary-contracts';
import { loadBusItineraryGrpcDefinition } from '@metro/shared/bus-itinerary-contracts/grpc';
import { RAIL_INTEGRATION_GRPC_DEFAULT_CLIENT_URL } from '@metro/rail-integration-contracts';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ROUTE_CODE_LENGTH = 128;
const MAX_DAYS = 3;
const MAX_DIRECTIONS_PER_DAY = 20;
const MAX_DEPARTURES_PER_DIRECTION = 2_000;
const MAX_STREETS_PER_DIRECTION = 2_000;
const MAX_NOTICES_PER_STREET = 10;
const MAX_NOTICE_LENGTH = 2_000;
const MAX_TRAVEL_TIMES_PER_DIRECTION = 10;
const MAX_TEXT_LENGTH = 1_000;

const DAY_KINDS = new Set<PublishedDayKind>(['weekday', 'saturday', 'sunday']);
const PERIODS = new Set(['morning', 'interpeak', 'afternoon']);
const STATUS = new Set(['AVAILABLE', 'UNAVAILABLE', 'NOT_FOUND']);

@Injectable()
export class BusPublishedRouteInformationClient implements OnModuleDestroy {
  private readonly logger = new Logger(BusPublishedRouteInformationClient.name);
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

  async fetch(routeCode: string): Promise<PublishedRouteInformation> {
    try {
      const result = parsePublishedRouteInformation(
        await this.invoke({ routeCode }),
      );
      if (result.routeCode !== routeCode) {
        throw new Error('Published route code does not match request');
      }
      return result;
    } catch (error) {
      const category = error instanceof Error ? error.name : typeof error;
      this.logger.warn(
        `Published route information request failed (${category})`,
      );
      throw error;
    }
  }

  private invoke(request: { routeCode: string }): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.client.getPublishedRouteInformation(
        request,
        { deadline: new Date(Date.now() + REQUEST_TIMEOUT_MS) },
        (error, response) => {
          if (error) {
            reject(error);
            return;
          }
          if (response === undefined) {
            reject(new Error('Empty published route information response'));
            return;
          }
          resolve(response);
        },
      );
    });
  }
}

interface BusItineraryGrpcClient extends Client {
  getPublishedRouteInformation(
    request: { routeCode: string },
    options: { deadline: Date },
    callback: (error: ServiceError | null, response?: unknown) => void,
  ): unknown;
}

function parsePublishedRouteInformation(
  value: unknown,
): PublishedRouteInformation {
  if (!isRecord(value)) throw new Error('Invalid published route response');

  const status = readEnum(value.status, STATUS);
  const routeCode = readText(value.routeCode, MAX_ROUTE_CODE_LENGTH);
  const lastUpdated = readNullableText(value.lastUpdated, MAX_TEXT_LENGTH);
  if (lastUpdated !== null && !Number.isFinite(Date.parse(lastUpdated))) {
    throw new Error('Invalid published route lastUpdated');
  }

  const days = readArray(value.days, MAX_DAYS).map(readPublishedServiceDay);
  return {
    status: status as PublishedRouteInformation['status'],
    routeCode,
    lastUpdated,
    operatorName: readNullableText(value.operatorName, MAX_TEXT_LENGTH),
    consortiumName: readNullableText(value.consortiumName, MAX_TEXT_LENGTH),
    days,
  };
}

function readPublishedServiceDay(value: unknown): PublishedServiceDay {
  if (!isRecord(value)) throw new Error('Invalid published service day');
  return {
    kind: readEnum(value.kind, DAY_KINDS) as PublishedDayKind,
    directions: readArray(value.directions, MAX_DIRECTIONS_PER_DAY).map(
      readPublishedDirection,
    ),
  };
}

function readPublishedDirection(value: unknown): PublishedRouteDirection {
  if (!isRecord(value)) throw new Error('Invalid published route direction');
  const departures = readArray(
    value.departures,
    MAX_DEPARTURES_PER_DIRECTION,
  ).map((departure) => readServiceTime(departure, false));
  const streets = readArray(value.streets, MAX_STREETS_PER_DIRECTION).map(
    (street) => {
      if (!isRecord(street)) throw new Error('Invalid published street');
      return {
        name: readText(street.name, MAX_TEXT_LENGTH),
        number: readStreetNumber(street.number),
        notices: readArray(street.notices ?? [], MAX_NOTICES_PER_STREET).map(
          readNoticeText,
        ),
      };
    },
  );
  const travelTimes = readArray(
    value.travelTimes,
    MAX_TRAVEL_TIMES_PER_DIRECTION,
  ).map((travelTime) => {
    if (!isRecord(travelTime)) {
      throw new Error('Invalid published travel time');
    }
    const period = readEnum(travelTime.period, PERIODS);
    const minutes = readInteger(travelTime.minutes, 0, 24 * 60);
    return {
      period:
        period as PublishedRouteDirection['travelTimes'][number]['period'],
      minutes,
    };
  });

  return {
    id: readText(value.id, MAX_TEXT_LENGTH),
    headsign: readText(value.headsign, MAX_TEXT_LENGTH),
    departures,
    streets,
    travelTimes,
    startTime: readServiceTime(value.startTime, true),
    endTime: readServiceTime(value.endTime, true),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readArray(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error('Invalid published route list');
  }
  return value;
}

function readEnum(value: unknown, allowed: Set<string>): string {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error('Invalid published route enum');
  }
  return value;
}

function readText(value: unknown, maxLength: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maxLength ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error('Invalid published route text');
  }
  return value.trim();
}

function readNullableText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined || value === '') return null;
  return readText(value, maxLength);
}

function readStreetNumber(value: unknown): string {
  if (value === '') return '';
  return readText(value, MAX_TEXT_LENGTH);
}

function readNoticeText(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > MAX_NOTICE_LENGTH ||
    [...value].some(
      (character) =>
        (character.charCodeAt(0) < 32 &&
          character !== '\n' &&
          character !== '\r' &&
          character !== '\t') ||
        character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error('Invalid published route notice');
  }
  return value.trim();
}

function readServiceTime(value: unknown, nullable: true): string | null;
function readServiceTime(value: unknown, nullable: false): string;
function readServiceTime(value: unknown, nullable: boolean): string | null {
  if (nullable && (value === null || value === undefined || value === '')) {
    return null;
  }
  const text = readText(value, 32);
  const match = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(text);
  if (!match || Number(match[1]) > 99) {
    throw new Error('Invalid published route time');
  }
  return text;
}

function readInteger(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error('Invalid published route number');
  }
  return value;
}
