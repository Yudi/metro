import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryOptimizationService } from './query-optimization.service';
import { BusStop } from '../entities/geography.entity';
import {
  BusStopRow,
  mapBusStop,
} from './bus-catalog.utils';

/**
 * Optimized catalog stop service.
 *
 * Every list query first collapses physical_stop_members to one
 * SPTrans-preferred representative. Route lookups still expand the source
 * IDs, so matching never loses either feed's service.
 */
@Injectable()
export class BusStopServiceOptimized {
  private readonly logger = new Logger(BusStopServiceOptimized.name);

  constructor(
    private prisma: PrismaService,
    private queryOptimization: QueryOptimizationService,
  ) {}

  async searchBusStops(input?: StopSearchInputLike): Promise<BusStop[]> {
    const searchTerm = normalizeSearchTerm(input?.searchTerm ?? undefined);
    const normalizedInput =
      input?.searchTerm === undefined
        ? input
        : { ...input, searchTerm };
    const limit = this.normalizeLimit(normalizedInput?.limit);
    let stops: BusStopRow[];

    if (searchTerm) {
      stops = await this.searchStopsByTerm(searchTerm, limit);
    } else if (normalizedInput?.bounds) {
      stops = await this.findStopsInBounds(
        normalizedInput.bounds.minLat,
        normalizedInput.bounds.maxLat,
        normalizedInput.bounds.minLng,
        normalizedInput.bounds.maxLng,
        limit,
      );
    } else {
      stops = await this.findAllStops(limit);
    }

    const stopIds = stops.map((stop) => stop.physical_stop_id || stop.stop_id);
    const serviceInfo =
      await this.queryOptimization.batchGetStopServiceInfo(stopIds);

    // Keep rail-only stations out of the bus catalog while retaining mixed
    // physical stops that also have bus service.
    return stops
      .filter((stop) => {
        const info = serviceInfo.get(stop.physical_stop_id || stop.stop_id);
        return !(info?.servesRail && !info.servesBus);
      })
      .map((stop) =>
        mapBusStop(
          stop,
          serviceInfo.get(stop.physical_stop_id || stop.stop_id),
        ),
      );
  }

  async getBusStop(id: string): Promise<BusStop | null> {
    const stop = await this.queryOptimization.findStopByMultipleCriteria(id);
    if (!stop) {
      return null;
    }

    const physicalStopId = stop.physical_stop_id || stop.stop_id;
    const serviceInfo =
      await this.queryOptimization.batchGetStopServiceInfo([physicalStopId]);
    return mapBusStop(stop, serviceInfo.get(physicalStopId));
  }

  async getMultipleStops(ids: string[]): Promise<BusStop[]> {
    return this.queryOptimization.getStopsById(ids);
  }

  private async findAllStops(limit: number): Promise<BusStopRow[]> {
    return this.prisma.$queryRaw<BusStopRow[]>`
      WITH grouped_stops AS (
        SELECT
          COALESCE(member.physical_stop_id, stop.stop_id) AS physical_stop_id,
          stop.*
        FROM "public"."Gtfs_Stop" stop
        LEFT JOIN "public"."physical_stop_members" member
          ON member.source_stop_id = stop.stop_id
      ),
      merged_ids AS (
        SELECT
          physical_stop_id,
          ARRAY_AGG(DISTINCT stop_id ORDER BY stop_id) AS merged_stop_ids
        FROM grouped_stops
        GROUP BY physical_stop_id
      )
      SELECT DISTINCT ON (grouped_stops.physical_stop_id)
        grouped_stops.id,
        grouped_stops.stop_id,
        grouped_stops.stop_name,
        grouped_stops.stop_desc,
        grouped_stops.stop_lat,
        grouped_stops.stop_lon,
        grouped_stops.source_agency,
        grouped_stops.source_id,
        grouped_stops.platform_code,
        grouped_stops.physical_stop_id,
        merged_ids.merged_stop_ids
      FROM grouped_stops
      INNER JOIN merged_ids USING (physical_stop_id)
      ORDER BY
        grouped_stops.physical_stop_id,
        CASE WHEN LOWER(COALESCE(grouped_stops.source_agency, '')) = 'sptrans' THEN 0 ELSE 1 END,
        grouped_stops.stop_id
      LIMIT ${limit}
    `;
  }

