import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MAX_NOTIFICATION_BUS_STOP_ROUTES_PER_STOP,
  NotificationTarget,
  NotificationTargetKind,
} from '@metro/shared/notification-contracts';
import {
  HEADWAY_DEFAULT_ENABLED_LINES,
  RAIL_LINES,
  SPECIAL_RAIL_LINE_CODES,
} from '@metro/shared/utils';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeographyServiceOptimized } from '../geography/services/geography-optimized.service';
import { notificationHash } from './notification-message';
import {
  boundsAround,
  haversineDistanceMeters,
  normalizeSemanticText,
} from './notification-snapshot.utils';

interface Candidate {
  kind: NotificationTargetKind;
  label: string;
  descriptor: Record<string, string | number>;
  storedDescriptor?: Record<string, unknown>;
  presentation?: Pick<
    NotificationTarget,
    'busRouteShortName' | 'busRouteColor' | 'busRouteTextColor'
  >;
}
const HEADWAY_LINE_CODES = new Set<string>(HEADWAY_DEFAULT_ENABLED_LINES);
const BUS_STOP_SEARCH_RADIUS_METERS = 40;
const BUS_STOP_MATCH_RADIUS_METERS = 15;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function normalizeNotificationName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class NotificationTargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geography: GeographyServiceOptimized,
  ) {}

  async search(
    kind: NotificationTargetKind,
    search: string,
  ): Promise<NotificationTarget[]> {
    if (
      ![
        'rail_line',
        'rail_station',
        'bus_route',
        'bus_stop',
        'special_line',
      ].includes(kind) ||
      typeof search !== 'string' ||
      search.length > 100
    )
      throw new BadRequestException('Busca inválida.');
    const term = normalizeNotificationName(search);
    let candidates: Candidate[];
    if (kind === 'rail_line') {
      candidates = RAIL_LINES.map((line) => ({
        kind,
        label: line.fullName,
        descriptor: { lineCode: line.lineId },
      }));
    } else if (kind === 'rail_station') {
      candidates = RAIL_LINES.filter((line) =>
        HEADWAY_LINE_CODES.has(line.lineId),
      ).flatMap((line) =>
        line.stations.map((station) => ({
          kind,
          label: `${station.name} (${line.fullName})`,
          descriptor: { lineCode: line.lineId, stationCode: station.code },
        })),
      );
    } else if (kind === 'special_line') {
      candidates = [
        {
          kind,
          label: 'Expresso Aeroporto',
          descriptor: { code: SPECIAL_RAIL_LINE_CODES.EXPRESSO_AEROPORTO },
        },
        {
          kind,
          label: 'Expresso Linha 10',
          descriptor: { code: SPECIAL_RAIL_LINE_CODES.EXPRESSO_LINHA_10 },
        },
      ];
    } else if (kind === 'bus_route') {
      if (search.trim().length < 2) return [];
      const rows = await this.prisma.$queryRaw<
        Array<{
          name: string;
          label: string;
          color: string | null;
          textColor: string | null;
        }>
      >`
        SELECT route_short_name AS name, min(route_long_name) AS label,
          min(route_color) AS color, min(route_text_color) AS "textColor"
        FROM public."Gtfs_Route" WHERE route_type = 3 AND source_agency = 'sptrans'
          AND (route_short_name ILIKE ${`%${search.trim()}%`} OR route_long_name ILIKE ${`%${search.trim()}%`})
        GROUP BY route_short_name ORDER BY route_short_name LIMIT 30
      `;
      candidates = rows.map((row) =>
        this.busRouteCandidate(row.name, row.label, row.color, row.textColor),
      );
    } else {
      if (search.trim().length < 3) return [];
      const rows = await this.prisma.$queryRaw<
        Array<{
          name: string;
          description: string | null;
          latitude: number;
          longitude: number;
          platformCode: string | null;
        }>
      >`
        SELECT DISTINCT s.stop_name AS name, s.stop_desc AS description, s.stop_lat AS latitude, s.stop_lon AS longitude, s.platform_code AS "platformCode"
        FROM public."Gtfs_Stop" s
        WHERE s.source_agency = 'sptrans' AND s.stop_name ILIKE ${`%${search.trim()}%`}
          AND EXISTS (SELECT 1 FROM public.gtfs_stop_service_summary summary WHERE summary.stop_id = s.stop_id AND summary.serves_bus)
        ORDER BY name LIMIT 30
      `;
      candidates = rows.map((row) => ({
        kind,
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
    const filtered = kind.startsWith('bus_')
      ? candidates
      : candidates.filter((c) =>
          normalizeNotificationName(c.label).includes(term),
        );
    return Promise.all(filtered.slice(0, 30).map((c) => this.persist(c)));
  }

  /** Resolve current realtime route targets for a previously selected stop. */
  async getRoutesForStop(stopTargetId: string): Promise<NotificationTarget[]> {
    const candidates = await this.busRouteCandidatesForStop(stopTargetId);
    return Promise.all(candidates.map((candidate) => this.persist(candidate)));
  }

  /** Resolve existing stable route target IDs without mutating catalog rows. */
  async getRouteTargetIdsForStop(stopTargetId: string): Promise<string[]> {
    const candidates = await this.busRouteCandidatesForStop(stopTargetId);
    const identityKeys = [
      ...new Set(candidates.map((candidate) => candidateIdentityKey(candidate))),
    ];
    if (!identityKeys.length) {
      return [];
    }
    const targets = await this.prisma.notificationTarget.findMany({
      where: { identityKey: { in: identityKeys }, kind: 'bus_route' },
      select: { id: true },
    });
    return targets.map((target) => target.id);
  }

  private async busRouteCandidatesForStop(
    stopTargetId: string,
  ): Promise<Candidate[]> {
    if (typeof stopTargetId !== 'string' || !UUID_PATTERN.test(stopTargetId)) {
      throw new BadRequestException('Ponto de ônibus inválido.');
    }

    const target = await this.prisma.notificationTarget.findFirst({
      where: { id: stopTargetId, kind: 'bus_stop' },
      select: { descriptor: true },
    });
    const descriptor = readRecord(target?.descriptor);
    const name = readText(descriptor?.['name']);
    const latitude = readFiniteNumber(descriptor?.['latitude']);
    const longitude = readFiniteNumber(descriptor?.['longitude']);
    if (!descriptor || !name || latitude === null || longitude === null) {
      return [];
    }

    const bounds = boundsAround(
      latitude,
      longitude,
      BUS_STOP_SEARCH_RADIUS_METERS,
    );
    const candidates = await this.geography.searchBusStops({
      bounds,
      limit: 100,
    });
    const expectedName = normalizeSemanticText(name);
    const description = readOptionalText(descriptor['description']);
    const platform = readOptionalText(
      descriptor['platform'] ?? descriptor['platformCode'],
    );
    const expectedDescription =
      description === null ? null : normalizeSemanticText(description);
    const expectedPlatform =
      platform === null ? null : normalizeSemanticText(platform);
    const matches = candidates
      .filter((candidate) => candidate.sourceAgency.toLowerCase() === 'sptrans')
      .map((candidate) => ({
        candidate,
        distance: haversineDistanceMeters(
          latitude,
          longitude,
          candidate.latitude,
          candidate.longitude,
        ),
      }))
      .filter(
        ({ candidate, distance }) =>
          distance <= BUS_STOP_MATCH_RADIUS_METERS &&
          normalizeSemanticText(candidate.name) === expectedName &&
          (expectedDescription === null ||
            normalizeSemanticText(candidate.description ?? '') ===
              expectedDescription) &&
          (!expectedPlatform ||
            normalizeSemanticText(candidate.platformCode ?? '') ===
              expectedPlatform),
      )
      .sort(
        (left, right) =>
          left.distance - right.distance ||
          left.candidate.stopId.localeCompare(right.candidate.stopId),
      );
    if (matches.length !== 1) {
      return [];
    }

    const routesByStop = await this.geography.getRoutesForMultipleStops([
      matches[0].candidate.stopId,
    ]);
    const seenRouteNames = new Set<string>();
    const routes = routesByStop
      .get(matches[0].candidate.stopId)
      ?.filter(
        (route) =>
          route.sourceAgency === 'sptrans' &&
          route.routeType === 3 &&
          /^[0-9A-Z]{4}-\d{2}$/i.test(route.shortName.trim()),
      )
      .filter((route) => {
        const routeName = route.shortName.trim().toUpperCase();
        if (seenRouteNames.has(routeName)) {
          return false;
        }
        seenRouteNames.add(routeName);
        return true;
      })
      .slice(0, MAX_NOTIFICATION_BUS_STOP_ROUTES_PER_STOP);
    if (!routes?.length) {
      return [];
    }

    return routes.map((route) =>
      this.busRouteCandidate(
        route.shortName,
        route.longName,
        route.color,
        route.textColor,
      ),
    );
  }

  private busRouteCandidate(
    name: string,
    label: string,
    color: string | null | undefined,
    textColor: string | null | undefined,
  ): Candidate {
    return {
      kind: 'bus_route',
      label: `${name} (${label})`,
      descriptor: { routeName: name, agency: 'sptrans' },
      storedDescriptor: {
        routeName: name,
        agency: 'sptrans',
        presentation: {
          busRouteShortName: name,
          ...(color ? { busRouteColor: color } : {}),
          ...(textColor ? { busRouteTextColor: textColor } : {}),
        },
      },
      presentation: {
        busRouteShortName: name,
        ...(color ? { busRouteColor: color } : {}),
        ...(textColor ? { busRouteTextColor: textColor } : {}),
      },
    };
  }

  private async persist(candidate: Candidate): Promise<NotificationTarget> {
    // IDs identify the user's semantic selection, not a replaceable feed row.
    const identityKey = candidateIdentityKey(candidate);
    const descriptor = candidate.storedDescriptor ?? candidate.descriptor;
    const descriptorJson = descriptor as unknown as Prisma.InputJsonValue;
    const target = await this.prisma.notificationTarget.upsert({
      where: { identityKey },
      update: {
        label: candidate.label,
        available: true,
        descriptor: descriptorJson,
      },
      create: {
        identityKey,
        kind: candidate.kind,
        label: candidate.label,
        available: true,
        descriptor: descriptorJson,
      },
    });
    return {
      id: target.id,
      kind: candidate.kind,
      label: target.label,
      available: target.available,
      ...candidate.presentation,
      ...this.railLinePresentation(candidate),
    };
  }

  private railLinePresentation(
    candidate: Candidate,
  ): Pick<NotificationTarget, 'railLineCode'> {
    const lineCode = candidate.descriptor['lineCode'];
    if (
      (candidate.kind !== 'rail_line' && candidate.kind !== 'rail_station') ||
      typeof lineCode !== 'string' ||
      !/^L\d{1,2}$/u.test(lineCode)
    ) {
      return {};
    }

    return { railLineCode: Number(lineCode.slice(1)) };
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readOptionalText(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function candidateIdentityKey(candidate: Candidate): string {
  return notificationHash(
    JSON.stringify([candidate.kind, candidate.descriptor]),
  );
}
