import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  BusTerminalDetail,
  BusTerminalRoute,
  BusTerminalStop,
  BusTerminalSummary,
} from '@metro/shared/bus-terminal-contracts';
import { encodeBusDirectionFavorite } from '@metro/shared/utils';
import { AsyncTtlCache } from '../common/cache/async-ttl-cache';
import { PrismaService } from '../prisma/prisma.service';
import {
  mapBusRoute,
  normalizeBusSourceAgency,
  supportsBusRealtime,
  type BusRouteRow,
} from '../geography/services/bus-catalog.utils';
import {
  buildBusTerminalCatalog,
  parseBusTerminalStop,
  type BusTerminalRow,
} from './bus-terminal-catalog.utils';

interface BusTerminalStopDetailRow extends BusTerminalRow {
  merged_stop_ids: string[];
}

interface BusTerminalDirectionRow extends BusRouteRow {
  direction_id: number | null;
  trip_headsign: string | null;
  served_stop_ids: string[];
  stops: Array<{ latitude: number; longitude: number; name: string }>;
}

interface BusTerminalSnapshot {
  stopRows: BusTerminalStopDetailRow[];
  directionRows: BusTerminalDirectionRow[];
  currentSummary?: BusTerminalSummary;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function mapTerminalStop(row: BusTerminalStopDetailRow): BusTerminalStop {
  const sourceAgency = normalizeBusSourceAgency(row.source_agency, row.stop_id);
  const sourceId = row.source_id?.trim() ||
    (sourceAgency === 'artesp' ? row.stop_id.replace(/^artesp:/i, '') : row.stop_id);
  const terminalStop = parseBusTerminalStop(
    row.stop_name,
    row.stop_desc,
    row.platform_code,
  );

  return {
    stopId: row.stop_id,
    name: row.stop_name,
    ...(row.stop_desc ? { description: row.stop_desc } : {}),
    latitude: Number(row.stop_lat),
    longitude: Number(row.stop_lon),
    sourceAgency,
    sourceId,
    ...(terminalStop?.platformCode ? { platformCode: terminalStop.platformCode } : {}),
    mergedStopIds: [...new Set(row.merged_stop_ids?.length
      ? row.merged_stop_ids
      : [row.stop_id])].sort(compareStrings),
    boardingAllowed: terminalStop?.boardingAllowed ?? false,
  };
}

function directionIdentity(row: BusTerminalDirectionRow): string | undefined {
  const origin = row.stops[0];
  const destination = row.stops[row.stops.length - 1];
  const via = row.stops[1];
  if (!origin || !destination || !via) return undefined;
  const sourceAgency = normalizeBusSourceAgency(row.source_agency, row.route_id);
  const favoriteCode = encodeBusDirectionFavorite({
    sourceAgency,
    shortName: row.route_short_name,
    originLatitude: origin.latitude,
    originLongitude: origin.longitude,
    viaLatitude: via.latitude,
    viaLongitude: via.longitude,
    destinationLatitude: destination.latitude,
    destinationLongitude: destination.longitude,
  });
  // Match the identity used by arrivals; feed labels and direction IDs are metadata.
  return JSON.stringify([
    row.route_id,
    favoriteCode ?? [origin, via, destination].flatMap((stop) => [
      stop.latitude.toFixed(4),
      stop.longitude.toFixed(4),
    ]),
  ]);
}

function sameTerminalSnapshot(
  expected: BusTerminalSummary,
  current: BusTerminalSummary | undefined,
): boolean {
  return Boolean(current) &&
    current?.id === expected.id &&
    current.name === expected.name &&
    current.latitude === expected.latitude &&
    current.longitude === expected.longitude &&
    current.platformCodes.length === expected.platformCodes.length &&
    current.platformCodes.every((code, index) => code === expected.platformCodes[index]) &&
    current.stopIds.length === expected.stopIds.length &&
    current.stopIds.every((stopId, index) => stopId === expected.stopIds[index]);
}

/** Resolves the current feed's explicitly named bus terminals and details. */
@Injectable()
export class BusTerminalService {
  private readonly catalog = new AsyncTtlCache<BusTerminalSummary[]>(60_000, 1);
  private readonly details = new AsyncTtlCache<BusTerminalDetail | null>(30_000, 128);

  constructor(private readonly prisma: PrismaService) {}

