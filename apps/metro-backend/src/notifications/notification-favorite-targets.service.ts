import { BadRequestException, Injectable } from '@nestjs/common';
import {
  NotificationTarget,
  NotificationTargetKind,
} from '@metro/shared/notification-contracts';
import {
  getRailLineByCode,
  getRailLineById,
  getRailStationFavoriteKey,
  getRailStationIdentityFromFavoriteKey,
  HEADWAY_DEFAULT_ENABLED_LINES,
  RAIL_LINES,
  SPECIAL_RAIL_LINE_CODES,
  isBusDirectionFavorite,
  isBusLineFavorite,
} from '@metro/shared/utils';
import { BusDirectionService } from '../geography/services/bus-direction.service';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { notificationHash } from './notification-message';

const MAX_SUGGESTED_TARGETS = 20;
const HEADWAY_LINE_CODES = new Set<string>(HEADWAY_DEFAULT_ENABLED_LINES);

interface FavoriteRecord {
  code: string;
}

interface RouteRow {
  name: string;
  label: string;
  color: string | null;
  textColor: string | null;
}

interface StopRow {
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  platformCode: string | null;
}

interface FavoriteTargetCandidate {
  kind: NotificationTargetKind;
  label: string;
  descriptor: Record<string, string | number>;
  storedDescriptor?: Record<string, unknown>;
  presentation?: Pick<
    NotificationTarget,
    | 'railLineCode'
    | 'busRouteShortName'
    | 'busRouteColor'
    | 'busRouteTextColor'
  >;
}

const FAVORITE_TYPE_BY_TARGET_KIND: Partial<
  Record<NotificationTargetKind, string>
> = {
  rail_line: 'railLine',
  rail_station: 'railStation',
  bus_route: 'busRoute',
  bus_stop: 'busStop',
  special_line: 'railLine',
};

