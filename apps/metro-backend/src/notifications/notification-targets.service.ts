import { BadRequestException, Injectable } from '@nestjs/common';
import {
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
import { notificationHash } from './notification-message';

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
  constructor(private readonly prisma: PrismaService) {}

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
          label: `${station.name} · ${line.fullName}`,
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
      candidates = rows.map((row) => ({
        kind,
        label: `${row.name} · ${row.label}`,
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
        label: `${row.name} · ${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}`,
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

  private async persist(candidate: Candidate): Promise<NotificationTarget> {
    // IDs identify the user's semantic selection, not a replaceable feed row.
    const identityKey = notificationHash(
      JSON.stringify([candidate.kind, candidate.descriptor]),
    );
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
