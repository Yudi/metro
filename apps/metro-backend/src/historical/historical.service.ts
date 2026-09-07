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
import type { StationHeadway } from '@metro/shared/utils';
import { RailRealtimeSourcePort } from '@metro/rail-integration-contracts';
import type { RailLine } from '../rail/entities/rail-line-status.entity';
import { HistoricalDataFilterInput } from './dto/historical-data.input';
import {
  HistoricalDataEntity,
  HistoricalIncidentEventType,
} from './entities/historical-data.entity';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'node:crypto';
import type {
  HeadwayCalculationSamples,
  RecordHeadwayErrorParams,
  RecordRetrievalIssueParams,
  RecordRetrievalRecoveredParams,
} from './historical.types';
import {
  BACKEND_LIFECYCLE_SOURCE,
  DEFAULT_HISTORY_LIMIT,
  RAIL_STATUS_SOURCE,
  buildHeadwaySnapshotData,
  buildHeadwayWhere,
  buildIncidentWhere,
  buildRailEventData,
  clampHistoryLimit,
  compactJsonObject,
  countsRailStatusAsIncident,
  errorToJsonObject,
  getRailAgency,
  getStaticHistoricalStationName,
  isExternalRailLine,
  isKnownHistoricalRailLine,
  sanitizeHeadwayErrors,
  sanitizeHeadwayMetadata,
  sanitizeIncidentMetadata,
  withHeadwayStationNames,
} from './historical-data.utils';

export type {
  HeadwayCalculationSamples,
  RecordHeadwayErrorParams,
  RecordRetrievalIssueParams,
  RecordRetrievalRecoveredParams,
} from './historical.types';

@Injectable()
export class HistoricalService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HistoricalService.name);
  private readonly backendInstanceSource = `${BACKEND_LIFECYCLE_SOURCE}:${
    process.env.INSTANCE_ID?.trim() ||
    (process.env.HOSTNAME?.trim()
      ? `${process.env.HOSTNAME.trim()}:${process.env.PORT ?? '3000'}`
      : randomUUID())
  }`;

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
    const take = clampHistoryLimit(limit);
    const skip = Math.max(0, offset);
    const includeIncidents = filter?.includeIncidents ?? true;
    const includeHeadway = filter?.includeHeadway ?? true;

    const [incidents, headwaySnapshots] = await Promise.all([
      includeIncidents
        ? this.prisma.historicalIncidentEvent.findMany({
            where: buildIncidentWhere(filter),
            orderBy: { observedAt: 'desc' },
            take,
            skip,
          })
        : Promise.resolve([]),
      includeHeadway
        ? this.prisma.historicalHeadwaySnapshot.findMany({
            where: buildHeadwayWhere(filter),
            orderBy: { observedAt: 'desc' },
            take,
            skip,
          })
        : Promise.resolve([]),
    ]);

    const enrichedHeadwaySnapshots = await withHeadwayStationNames(
      headwaySnapshots,
      this.resolveStationName.bind(this),
    );

    return {
      incidents: incidents.map((event) => ({
        ...event,
        eventType: event.eventType as HistoricalIncidentEventType,
        metadata: sanitizeIncidentMetadata(event.metadata),
      })),
      headwaySnapshots: enrichedHeadwaySnapshots.map((snapshot) => ({
        ...snapshot,
        samples: snapshot.samples ?? undefined,
        errors: sanitizeHeadwayErrors(snapshot.errors),
        metadata: sanitizeHeadwayMetadata(snapshot.metadata),
      })),
    };
  }

  async recordRailStatusObservations(
    lines: RailLine[],
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    const knownLines = lines.filter(isKnownHistoricalRailLine);

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
      await this.withIncidentLock(`retrieval:${params.source}`, async (tx) => {
        const openIssue = await this.findOpenRetrievalIssue(params.source, tx);
        if (openIssue) {
          return;
        }

        await tx.historicalIncidentEvent.create({
          data: {
            eventType: historical_incident_event_type.RETRIEVAL_ISSUE,
            observedAt: params.attemptedAt,
            startedAt: params.attemptedAt,
            source: params.source,
            severity: 'critical',
            title: 'Falha na recuperação de dados externos',
            description:
              'A recuperação de dados externos falhou temporariamente.',
            metadata: compactJsonObject({
              attemptedAt: params.attemptedAt.toISOString(),
            }),
          },
        });
      });
    });
  }

  async recordRetrievalRecovered(
    params: RecordRetrievalRecoveredParams,
  ): Promise<void> {
    await this.runSafely('record retrieval recovery', async () => {
      await this.withIncidentLock(`retrieval:${params.source}`, async (tx) => {
        const openIssue = await this.findOpenRetrievalIssue(params.source, tx);
        if (!openIssue) {
          return;
        }

        const startedAt = openIssue.startedAt ?? openIssue.observedAt;

        await tx.historicalIncidentEvent.update({
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
          buildHeadwaySnapshotData(
            headway,
            direction,
            samplesByDirection.get(direction.direction),
            stationName,
            this.getRequiredRailAgency.bind(this),
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
          errors: compactJsonObject({
            reason: params.reason,
            error: params.error ? errorToJsonObject(params.error) : undefined,
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
          source: this.backendInstanceSource,
          severity: 'normal',
          title: 'Instância do backend online',
          metadata: compactJsonObject({
            pid: process.pid,
            nodeEnv: process.env.NODE_ENV,
          }),
        },
      });
    });
  }

  private findOpenRetrievalIssue(
    source: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return client.historicalIncidentEvent.findFirst({
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
          source: this.backendInstanceSource,
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
        source: this.backendInstanceSource,
        severity: 'warning',
        title: 'Instância do backend possivelmente ficou offline',
        description:
          'O processo anterior não registrou um desligamento limpo antes desta inicialização.',
        metadata: compactJsonObject({
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
          source: this.backendInstanceSource,
          severity: 'warning',
          title: 'Instância do backend offline',
          description: reason,
          metadata: compactJsonObject({
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
    await this.withIncidentLock(`rail-status:${lineCode}`, async (tx) => {
      const latestEvent = await tx.historicalIncidentEvent.findFirst({
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

      const countsAsIncident = countsRailStatusAsIncident(line.statusCode);
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

      await tx.historicalIncidentEvent.create({
        data: {
          ...buildRailEventData(
            line,
            metadata,
            this.getRequiredRailAgency.bind(this),
          ),
          eventType,
          title: recoveredFromIncident
            ? `${line.line}: operação recuperada`
            : `${line.line}: ${line.statusLabel}`,
          startedAt: recoveredFromIncident ? latestEvent.observedAt : undefined,
          endedAt: recoveredFromIncident ? new Date() : undefined,
          durationSeconds: recoveredFromIncident
            ? Math.max(
                0,
                Math.round(
                  (Date.now() - latestEvent.observedAt.getTime()) / 1000,
                ),
              )
            : undefined,
        },
      });
    });
  }

  private async resolveStationName(
    lineCode: string,
    stationCode: string,
  ): Promise<string | undefined> {
    if (isExternalRailLine(lineCode)) {
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

    return getStaticHistoricalStationName(lineCode, stationCode);
  }

  private getRequiredRailAgency(lineCode: string | number): string {
    const agency = getRailAgency(lineCode);

    if (!agency) {
      throw new Error(`No transit agency configured for line ${lineCode}`);
    }

    return agency;
  }

  private async withIncidentLock<T>(
    key: string,
    callback: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${key}))
      `;
      return callback(transaction);
    });
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
