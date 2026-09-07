import {
  Prisma,
  historical_incident_event_type,
} from '../../generated/prisma/client';
import {
  getRailLineByCode,
  isActualCptmLine,
  isKnownRailLineCode,
  isSpecialCptmLine,
  getStationName as getStaticStationName,
} from '@metro/shared/utils';
import type {
  DirectionHeadway,
  ExtendedNextTrainLineCode,
  NextTrainLineCode,
  StationHeadway,
  RailStatusCode,
} from '@metro/shared/utils';
import type { RailLine } from '../rail/entities/rail-line-status.entity';
import { HistoricalDataFilterInput } from './dto/historical-data.input';
import { HeadwayCalculationSamples } from './historical.types';

export const DEFAULT_HISTORY_LIMIT = 100;
export const MAX_HISTORY_LIMIT = 500;
export const BACKEND_LIFECYCLE_SOURCE = 'backend_lifecycle';
export const RAIL_STATUS_SOURCE = 'rail_status';

const NON_INCIDENT_RAIL_STATUS_CODES = new Set<RailStatusCode>([
  'OperacaoNormal',
  'OperacaoTransitoria',
  'OperacaoEspecial',
  'OperacaoDiferenciada',
  'OperacaoEncerrada',
]);

export function buildIncidentWhere(
  filter?: HistoricalDataFilterInput,
): Prisma.HistoricalIncidentEventWhereInput {
  return compactWhere<Prisma.HistoricalIncidentEventWhereInput>({
    observedAt: buildDateFilter(filter),
    eventType: filter?.eventTypes?.length
      ? { in: filter.eventTypes as historical_incident_event_type[] }
      : undefined,
    source: filter?.sources?.length ? { in: filter.sources } : undefined,
    lineCode: filter?.lineCodes?.length ? { in: filter.lineCodes } : undefined,
    lineNumber: filter?.lineNumbers?.length
      ? { in: filter.lineNumbers }
      : undefined,
    statusCode: filter?.statusCodes?.length
      ? { in: filter.statusCodes }
      : undefined,
  });
}

export function buildHeadwayWhere(
  filter?: HistoricalDataFilterInput,
): Prisma.HistoricalHeadwaySnapshotWhereInput {
  return compactWhere<Prisma.HistoricalHeadwaySnapshotWhereInput>({
    observedAt: buildDateFilter(filter),
    source: filter?.sources?.length ? { in: filter.sources } : undefined,
    lineCode: filter?.lineCodes?.length ? { in: filter.lineCodes } : undefined,
    stationCode: filter?.stationCodes?.length
      ? { in: filter.stationCodes }
      : undefined,
    stationName: filter?.stationNames?.length
      ? { in: filter.stationNames }
      : undefined,
    direction: filter?.directions?.length
      ? { in: filter.directions }
      : undefined,
  });
}

export function buildDateFilter(
  filter?: HistoricalDataFilterInput,
): Prisma.DateTimeFilter | undefined {
  if (!filter?.from && !filter?.to) {
    return undefined;
  }

  return compactWhere<Prisma.DateTimeFilter>({
    gte: filter.from,
    lte: filter.to,
  });
}

export function clampHistoryLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_HISTORY_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_HISTORY_LIMIT);
}

export function countsRailStatusAsIncident(
  statusCode: RailStatusCode,
): boolean {
  return !NON_INCIDENT_RAIL_STATUS_CODES.has(statusCode);
}

export function getRailSeverity(line: RailLine): string {
  if (line.statusCode === 'DadosIndisponiveis') {
    return 'unavailable';
  }

  switch (line.statusColor) {
    case 'vermelho':
      return 'critical';
    case 'amarelo':
      return 'warning';
    case 'cinza':
      return 'closed';
    case 'verde':
    default:
      return 'normal';
  }
}

export function buildRailEventData(
  line: RailLine,
  metadata: Prisma.InputJsonValue | undefined,
  getRequiredRailAgency: (lineCode: string | number) => string,
): Omit<Prisma.HistoricalIncidentEventCreateInput, 'eventType' | 'title'> {
  return {
    observedAt: new Date(),
    source: RAIL_STATUS_SOURCE,
    provider: 'merged_rail_status',
    lineCode: `L${line.code}`,
    lineNumber: line.code,
    lineName: line.line,
    agency: getRequiredRailAgency(line.code),
    statusCode: line.statusCode,
    statusLabel: line.statusLabel,
    statusColor: line.statusColor,
    severity: getRailSeverity(line),
    description: line.description,
    incidentCategory: line.incidentCategory,
    detail: line.detail,
    metadata,
  };
}

