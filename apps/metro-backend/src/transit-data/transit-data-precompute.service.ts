import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GTFSConfig } from '../data-import/config/gtfs.config';

export const ROUTE_RAIL_CONNECTION_RADIUS_METERS = 200;

const GTFS_STOP_SUMMARY_STATE_KEY = 'gtfs-stop-service-summary';
const GTFS_STOP_SUMMARY_VERSION = 1;
const ROUTE_RAIL_CONNECTION_STATE_KEY = 'route-rail-connections';
const ROUTE_RAIL_CONNECTION_VERSION = 1;
const GTFS_POST_PROCESSING_STATE_KEY = 'gtfs-post-processing';
const GTFS_POST_PROCESSING_COMPLETE_PREFIX = 'complete:';
const GTFS_POST_PROCESSING_PENDING_PREFIX = 'pending:';
const ROUTE_RAIL_GTFS_FILES = [
  'routes.txt',
  'stops.txt',
  'trips.txt',
  'stop_times.txt',
];

type PrecomputedView =
  | 'gtfs_stop_service_summary'
  | 'route_rail_connection_hits';

@Injectable()
export class TransitDataPrecomputeService {
  private readonly logger = new Logger(TransitDataPrecomputeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Skip hooks only after the full GTFS post-processing chain completes. */
  async isGtfsPostProcessingCurrent(sourceSignature: string): Promise<boolean> {
    const storedSignature = await this.getStoredSignature(
      GTFS_POST_PROCESSING_STATE_KEY,
    );

    return (
      storedSignature ===
      `${GTFS_POST_PROCESSING_COMPLETE_PREFIX}${sourceSignature}`
    );
  }

  async markGtfsPostProcessingPending(sourceSignature: string): Promise<void> {
    await this.storeSignature(
      GTFS_POST_PROCESSING_STATE_KEY,
      `${GTFS_POST_PROCESSING_PENDING_PREFIX}${sourceSignature}`,
    );
  }

  async markGtfsPostProcessingComplete(
    sourceSignature: string,
  ): Promise<void> {
    await this.storeSignature(
      GTFS_POST_PROCESSING_STATE_KEY,
      `${GTFS_POST_PROCESSING_COMPLETE_PREFIX}${sourceSignature}`,
    );
  }

  async refreshAfterGtfsImport(): Promise<void> {
    const gtfsSignature = await this.getCompleteGtfsSignature();
    const summarySignature = gtfsSignature
      ? `v${GTFS_STOP_SUMMARY_VERSION}:${gtfsSignature}`
      : null;

    await this.refreshMaterializedViewIfNeeded(
      GTFS_STOP_SUMMARY_STATE_KEY,
      summarySignature,
      'gtfs_stop_service_summary',
    );
    await this.refreshRouteRailConnections(gtfsSignature);
  }

  async refreshRouteRailConnections(
    knownGtfsSignature?: string | null,
  ): Promise<void> {
    const [gtfsSignature, railSignature] = await Promise.all([
      knownGtfsSignature === undefined
        ? this.getCompleteGtfsSignature()
        : Promise.resolve(knownGtfsSignature),
      this.getMergedRailStationsSignature(),
    ]);
    const sourceSignature =
      gtfsSignature && railSignature
        ? `v${ROUTE_RAIL_CONNECTION_VERSION}:radius=${ROUTE_RAIL_CONNECTION_RADIUS_METERS}:gtfs=${gtfsSignature}:rail=${railSignature}`
        : null;

    await this.refreshMaterializedViewIfNeeded(
      ROUTE_RAIL_CONNECTION_STATE_KEY,
      sourceSignature,
      'route_rail_connection_hits',
    );
  }

  private async refreshMaterializedViewIfNeeded(
    stateKey: string,
    sourceSignature: string | null,
    view: PrecomputedView,
  ): Promise<void> {
    if (sourceSignature) {
      const storedSignature = await this.getStoredSignature(stateKey);
      if (storedSignature === sourceSignature) {
        this.logger.debug(`${view} is current; skipping refresh`);
        return;
      }
    }

    this.logger.debug(`Refreshing ${view}...`);
    await this.refreshMaterializedView(view);

    if (sourceSignature) {
      await this.storeSignature(stateKey, sourceSignature);
    }

    this.logger.debug(`Refreshed ${view}`);
  }

  private async refreshMaterializedView(view: PrecomputedView): Promise<void> {
    if (view === 'gtfs_stop_service_summary') {
      await this.prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."gtfs_stop_service_summary"',
      );
      return;
    }

    await this.prisma.$executeRawUnsafe(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."route_rail_connection_hits"',
    );
  }

  private async getCompleteGtfsSignature(): Promise<string | null> {
    const requiredFiles = GTFSConfig.getRequiredFiles();
    const datasets = await this.prisma.$queryRaw<
      Array<{ source_signature: string }>
    >`
      WITH complete_dataset AS (
        SELECT dataset.id
        FROM "public"."gtfs_datasets" dataset
        WHERE NOT EXISTS (
          SELECT 1
          FROM UNNEST(${requiredFiles}::TEXT[]) AS required(file_name)
          WHERE NOT EXISTS (
            SELECT 1
            FROM "public"."gtfs_files" file
            WHERE file."datasetId" = dataset.id
              AND file."fileName" = required.file_name
              AND file."recordCount" > 0
          )
        )
        ORDER BY dataset."lastUpdated" DESC
        LIMIT 1
      )
      SELECT MD5(
        STRING_AGG(
          file."fileName" || ':' || file."fileHash",
          '|' ORDER BY file."fileName"
        )
      ) AS source_signature
      FROM complete_dataset dataset
      INNER JOIN "public"."gtfs_files" file
        ON file."datasetId" = dataset.id
      WHERE file."fileName" = ANY(${ROUTE_RAIL_GTFS_FILES}::TEXT[])
      HAVING COUNT(DISTINCT file."fileName") = ${ROUTE_RAIL_GTFS_FILES.length}
    `;

    return datasets[0]?.source_signature ?? null;
  }

  private async getMergedRailStationsSignature(): Promise<string | null> {
    const signatures = await this.prisma.$queryRaw<
      Array<{ source_signature: string | null }>
    >`
      SELECT MD5(
        COALESCE(
          STRING_AGG(
            CONCAT_WS(
              ':',
              station."primaryId"::TEXT,
              ARRAY_TO_STRING(station."mergedIds", ','),
              station.name,
              station."originalName",
              station.latitude::TEXT,
              station.longitude::TEXT,
              ARRAY_TO_STRING(station.agencies, ','),
              ARRAY_TO_STRING(station.lines, ',')
            ),
            '|' ORDER BY station."primaryId"
          ),
          ''
        )
      ) AS source_signature
      FROM "public"."merged_rail_stations" station
    `;

    return signatures[0]?.source_signature ?? null;
  }

  private async getStoredSignature(stateKey: string): Promise<string | null> {
    const states = await this.prisma.$queryRaw<
      Array<{ source_signature: string | null }>
    >`
      SELECT state."sourceSignature" AS source_signature
      FROM "public"."transit_precompute_state" state
      WHERE state.key = ${stateKey}
      LIMIT 1
    `;

    return states[0]?.source_signature ?? null;
  }

  private async storeSignature(
    stateKey: string,
    sourceSignature: string,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "public"."transit_precompute_state" (
        "key",
        "sourceSignature",
        "updatedAt"
      )
      VALUES (${stateKey}, ${sourceSignature}, NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "sourceSignature" = EXCLUDED."sourceSignature",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
  }
}