  getCatalog(): Promise<BusTerminalSummary[]> {
    return this.catalog.getOrLoad('full-feed', () => this.loadCatalog());
  }

  async refreshCatalog(): Promise<BusTerminalSummary[]> {
    this.catalog.clear();
    this.details.clear();
    return this.getCatalog();
  }

  async getTerminal(id: string): Promise<BusTerminalDetail | null> {
    return this.details.getOrLoad(id, () => this.loadTerminalDetail(id, true));
  }

  private async loadTerminalDetail(
    id: string,
    refreshOnStale: boolean,
  ): Promise<BusTerminalDetail | null> {
    const summary = (await this.getCatalog()).find((terminal) => terminal.id === id);
    if (!summary) return null;
    const snapshot = await this.loadTerminalSnapshot(summary);
    if (!sameTerminalSnapshot(summary, snapshot.currentSummary)) {
      if (!refreshOnStale) return null;
      const refreshed = await this.refreshCatalog();
      const current = refreshed.find((terminal) => terminal.id === id);
      return current ? this.loadTerminalDetailFromSummary(current, false) : null;
    }
    return this.mapTerminalDetail(summary, snapshot);
  }

  private async loadTerminalDetailFromSummary(
    summary: BusTerminalSummary,
    refreshOnStale: boolean,
  ): Promise<BusTerminalDetail | null> {
    const snapshot = await this.loadTerminalSnapshot(summary);
    if (!sameTerminalSnapshot(summary, snapshot.currentSummary)) {
      if (!refreshOnStale) return null;
      const refreshed = await this.refreshCatalog();
      const current = refreshed.find((terminal) => terminal.id === summary.id);
      return current ? this.loadTerminalDetailFromSummary(current, false) : null;
    }
    return this.mapTerminalDetail(summary, snapshot);
  }

  private mapTerminalDetail(
    summary: BusTerminalSummary,
    snapshot: BusTerminalSnapshot,
  ): BusTerminalDetail {
    const stops = snapshot.stopRows.map(mapTerminalStop);
    const boardingStopIds = stops
      .filter((stop) => stop.boardingAllowed)
      .map((stop) => stop.stopId);
    return {
      ...summary,
      stops,
      routes: this.mapTerminalRoutes(
        boardingStopIds,
        snapshot.directionRows,
      ),
    };
  }

  async getTerminalForStop(stopId: string): Promise<BusTerminalSummary | null> {
    return (await this.getCatalog()).find((terminal) =>
      terminal.stopIds.includes(stopId),
    ) ?? null;
  }

  private async loadCatalog(): Promise<BusTerminalSummary[]> {
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
      return tx.$queryRaw<BusTerminalRow[]>`
        SELECT terminal.* FROM public.bus_terminal_stops terminal
        ORDER BY terminal.stop_id
      `;
    }, { maxWait: 2_000, timeout: 8_000 });

