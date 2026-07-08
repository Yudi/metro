import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Prisma,
  historical_incident_event_type,
} from '../../generated/prisma/client';
import {
  getRailLineByCode,
  getStationName as getStaticStationName,
  isKnownRailLineCode,
  isActualCptmLine,
  isSpecialCptmLine,
} from '@metro/shared/utils';
import type {
  DirectionHeadway,
  ExtendedNextTrainLineCode,
  NextTrainLineCode,
  StationHeadway,
} from '@metro/shared/utils';
import type { RailStatusCode } from '@metro/shared/utils';
import { RailRealtimeSourcePort } from '@metro/rail-integration-contracts';
import type { RailLine } from '../rail/entities/rail-line-status.entity';
import { HistoricalDataFilterInput } from './dto/historical-data.input';
import {
  HistoricalDataEntity,
  HistoricalIncidentEventType,
} from './entities/historical-data.entity';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordRetrievalIssueParams {
  source: string;
  attemptedAt: Date;
}

export interface RecordRetrievalRecoveredParams {
  source: string;
  recoveredAt: Date;
}

export interface RecordHeadwayErrorParams {
  lineCode: string;
  stationCode: string;
  direction?: string;
  source?: string;
  observedAt?: Date;
  sampleCount?: number;
  bucket?: string;
  bucketLabel?: string;
  reason: string;
  error?: unknown;
  metadata?: Prisma.InputJsonValue;
}

export interface HeadwayCalculationSamples {
  intervalsSeconds: number[];
  discardedIntervalCount: number;
  minimumIntervals: number;
  maximumPassages: number;
  targetBucket?: string;
  selectedBucket?: string;
}

const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 500;
const BACKEND_LIFECYCLE_SOURCE = 'backend_lifecycle';
const RAIL_STATUS_SOURCE = 'rail_status';
const NON_INCIDENT_RAIL_STATUS_CODES = new Set<RailStatusCode>([
  'OperacaoNormal',
  'OperacaoTransitoria',
  'OperacaoEspecial',
  'OperacaoDiferenciada',
  'OperacaoEncerrada',
]);