export function buildHeadwaySnapshotData(
  headway: StationHeadway,
  direction: DirectionHeadway,
  samples: HeadwayCalculationSamples | undefined,
  stationName: string | undefined,
  getRequiredRailAgency: (lineCode: string | number) => string,
): Prisma.HistoricalHeadwaySnapshotCreateManyInput {
  return {
    observedAt: new Date(headway.updatedAt),
    lineCode: headway.lineCode,
    agency: getRequiredRailAgency(headway.lineCode),
    stationCode: headway.stationCode,
    stationName,
    direction: direction.direction,
    averageSeconds: direction.averageSeconds,
    sampleCount: direction.sampleCount,
    bucket: direction.bucket,
    bucketLabel: direction.bucketLabel,
    isFallback: direction.isFallback ?? false,
    samples: samples ? buildHeadwaySamplesJson(samples) : undefined,
    source: 'headway_tracking',
    metadata: compactJsonObject({
      updatedAt: new Date(headway.updatedAt).toISOString(),
    }),
  };
}

export function buildHeadwaySamplesJson(
  samples: HeadwayCalculationSamples,
): Prisma.InputJsonObject {
  return compactJsonObject({
    method: 'intervals_between_detected_passages',
    intervalsSeconds: samples.intervalsSeconds,
    intervalCount: samples.intervalsSeconds.length,
    discardedIntervalCount: samples.discardedIntervalCount,
    minimumIntervals: samples.minimumIntervals,
    maximumPassages: samples.maximumPassages,
    targetBucket: samples.targetBucket,
    selectedBucket: samples.selectedBucket,
  });
}

export function errorToJsonObject(error: unknown): Prisma.InputJsonObject {
  if (error instanceof Error) {
    return compactJsonObject({
      name: error.name,
      message: error.message,
    });
  }

  return { message: String(error) };
}

export function sanitizeIncidentMetadata(
  value: Prisma.JsonValue | null,
): unknown {
  return pickPublicJsonFields(value, [
    'attemptedAt',
    'detectionReason',
    'reason',
  ]);
}

export function sanitizeHeadwayMetadata(
  value: Prisma.JsonValue | null,
): unknown {
  return pickPublicJsonFields(value, ['updatedAt', 'minSamples']);
}

export function sanitizeHeadwayErrors(value: Prisma.JsonValue | null): unknown {
  return pickPublicJsonFields(value, ['reason']);
}

export function pickPublicJsonFields(
  value: Prisma.JsonValue | null,
  allowedFields: string[],
): Prisma.InputJsonObject | undefined {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return undefined;
  }

  const output: Record<string, Prisma.InputJsonValue> = {};
  for (const field of allowedFields) {
    const candidate = value[field];
    if (
      typeof candidate === 'string' ||
      typeof candidate === 'number' ||
      typeof candidate === 'boolean'
    ) {
      output[field] =
        typeof candidate === 'string' ? candidate.slice(0, 256) : candidate;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

export function compactJsonObject(
  input: Record<string, Prisma.InputJsonValue | undefined>,
): Prisma.InputJsonObject {
  const output: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

export function compactWhere<T extends object>(input: Partial<T>): T {
  const output: Partial<T> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key as keyof T] = value as T[keyof T];
    }
  }
  return output as T;
}

export function isExternalRailLine(
  lineCode: string,
): lineCode is ExtendedNextTrainLineCode {
  return isActualCptmLine(lineCode) || isSpecialCptmLine(lineCode);
}

export function isStaticNextTrainLine(
  lineCode: string,
): lineCode is NextTrainLineCode {
  return lineCode === 'L4' || lineCode === 'L8' || lineCode === 'L9';
}

export function getStaticHistoricalStationName(
  lineCode: string,
  stationCode: string,
): string | undefined {
  return isStaticNextTrainLine(lineCode)
    ? getStaticStationName(lineCode, stationCode)
    : undefined;
}

export function parseRailLineNumber(lineCode: string): number | undefined {
  const match = lineCode.match(/L?(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

export function getRailAgency(lineCode: string | number): string | undefined {
  const lineNumber =
    typeof lineCode === 'number' ? lineCode : parseRailLineNumber(lineCode);
  return lineNumber === undefined
    ? undefined
    : getRailLineByCode(lineNumber)?.agency;
}

export function isKnownHistoricalRailLine(line: RailLine): boolean {
  return isKnownRailLineCode(line.code);
}

export async function withHeadwayStationNames<
  T extends {
    lineCode: string;
    stationCode: string;
    stationName?: string | null;
  },
>(
  snapshots: T[],
  resolveStationName: (
    lineCode: string,
    stationCode: string,
  ) => Promise<string | undefined>,
): Promise<T[]> {
  const missingStationNames = new Map<string, T>();
  for (const snapshot of snapshots) {
    if (snapshot.stationName) continue;
    missingStationNames.set(
      `${snapshot.lineCode}:${snapshot.stationCode}`,
      snapshot,
    );
  }

  if (missingStationNames.size === 0) {
    return snapshots;
  }

  const resolvedNames = new Map<string, string | undefined>();
  await Promise.all(
    [...missingStationNames.keys()].map(async (key) => {
      const [lineCode, stationCode] = key.split(':') as [string, string];
      resolvedNames.set(key, await resolveStationName(lineCode, stationCode));
    }),
  );

  return snapshots.map((snapshot) => ({
    ...snapshot,
    stationName:
      snapshot.stationName ??
      resolvedNames.get(`${snapshot.lineCode}:${snapshot.stationCode}`) ??
      null,
  }));
}