    return buildBusTerminalCatalog(rows);
  }

  private async loadTerminalSnapshot(
    summary: BusTerminalSummary,
  ): Promise<BusTerminalSnapshot> {
    const stopIds = summary.stopIds;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
      const stopRows = await tx.$queryRaw<BusTerminalStopDetailRow[]>`
        SELECT stop.stop_id, stop.stop_name, stop.stop_desc, stop.stop_lat,
          stop.stop_lon, stop.source_agency, stop.source_id, stop.platform_code,
          COALESCE(physical_members.merged_stop_ids, ARRAY[stop.stop_id]) AS merged_stop_ids
        FROM public.bus_terminal_stops stop
        LEFT JOIN public.physical_stop_members membership
          ON membership.source_stop_id = stop.stop_id
        LEFT JOIN LATERAL (
          SELECT ARRAY_AGG(member.source_stop_id ORDER BY member.source_stop_id) AS merged_stop_ids
          FROM public.physical_stop_members member
          WHERE member.physical_stop_id = COALESCE(membership.physical_stop_id, stop.stop_id)
        ) physical_members ON TRUE
        WHERE stop.stop_id = ANY(${stopIds}::text[])
        ORDER BY stop.stop_id
      `;
      const currentSummary = buildBusTerminalCatalog(stopRows)
        .find((terminal) => terminal.id === summary.id);
      if (!sameTerminalSnapshot(summary, currentSummary)) {
        return { stopRows, directionRows: [], currentSummary };
      }

      await tx.$executeRaw`SET LOCAL jit = off`;
      const patternView = await tx.$queryRaw<Array<{ available: boolean }>>`
        SELECT to_regclass('public.bus_direction_patterns') IS NOT NULL AS available
      `;
      if (!patternView[0]?.available) {
        throw new ServiceUnavailableException('Bus direction index requires the terminal-support database migration');
      }
      const directionRows = await tx.$queryRaw<BusTerminalDirectionRow[]>`
          SELECT route.route_id, route.agency_id, route.route_short_name,
            route.route_long_name, route.route_type, route.route_color,
            route.route_text_color, route.source_agency, route.source_id,
            pattern.direction_id, pattern.trip_headsign, pattern.served_stop_ids,
            jsonb_build_array(
              pattern.stops->0,
              pattern.stops->((jsonb_array_length(pattern.stops) - 1) / 3),
              pattern.stops->-1
            ) AS stops
          FROM public.bus_direction_patterns pattern
          INNER JOIN public."Gtfs_Route" route ON route.route_id = pattern.route_id
          WHERE pattern.served_stop_ids && ${stopIds}::text[]
            AND (route.route_type IN (3, 11) OR route.route_type BETWEEN 700 AND 799)
          ORDER BY route.route_id, pattern.direction_id, pattern.trip_headsign,
            pattern.trip_id
        `;

      return { stopRows, directionRows, currentSummary };
    }, {
      maxWait: 2_000,
      timeout: 18_000,
      isolationLevel: 'RepeatableRead',
    });
  }

  private mapTerminalRoutes(
    boardingStopIds: string[],
    rows: readonly BusTerminalDirectionRow[],
  ): BusTerminalRoute[] {
    const memberStopSet = new Set(boardingStopIds);
    const grouped = new Map<string, {
      route: BusRouteRow;
      directionId: number | null;
      destination?: string;
      favoriteCode?: string;
      stopIds: Set<string>;
    }>();

    for (const row of rows) {
      const identity = directionIdentity(row);
      if (!identity || !Array.isArray(row.served_stop_ids)) continue;
      const stopIds = row.served_stop_ids.filter((stopId) => memberStopSet.has(stopId));
      if (stopIds.length === 0) continue;
      const destination = row.trip_headsign?.trim() || row.stops[row.stops.length - 1]?.name;
      const origin = row.stops[0];
      const terminal = row.stops[row.stops.length - 1];
      const via = row.stops[1];
      if (!origin || !terminal || !via) continue;
      const favoriteCode = encodeBusDirectionFavorite({
        sourceAgency: normalizeBusSourceAgency(row.source_agency, row.route_id),
        shortName: row.route_short_name,
        originLatitude: origin.latitude,
        originLongitude: origin.longitude,
        viaLatitude: via.latitude,
        viaLongitude: via.longitude,
        destinationLatitude: terminal.latitude,
        destinationLongitude: terminal.longitude,
      }) ?? undefined;
      const group = grouped.get(identity) ?? {
        route: row,
        directionId: row.direction_id,
        destination,
        ...(favoriteCode ? { favoriteCode } : {}),
        stopIds: new Set<string>(),
      };
      for (const stopId of stopIds) group.stopIds.add(stopId);
      grouped.set(identity, group);
    }

    const directions = [...grouped.values()].map(({
      route,
      directionId,
      destination,
      favoriteCode,
      stopIds,
    }) => {
      const mapped = mapBusRoute(route);
      return {
        routeId: mapped.routeId,
        shortName: mapped.shortName,
        longName: mapped.longName,
        sourceAgency: mapped.sourceAgency,
        sourceId: mapped.sourceId,
        supportsRealtime: supportsBusRealtime(
          mapped.routeId,
          mapped.sourceAgency,
          route.route_type,
        ),
        color: mapped.color,
        textColor: mapped.textColor,
        ...(destination ? { destination } : {}),
        ...(directionId !== null ? { directionId } : {}),
        ...(favoriteCode ? { favoriteCode } : {}),
        stopIds: [...stopIds].sort(compareStrings),
      };
    });
    return directions.sort((left, right) =>
      compareStrings(left.routeId, right.routeId) ||
      compareStrings(String(left.directionId ?? ''), String(right.directionId ?? '')) ||
      compareStrings(left.destination ?? '', right.destination ?? ''),
    );
  }
}
