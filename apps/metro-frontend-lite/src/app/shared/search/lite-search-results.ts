import { RAIL_LINES } from '@metro/shared/utils';
import type { LiteSearchStop, SearchGraphQLResult } from './lite-search.types';

export function processLiteSearchResults(
  rawResults: SearchGraphQLResult[],
): LiteSearchStop[] {
  const results: LiteSearchStop[] = [];

  for (const result of rawResults) {
    if (result.type === 'busStop') {
      results.push({
        id: result.id,
        kind: 'busStop',
        stopId: result.stop_id || result.id,
        name: result.stop_name || '',
        isSubway: false,
        lineCodes: [],
        latitude: result.stop_lat || 0,
        longitude: result.stop_lon || 0,
        routes: (result.routes || []).map((route) => ({
          id: route.id,
          routeId: route.route_id,
          shortName: route.route_short_name,
          longName: route.route_long_name,
          routeType: route.route_type,
          color: route.route_color || '2563eb',
          textColor: route.route_text_color || 'ffffff',
          sourceAgency: route.sourceAgency || undefined,
          sourceId: route.sourceId || undefined,
          supportsRealtime: route.supportsRealtime ?? undefined,
          fares: route.fares || undefined,
        })),
        sourceAgency: result.sourceAgency || undefined,
        sourceId: result.sourceId || undefined,
        platformCode: result.platformCode || undefined,
        mergedStopIds: result.mergedStopIds || undefined,
      });
      continue;
    }

    if (result.type === 'railStation') {
      const name = result.station_name || '';
      const aliases = result.station_aliases || [];
      results.push({
        id: result.id,
        kind: 'railStation',
        stopId: result.station_code || result.id,
        name,
        isSubway: true,
        lineCodes: getRailStationLineCodes(name, aliases),
        latitude: result.railLatitude || 0,
        longitude: result.railLongitude || 0,
        stationAliases: aliases,
        stationCode: result.station_code,
      });
      continue;
    }

    if (result.type === 'bikeStation') {
      results.push({
        id: result.id,
        kind: 'bikeStation',
        stopId: result.station_id || result.id,
        name: result.station_name || '',
        isSubway: false,
        lineCodes: [],
        latitude: result.bikeLatitude || 0,
        longitude: result.bikeLongitude || 0,
      });
    }
  }

  return results;
}

function getRailStationLineCodes(name: string, aliases: string[]): number[] {
  const candidates = [name, ...aliases].map((candidate) =>
    normalizeStationName(candidate),
  );
  const codes = new Set<number>();

  for (const line of RAIL_LINES) {
    if (
      line.stations.some((station) =>
        candidates.includes(normalizeStationName(station.name)),
      )
    ) {
      codes.add(line.code);
    }
  }

  return Array.from(codes).sort((a, b) => a - b);
}

function normalizeStationName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\(linha\s*\d+\)\s*/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toUpperCase();
}
