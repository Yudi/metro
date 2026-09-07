import { extractBusPlatform } from '../../transit-data/physical-stop-matcher';
import { BusFare, BusRoute, BusStop } from '../entities/geography.entity';

export type BusSourceAgency = 'sptrans' | 'artesp';

export interface BusRouteRow {
  route_id: string;
  agency_id?: string | null;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color?: string | null;
  route_text_color?: string | null;
  source_agency?: string | null;
  source_id?: string | null;
  fares?: unknown;
  shape_id?: string | null;
  coordinates?: number[][] | null;
}

export interface BusStopRow {
  id?: string | number;
  stop_id: string;
  stop_name: string;
  stop_desc: string | null;
  stop_lat: number;
  stop_lon: number;
  source_agency?: string | null;
  source_id?: string | null;
  platform_code?: string | null;
  physical_stop_id?: string | null;
  merged_stop_ids?: string[] | null;
}

export interface StopServiceInfoLike {
  servesRail: boolean;
  servesBus: boolean;
  agencies: string[];
  railRouteShortNames: string[];
}

export function normalizeBusSourceAgency(
  value: unknown,
  sourceId?: string | null,
): BusSourceAgency {
  if (String(value ?? '').trim().toLowerCase() === 'artesp') {
    return 'artesp';
  }

  return String(sourceId ?? '').toLowerCase().startsWith('artesp:')
    ? 'artesp'
    : 'sptrans';
}

export function isRailRoute(routeId: string, routeType?: number): boolean {
  return (
    routeType === 1 ||
    routeType === 2 ||
    routeId.startsWith('METRÔ') ||
    routeId.startsWith('CPTM')
  );
}

export function supportsBusRealtime(
  routeId: string,
  sourceAgency: unknown,
  routeType?: number,
): boolean {
  return (
    !/^artesp[:/]/i.test(routeId) &&
    normalizeBusSourceAgency(sourceAgency) === 'sptrans' &&
    !isRailRoute(routeId, routeType)
  );
}

export function parseBusFares(value: unknown): BusFare[] {
  if (typeof value === 'string') {
    try {
      return parseBusFares(JSON.parse(value));
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((fare) => {
    if (!fare || typeof fare !== 'object') {
      return [];
    }

    const row = fare as Record<string, unknown>;
    if (row.price === null || row.price === undefined || row.price === '') {
      return [];
    }

    const price = Number(row.price);
    const currency = String(row.currency ?? row.currency_type ?? '').trim();
    if (!Number.isFinite(price) || !currency) {
      return [];
    }

    return [{ price, currency }];
  });
}

export function mapBusRoute(row: BusRouteRow): BusRoute {
  const sourceAgency = normalizeBusSourceAgency(
    row.source_agency,
    row.route_id,
  );
  const routeId = row.route_id;
  const sourceId =
    row.source_id?.trim() ||
    (sourceAgency === 'artesp'
      ? routeId.replace(/^artesp:/i, '')
      : routeId);

  return {
    id: routeId,
    routeId,
    sourceAgency,
    sourceId,
    shortName: row.route_short_name,
    longName: row.route_long_name,
    routeType: row.route_type,
    color: row.route_color || '',
    textColor: row.route_text_color || '',
    supportsRealtime: supportsBusRealtime(
      routeId,
      sourceAgency,
      row.route_type,
    ),
    fares: parseBusFares(row.fares),
    geometry: row.coordinates
      ? { type: 'LineString', coordinates: row.coordinates }
      : undefined,
  };
}

export function mapBusStop(
  row: BusStopRow,
  serviceInfo?: StopServiceInfoLike,
): BusStop {
  const sourceAgency = normalizeBusSourceAgency(
    row.source_agency,
    row.stop_id,
  );
  const stopId = row.physical_stop_id || row.stop_id;
  const sourceId =
    row.source_id?.trim() ||
    (sourceAgency === 'artesp'
      ? row.stop_id.replace(/^artesp:/i, '')
      : row.stop_id);
  const mergedStopIds = Array.from(
    new Set(row.merged_stop_ids?.filter(Boolean) ?? [row.stop_id]),
  ).sort();

  return {
    id: stopId,
    stopId,
    sourceAgency,
    sourceId,
    name: row.stop_name,
    description: row.stop_desc || undefined,
    latitude: row.stop_lat,
    longitude: row.stop_lon,
    platformCode: extractBusPlatform(
      row.stop_name,
      row.stop_desc,
      row.platform_code,
    ),
    mergedStopIds,
    isSubwayStation: serviceInfo?.servesRail ?? false,
    agencies: serviceInfo?.agencies ?? [],
    routeShortNames: serviceInfo?.railRouteShortNames ?? [],
    geometry: {
      type: 'Point',
      coordinates: [[row.stop_lon, row.stop_lat]],
    },
  };
}

export function agencyPriority(value: unknown): number {
  return normalizeBusSourceAgency(value) === 'sptrans' ? 0 : 1;
}

export function sortBusRoutes<T extends { sourceAgency?: string; shortName?: string; id?: string }>(
  routes: T[],
): T[] {
  return routes.sort(
    (left, right) =>
      agencyPriority(left.sourceAgency) - agencyPriority(right.sourceAgency) ||
      (left.shortName ?? '').localeCompare(right.shortName ?? '') ||
      (left.id ?? '').localeCompare(right.id ?? ''),
  );
}