@Injectable()
export class HistoricalService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HistoricalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalRailProvider: RailRealtimeSourcePort,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recordBackendStartup();
  }

  async onModuleDestroy(): Promise<void> {
    await this.recordBackendOffline('graceful_shutdown');
  }

  async getHistoricalData(
    filter?: HistoricalDataFilterInput,
    limit = DEFAULT_HISTORY_LIMIT,
    offset = 0,
  ): Promise<HistoricalDataEntity> {
    const take = this.clampLimit(limit);
    const skip = Math.max(0, offset);
    const includeIncidents = filter?.includeIncidents ?? true;
    const includeHeadway = filter?.includeHeadway ?? true;

    const [incidents, headwaySnapshots] = await Promise.all([
      includeIncidents
        ? this.prisma.historicalIncidentEvent.findMany({
            where: this.buildIncidentWhere(filter),
            orderBy: { observedAt: 'desc' },
            take,
            skip,
          })
        : Promise.resolve([]),
      includeHeadway
        ? this.prisma.historicalHeadwaySnapshot.findMany({
            where: this.buildHeadwayWhere(filter),
            orderBy: { observedAt: 'desc' },
            take,
            skip,
          })
        : Promise.resolve([]),
    ]);

    const enrichedHeadwaySnapshots =
      await this.withHeadwayStationNames(headwaySnapshots);

    return {
      incidents: incidents.map((event) => ({
        ...event,
        eventType: event.eventType as HistoricalIncidentEventType,
        metadata: event.metadata ?? undefined,
      })),
      headwaySnapshots: enrichedHeadwaySnapshots.map((snapshot) => ({
        ...snapshot,
        samples: snapshot.samples ?? undefined,
        errors: snapshot.errors ?? undefined,
        metadata: snapshot.metadata ?? undefined,
      })),
    };
  }

  async recordRailStatusObservations(
    lines: RailLine[],
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    const knownLines = lines.filter((line) => isKnownRailLineCode(line.code));

    await this.runSafely('record rail status history', async () => {
      await Promise.all(
        knownLines.map((line) =>
          this.recordRailStatusObservation(line, metadata),
        ),
      );
    });
  }

  async recordRetrievalIssue(
    params: RecordRetrievalIssueParams,
  ): Promise<void> {
    await this.runSafely('record retrieval issue', async () => {
      const openIssue = await this.findOpenRetrievalIssue(params.source);
      if (openIssue) {
        return;
      }

      await this.prisma.historicalIncidentEvent.create({
        data: {
          eventType: historical_incident_event_type.RETRIEVAL_ISSUE,
          observedAt: params.attemptedAt,
          startedAt: params.attemptedAt,
          source: params.source,
          severity: 'critical',
          title: 'Falha na recuperação de dados externos',
          description:
            'A recuperação de dados externos falhou temporariamente.',
          metadata: this.compactJsonObject({
            attemptedAt: params.attemptedAt.toISOString(),
          }),
        },
      });
    });
  }

  async recordRetrievalRecovered(
    params: RecordRetrievalRecoveredParams,
  ): Promise<void> {
    await this.runSafely('record retrieval recovery', async () => {
      const openIssue = await this.findOpenRetrievalIssue(params.source);
      if (!openIssue) {
        return;
      }

      const startedAt = openIssue.startedAt ?? openIssue.observedAt;

      await this.prisma.historicalIncidentEvent.update({
        where: { id: openIssue.id },
        data: {
          endedAt: params.recoveredAt,
          durationSeconds: Math.max(
            0,
            Math.round(
              (params.recoveredAt.getTime() - startedAt.getTime()) / 1000,
            ),
          ),
        },
      });
    });
  }

  async recordHeadwayResult(
    headway: StationHeadway,
    samplesByDirection = new Map<string, HeadwayCalculationSamples>(),
  ): Promise<void> {
    await this.runSafely('record headway snapshots', async () => {
      const stationName = await this.resolveStationName(
        headway.lineCode,
        headway.stationCode,
      );

      await this.prisma.historicalHeadwaySnapshot.createMany({
        data: headway.directions.map((direction) =>
          this.buildHeadwaySnapshotData(
            headway,
            direction,
            samplesByDirection.get(direction.direction),
            stationName,
          ),
        ),
      });
    });
  }

  async recordHeadwayError(params: RecordHeadwayErrorParams): Promise<void> {
    await this.runSafely('record headway error snapshot', async () => {
      await this.prisma.historicalHeadwaySnapshot.create({
        data: {
          observedAt: params.observedAt ?? new Date(),
          lineCode: params.lineCode,
          agency: this.getRequiredRailAgency(params.lineCode),
          stationCode: params.stationCode,
          stationName: await this.resolveStationName(
            params.lineCode,
            params.stationCode,
          ),
          direction: params.direction ?? 'unknown',
          sampleCount: params.sampleCount,
          bucket: params.bucket,
          bucketLabel: params.bucketLabel,
          source: params.source ?? 'headway_tracking',
          errors: this.compactJsonObject({
            reason: params.reason,
            error: params.error
              ? this.errorToJsonObject(params.error)
              : undefined,
          }),
          metadata: params.metadata,
        },
      });
    });
  }

  private async recordBackendStartup(): Promise<void> {
    await this.runSafely('record backend startup', async () => {
      await this.recordDetectedOfflineGap();

      await this.prisma.historicalIncidentEvent.create({
        data: {
          eventType: historical_incident_event_type.BACKEND_ONLINE,
          observedAt: new Date(),
          source: BACKEND_LIFECYCLE_SOURCE,
          severity: 'normal',
          title: 'Backend online',
          metadata: this.compactJsonObject({
            pid: process.pid,
            nodeEnv: process.env.NODE_ENV,
          }),
        },
      });
    });
  }

  private findOpenRetrievalIssue(source: string) {
    return this.prisma.historicalIncidentEvent.findFirst({
      where: {
        source,
        eventType: historical_incident_event_type.RETRIEVAL_ISSUE,
        endedAt: null,
      },
      orderBy: { observedAt: 'desc' },
    });
  }

  private async recordDetectedOfflineGap(): Promise<void> {
    const latestLifecycleEvent =
      await this.prisma.historicalIncidentEvent.findFirst({
        where: {
          source: BACKEND_LIFECYCLE_SOURCE,
          eventType: {
            in: [
              historical_incident_event_type.BACKEND_ONLINE,
              historical_incident_event_type.BACKEND_OFFLINE,
              historical_incident_event_type.BACKEND_OFFLINE_DETECTED,
            ],
          },
        },
        orderBy: { observedAt: 'desc' },
      });

    if (
      !latestLifecycleEvent ||
      latestLifecycleEvent.eventType !==
        historical_incident_event_type.BACKEND_ONLINE
    ) {
      return;
    }

    const observedAt = new Date();
    const durationSeconds = Math.max(
      0,
      Math.round(
        (observedAt.getTime() - latestLifecycleEvent.observedAt.getTime()) /
          1000,
      ),
    );

    await this.prisma.historicalIncidentEvent.create({
      data: {
        eventType: historical_incident_event_type.BACKEND_OFFLINE_DETECTED,
        observedAt,
        startedAt: latestLifecycleEvent.observedAt,
        endedAt: observedAt,
        durationSeconds,
        source: BACKEND_LIFECYCLE_SOURCE,
        severity: 'warning',
        title: 'Backend possivelmente ficou offline',
        description:
          'O processo anterior não registrou um desligamento limpo antes desta inicialização.',
        metadata: this.compactJsonObject({
          previousOnlineEventId: latestLifecycleEvent.id,
          detectionReason: 'previous_online_without_offline_event',
        }),
      },
    });
  }

  private async recordBackendOffline(reason: string): Promise<void> {
    await this.runSafely('record backend offline', async () => {
      await this.prisma.historicalIncidentEvent.create({
        data: {
          eventType: historical_incident_event_type.BACKEND_OFFLINE,
          observedAt: new Date(),
          source: BACKEND_LIFECYCLE_SOURCE,
          severity: 'warning',
          title: 'Backend offline',
          description: reason,
          metadata: this.compactJsonObject({
            pid: process.pid,
            reason,
          }),
        },
      });
    });
  }

  private async recordRailStatusObservation(
    line: RailLine,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    const lineCode = `L${line.code}`;
    const latestEvent = await this.prisma.historicalIncidentEvent.findFirst({
      where: {
        source: RAIL_STATUS_SOURCE,
        lineCode,
        eventType: {
          in: [
            historical_incident_event_type.RAIL_STATUS_INCIDENT,
            historical_incident_event_type.RAIL_STATUS_RECOVERED,
          ],
        },
      },
      orderBy: { observedAt: 'desc' },
    });

    const countsAsIncident = this.countsRailStatusAsIncident(line.statusCode);
    const eventType = countsAsIncident
      ? historical_incident_event_type.RAIL_STATUS_INCIDENT
      : historical_incident_event_type.RAIL_STATUS_RECOVERED;

    const changed =
      !latestEvent ||
      latestEvent.eventType !== eventType ||
      latestEvent.statusCode !== line.statusCode ||
      latestEvent.description !== (line.description ?? null) ||
      latestEvent.incidentCategory !== (line.incidentCategory ?? null) ||
      latestEvent.detail !== (line.detail ?? null);

    if (!changed) {
      return;
    }

    const recoveredFromIncident =
      latestEvent?.eventType ===
        historical_incident_event_type.RAIL_STATUS_INCIDENT &&
      eventType === historical_incident_event_type.RAIL_STATUS_RECOVERED;

    await this.prisma.historicalIncidentEvent.create({
      data: {
        ...this.buildRailEventData(line, metadata),
        eventType,
        title: recoveredFromIncident
          ? `${line.line}: operação recuperada`
          : `${line.line}: ${line.statusLabel}`,
        startedAt: recoveredFromIncident ? latestEvent.observedAt : undefined,
        endedAt: recoveredFromIncident ? new Date() : undefined,
        durationSeconds: recoveredFromIncident
          ? Math.max(
              0,
              Math.round((Date.now() - latestEvent.observedAt.getTime()) / 1000),
            )
          : undefined,
      },
    });
  }

  private countsRailStatusAsIncident(statusCode: RailStatusCode): boolean {
    return !NON_INCIDENT_RAIL_STATUS_CODES.has(statusCode);
  }

  private buildRailEventData(
    line: RailLine,
    metadata?: Prisma.InputJsonValue,
  ): Omit<Prisma.HistoricalIncidentEventCreateInput, 'eventType' | 'title'> {
    return {
      observedAt: new Date(),
      source: RAIL_STATUS_SOURCE,
      provider: 'merged_rail_status',
      lineCode: `L${line.code}`,
      lineNumber: line.code,
      lineName: line.line,
      agency: this.getRequiredRailAgency(line.code),
      statusCode: line.statusCode,
      statusLabel: line.statusLabel,
      statusColor: line.statusColor,
      severity: this.getRailSeverity(line),
      description: line.description,
      incidentCategory: line.incidentCategory,
      detail: line.detail,
      metadata,
    };
  }

  private buildHeadwaySnapshotData(
    headway: StationHeadway,
    direction: DirectionHeadway,
    samples?: HeadwayCalculationSamples,
    stationName?: string,
  ): Prisma.HistoricalHeadwaySnapshotCreateManyInput {
    return {
      observedAt: new Date(headway.updatedAt),
      lineCode: headway.lineCode,
      agency: this.getRequiredRailAgency(headway.lineCode),
      stationCode: headway.stationCode,
      stationName,
      direction: direction.direction,
      averageSeconds: direction.averageSeconds,
      sampleCount: direction.sampleCount,
      bucket: direction.bucket,
      bucketLabel: direction.bucketLabel,
      isFallback: direction.isFallback ?? false,
      samples: samples ? this.buildHeadwaySamplesJson(samples) : undefined,
      source: 'headway_tracking',
      metadata: this.compactJsonObject({
        updatedAt: new Date(headway.updatedAt).toISOString(),
      }),
    };
  }

  private buildHeadwaySamplesJson(
    samples: HeadwayCalculationSamples,
  ): Prisma.InputJsonObject {
    return this.compactJsonObject({
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

  private buildIncidentWhere(
    filter?: HistoricalDataFilterInput,
  ): Prisma.HistoricalIncidentEventWhereInput {
    return this.compactWhere<Prisma.HistoricalIncidentEventWhereInput>({
      observedAt: this.buildDateFilter(filter),
      eventType: filter?.eventTypes?.length
        ? { in: filter.eventTypes as historical_incident_event_type[] }
        : undefined,
      source: filter?.sources?.length ? { in: filter.sources } : undefined,
      lineCode: filter?.lineCodes?.length
        ? { in: filter.lineCodes }
        : undefined,
      lineNumber: filter?.lineNumbers?.length
        ? { in: filter.lineNumbers }
        : undefined,
      statusCode: filter?.statusCodes?.length
        ? { in: filter.statusCodes }
        : undefined,
    });
  }

  private buildHeadwayWhere(
    filter?: HistoricalDataFilterInput,
  ): Prisma.HistoricalHeadwaySnapshotWhereInput {
    return this.compactWhere<Prisma.HistoricalHeadwaySnapshotWhereInput>({
      observedAt: this.buildDateFilter(filter),
      source: filter?.sources?.length ? { in: filter.sources } : undefined,
      lineCode: filter?.lineCodes?.length
        ? { in: filter.lineCodes }
        : undefined,
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

  private buildDateFilter(
    filter?: HistoricalDataFilterInput,
  ): Prisma.DateTimeFilter | undefined {
    if (!filter?.from && !filter?.to) {
      return undefined;
    }

    return this.compactWhere<Prisma.DateTimeFilter>({
      gte: filter.from,
      lte: filter.to,
    });
  }

  private clampLimit(limit: number): number {
    if (!Number.isFinite(limit)) {
      return DEFAULT_HISTORY_LIMIT;
    }
    return Math.min(Math.max(Math.trunc(limit), 1), MAX_HISTORY_LIMIT);
  }

  private getRailSeverity(line: RailLine): string {
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

  private errorToJsonObject(error: unknown): Prisma.InputJsonObject {
    if (error instanceof Error) {
      return this.compactJsonObject({
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    }

    return {
      message: String(error),
    };
  }

  private compactJsonObject(
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

  private compactWhere<T extends object>(input: Partial<T>): T {
    const output: Partial<T> = {};

    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        output[key as keyof T] = value as T[keyof T];
      }
    }

    return output as T;
  }

  private async withHeadwayStationNames<
    T extends { lineCode: string; stationCode: string; stationName?: string | null },
  >(snapshots: T[]): Promise<T[]> {
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
        resolvedNames.set(
          key,
          await this.resolveStationName(lineCode, stationCode),
        );
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

  private async resolveStationName(
    lineCode: string,
    stationCode: string,
  ): Promise<string | undefined> {
    if (this.isExternalRailLine(lineCode)) {
      try {
        return await this.externalRailProvider.getStationName(
          lineCode,
          stationCode,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to resolve station name for ${lineCode}:${stationCode}: ${message}`,
        );
      }
    }

    if (this.isStaticNextTrainLine(lineCode)) {
      return getStaticStationName(lineCode, stationCode);
    }

    return undefined;
  }

  private isExternalRailLine(
    lineCode: string,
  ): lineCode is ExtendedNextTrainLineCode {
    return isActualCptmLine(lineCode) || isSpecialCptmLine(lineCode);
  }

  private isStaticNextTrainLine(lineCode: string): lineCode is NextTrainLineCode {
    return lineCode === 'L4' || lineCode === 'L8' || lineCode === 'L9';
  }

  private getRequiredRailAgency(lineCode: string | number): string {
    const lineNumber =
      typeof lineCode === 'number'
        ? lineCode
        : this.parseRailLineNumber(lineCode);
    const agency =
      lineNumber === undefined
        ? undefined
        : getRailLineByCode(lineNumber)?.agency;

    if (!agency) {
      throw new Error(`No transit agency configured for line ${lineCode}`);
    }

    return agency;
  }

  private parseRailLineNumber(lineCode: string): number | undefined {
    const match = lineCode.match(/L?(\d+)/i);
    return match ? Number.parseInt(match[1], 10) : undefined;
  }

  private async runSafely(
    action: string,
    callback: () => Promise<void>,
  ): Promise<void> {
    try {
      await callback();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to ${action}: ${message}`);
    }
  }
}