@Injectable()
export class NotificationFavoriteTargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directions: BusDirectionService,
  ) {}

  async getTargets(
    userId: string,
    kind: NotificationTargetKind,
  ): Promise<NotificationTarget[]> {
    if (!Object.prototype.hasOwnProperty.call(FAVORITE_TYPE_BY_TARGET_KIND, kind)) {
      throw new BadRequestException('Tipo de favorito inválido.');
    }

    const favoriteType = FAVORITE_TYPE_BY_TARGET_KIND[kind];
    if (!favoriteType) {
      return [];
    }

    const favorites = await this.prisma.favorite.findMany({
      where: { userId, type: favoriteType },
      orderBy: { createdAt: 'asc' },
    });
    const codes = favorites
      .map((favorite: FavoriteRecord) => favorite.code)
      .filter((code) => typeof code === 'string' && code.length > 0);
    const candidates = await this.resolveCandidates(kind, codes);
    const uniqueCandidates = this.uniqueCandidates(candidates).slice(
      0,
      MAX_SUGGESTED_TARGETS,
    );

    return Promise.all(
      uniqueCandidates.map((candidate) => this.persist(candidate)),
    );
  }

  private async resolveCandidates(
    kind: NotificationTargetKind,
    codes: string[],
  ): Promise<FavoriteTargetCandidate[]> {
    if (codes.length === 0) {
      return [];
    }

    if (kind === 'rail_line') {
      return this.resolveRailLines(codes);
    }
    if (kind === 'rail_station') {
      return this.resolveRailStations(codes);
    }
    if (kind === 'special_line') {
      return this.resolveSpecialLines(codes);
    }
    if (kind === 'bus_route') {
      return this.resolveBusRoutes(codes);
    }
    return this.resolveBusStops(codes);
  }

  private resolveRailLines(codes: string[]): FavoriteTargetCandidate[] {
    return codes.flatMap((code) => {
      const line = code.startsWith('L')
        ? getRailLineById(code)
        : /^\d+$/u.test(code)
          ? getRailLineByCode(Number(code))
          : undefined;
      if (!line) {
        return [];
      }

      return [
        {
          kind: 'rail_line',
          label: line.fullName,
          descriptor: { lineCode: line.lineId },
          presentation: { railLineCode: line.code },
        },
      ];
    });
  }

  private resolveRailStations(codes: string[]): FavoriteTargetCandidate[] {
    const byFavoriteKey = new Map<string, FavoriteTargetCandidate[]>();
    const byLegacyCode = new Map<string, FavoriteTargetCandidate[]>();

    for (const line of RAIL_LINES) {
      if (!HEADWAY_LINE_CODES.has(line.lineId)) {
        continue;
      }

      for (const station of line.stations) {
        const candidate: FavoriteTargetCandidate = {
          kind: 'rail_station',
          label: `${station.name} (${line.fullName})`,
          descriptor: {
            lineCode: line.lineId,
            stationCode: station.code,
          },
          presentation: { railLineCode: line.code },
        };
        const favoriteKey = getRailStationFavoriteKey(station.name);
        byFavoriteKey.set(favoriteKey, [
          ...(byFavoriteKey.get(favoriteKey) ?? []),
          candidate,
        ]);
        const legacyCode = station.code.toLocaleUpperCase('pt-BR');
        byLegacyCode.set(legacyCode, [
          ...(byLegacyCode.get(legacyCode) ?? []),
          candidate,
        ]);
      }
    }

    return codes.flatMap((code) => {
      const stableIdentity = getRailStationIdentityFromFavoriteKey(code);
      if (stableIdentity) {
        return byFavoriteKey.get(`station:${stableIdentity}`) ?? [];
      }
      return byLegacyCode.get(code.toLocaleUpperCase('pt-BR')) ?? [];
    });
  }

  private resolveSpecialLines(codes: string[]): FavoriteTargetCandidate[] {
    const specialLines = [
      {
        code: SPECIAL_RAIL_LINE_CODES.EXPRESSO_AEROPORTO,
        label: 'Expresso Aeroporto',
      },
      {
        code: SPECIAL_RAIL_LINE_CODES.EXPRESSO_LINHA_10,
        label: 'Expresso Linha 10',
      },
    ];
    const favoriteCodes = new Set(codes);

    return specialLines
      .filter((line) => favoriteCodes.has(line.code))
      .map((line) => ({
        kind: 'special_line',
        label: line.label,
        descriptor: { code: line.code },
      }));
  }

  private async resolveBusRoutes(
    codes: string[],
  ): Promise<FavoriteTargetCandidate[]> {
    // Operational notices target the entire line. Collapse saved directions
    // after resolving them against the current feed, preserving that contract.
    const directionCodes = codes.filter((code) => isBusDirectionFavorite(code) || isBusLineFavorite(code));
    const resolved = directionCodes.length ? await this.directions.forFavorites(directionCodes) : [];
    const routeIds = [...new Set([
      ...codes.filter((code) => !code.startsWith('bus:')),
      ...resolved.map((direction) => direction.routeId),
    ])];
    if (routeIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<RouteRow[]>`
      SELECT route_short_name AS name, min(route_long_name) AS label,
        min(route_color) AS color, min(route_text_color) AS "textColor"
      FROM public."Gtfs_Route"
      WHERE route_type = 3 AND source_agency = 'sptrans'
        AND route_id = ANY(${routeIds}::TEXT[])
      GROUP BY route_short_name
      ORDER BY min(array_position(${routeIds}::TEXT[], route_id)), route_short_name
      LIMIT ${MAX_SUGGESTED_TARGETS}
    `;

    return rows.map((row) => ({
      kind: 'bus_route',
      label: `${row.name} (${row.label})`,
      descriptor: { routeName: row.name, agency: 'sptrans' },
      storedDescriptor: {
        routeName: row.name,
        agency: 'sptrans',
        presentation: {
          busRouteShortName: row.name,
          ...(row.color ? { busRouteColor: row.color } : {}),
          ...(row.textColor ? { busRouteTextColor: row.textColor } : {}),
        },
      },
      presentation: {
        busRouteShortName: row.name,
        ...(row.color ? { busRouteColor: row.color } : {}),
        ...(row.textColor ? { busRouteTextColor: row.textColor } : {}),
      },
    }));
  }

  private async resolveBusStops(
    codes: string[],
  ): Promise<FavoriteTargetCandidate[]> {
    const rows = await this.prisma.$queryRaw<StopRow[]>`
      SELECT s.stop_name AS name, s.stop_desc AS description,
        s.stop_lat AS latitude, s.stop_lon AS longitude,
        s.platform_code AS "platformCode"
      FROM public."Gtfs_Stop" s
      WHERE s.source_agency = 'sptrans' AND s.stop_id = ANY(${codes}::TEXT[])
        AND EXISTS (
          SELECT 1 FROM public.gtfs_stop_service_summary summary
          WHERE summary.stop_id = s.stop_id AND summary.serves_bus
        )
      ORDER BY array_position(${codes}::TEXT[], s.stop_id), s.stop_name
      LIMIT ${MAX_SUGGESTED_TARGETS}
    `;

    return rows.map((row) => ({
      kind: 'bus_stop',
      label: `${row.name} (${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)})`,
      descriptor: {
        name: row.name,
        description: row.description ?? '',
        latitude: row.latitude,
        longitude: row.longitude,
        platformCode: row.platformCode ?? '',
      },
    }));
  }

  private uniqueCandidates(
    candidates: FavoriteTargetCandidate[],
  ): FavoriteTargetCandidate[] {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = JSON.stringify([candidate.kind, candidate.descriptor]);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async persist(
    candidate: FavoriteTargetCandidate,
  ): Promise<NotificationTarget> {
    const identityKey = notificationHash(
      JSON.stringify([candidate.kind, candidate.descriptor]),
    );
    const descriptor = candidate.storedDescriptor ?? candidate.descriptor;
    const target = await this.prisma.notificationTarget.upsert({
      where: { identityKey },
      update: {
        label: candidate.label,
        available: true,
        descriptor: descriptor as unknown as Prisma.InputJsonValue,
      },
      create: {
        identityKey,
        kind: candidate.kind,
        label: candidate.label,
        available: true,
        descriptor: descriptor as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: target.id,
      kind: candidate.kind,
      label: target.label,
      available: target.available,
      ...candidate.presentation,
    };
  }
}