  private async findStopsInBounds(
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number,
    limit: number,
  ): Promise<BusStopRow[]> {
    return this.prisma.$queryRaw<BusStopRow[]>`
      WITH candidate_stops AS (
        SELECT
          COALESCE(member.physical_stop_id, stop.stop_id) AS physical_stop_id,
          stop.*
        FROM "public"."Gtfs_Stop" stop
        LEFT JOIN "public"."physical_stop_members" member
          ON member.source_stop_id = stop.stop_id
        WHERE (member.physical_stop_id IS NULL OR member.physical_stop_id = stop.stop_id)
          AND stop.location IS NOT NULL
          AND stop.location && ST_MakeEnvelope(
            ${minLng},
            ${minLat},
            ${maxLng},
            ${maxLat},
          4326
          )::geography
          AND stop.stop_lat BETWEEN ${minLat} AND ${maxLat}
          AND stop.stop_lon BETWEEN ${minLng} AND ${maxLng}
      ),
      grouped_stops AS (
        SELECT candidate.physical_stop_id, candidate.stop_id
        FROM candidate_stops candidate
        UNION ALL
        SELECT candidate.physical_stop_id, member_stop.stop_id
        FROM candidate_stops candidate
        INNER JOIN "public"."physical_stop_members" member
          ON member.physical_stop_id = candidate.physical_stop_id
        INNER JOIN "public"."Gtfs_Stop" member_stop
          ON member_stop.stop_id = member.source_stop_id
      ),
      merged_ids AS (
        SELECT
          physical_stop_id,
          ARRAY_AGG(DISTINCT stop_id ORDER BY stop_id) AS merged_stop_ids
        FROM grouped_stops
        GROUP BY physical_stop_id
      )
      SELECT
        candidate.id,
        candidate.stop_id,
        candidate.stop_name,
        candidate.stop_desc,
        candidate.stop_lat,
        candidate.stop_lon,
        candidate.source_agency,
        candidate.source_id,
        candidate.platform_code,
        candidate.physical_stop_id,
        merged_ids.merged_stop_ids
      FROM candidate_stops candidate
      INNER JOIN merged_ids USING (physical_stop_id)
      ORDER BY
        candidate.physical_stop_id,
        candidate.stop_id
      LIMIT ${limit}
    `;
  }

  private async searchStopsByTerm(
    searchTerm: string,
    limit = 50,
  ): Promise<BusStopRow[]> {
    const escapedSearchTerm = escapeLikePattern(searchTerm);
    return this.prisma.$queryRaw<BusStopRow[]>`
      WITH grouped_stops AS (
        SELECT
          COALESCE(member.physical_stop_id, stop.stop_id) AS physical_stop_id,
          stop.*
        FROM "public"."Gtfs_Stop" stop
        LEFT JOIN "public"."physical_stop_members" member
          ON member.source_stop_id = stop.stop_id
      ),
      filtered_groups AS (
        SELECT DISTINCT physical_stop_id
        FROM grouped_stops
        WHERE stop_name ILIKE ${`%${escapedSearchTerm}%`} ESCAPE '\\'
          OR stop_id ILIKE ${`%${escapedSearchTerm}%`} ESCAPE '\\'
      ),
      merged_ids AS (
        SELECT
          physical_stop_id,
          ARRAY_AGG(DISTINCT stop_id ORDER BY stop_id) AS merged_stop_ids
        FROM grouped_stops
        GROUP BY physical_stop_id
      )
      SELECT DISTINCT ON (grouped_stops.physical_stop_id)
        grouped_stops.id,
        grouped_stops.stop_id,
        grouped_stops.stop_name,
        grouped_stops.stop_desc,
        grouped_stops.stop_lat,
        grouped_stops.stop_lon,
        grouped_stops.source_agency,
        grouped_stops.source_id,
        grouped_stops.platform_code,
        grouped_stops.physical_stop_id,
        merged_ids.merged_stop_ids
      FROM grouped_stops
      INNER JOIN filtered_groups USING (physical_stop_id)
      INNER JOIN merged_ids USING (physical_stop_id)
      ORDER BY
        grouped_stops.physical_stop_id,
        CASE
          WHEN grouped_stops.stop_name ILIKE ${`${escapedSearchTerm}%`} ESCAPE '\\' THEN 1
          WHEN grouped_stops.stop_name ILIKE ${`%${escapedSearchTerm}%`} ESCAPE '\\' THEN 2
          ELSE 3
        END,
        CASE WHEN LOWER(COALESCE(grouped_stops.source_agency, '')) = 'sptrans' THEN 0 ELSE 1 END,
        grouped_stops.stop_name
      LIMIT ${limit}
    `;
  }

  private normalizeLimit(limit: number | undefined): number {
    if (limit === undefined || !Number.isFinite(limit)) {
      return 50_000;
    }

    return Math.min(Math.max(Math.trunc(limit), 1), 100_000);
  }
}

interface StopSearchInputLike {
  searchTerm?: string | null;
  limit?: number;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}

const MAX_SEARCH_TERM_LENGTH = 160;

function normalizeSearchTerm(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const searchTerm = value.trim();
  if (
    searchTerm.length === 0 ||
    searchTerm.length > MAX_SEARCH_TERM_LENGTH ||
    Array.from(searchTerm).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    throw new BadRequestException(
      'searchTerm must be a non-empty value of at most 160 characters',
    );
  }

  return searchTerm;
}

function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
}
