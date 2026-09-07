import { getLineCodeByColorName, getRailLineByCode } from '@metro/shared/utils';
import type {
  SearchGraphQLResult,
  SearchHighlightResult,
  TypesenseSearchResponse,
  TypesenseSearchResult,
} from './typesense-search.types';

export function mapTypesenseSearchResponse(
  query: string,
  results: SearchGraphQLResult[],
): TypesenseSearchResponse {
  const mappedResults = results
    .map((result): TypesenseSearchResult | null => {
      const highlights = mapHighlights(result.highlights);
      const text_match = result.score ?? undefined;

      if (result.__typename === 'SearchBusRoute') {
        return {
          type: 'route',
          document: {
            id: result.route_id,
            route_id: result.route_id,
            agency_id: '',
            route_short_name: result.route_short_name,
            route_long_name: result.route_long_name,
            route_type: result.route_type,
            route_color: result.route_color || '',
            route_text_color: result.route_text_color || '',
            source: 'gtfs',
            sourceAgency: result.sourceAgency || undefined,
            sourceId: result.sourceId || undefined,
            supportsRealtime: result.supportsRealtime ?? undefined,
            fares: result.fares || undefined,
          },
          highlights,
          text_match,
        };
      }

      if (result.__typename === 'SearchBusStop') {
        return {
          type: 'stop',
          document: {
            id: result.stop_id,
            stop_id: result.stop_id,
            stop_name: result.stop_name,
            stop_desc: result.stop_desc || undefined,
            stop_lat: result.stop_lat,
            stop_lon: result.stop_lon,
            is_subway_station: false,
            source: 'gtfs',
            sourceAgency: result.sourceAgency || undefined,
            sourceId: result.sourceId || undefined,
            platformCode: result.platformCode || undefined,
            mergedStopIds: result.mergedStopIds || undefined,
            routes: (result.routes || []).map((route) => ({
              id: route.id,
              route_id: route.route_id,
              agency_id: '',
              route_short_name: route.route_short_name,
              route_long_name: route.route_long_name,
              route_type: route.route_type,
              route_color: route.route_color || '',
              route_text_color: route.route_text_color || '',
              sourceAgency: route.sourceAgency || undefined,
              sourceId: route.sourceId || undefined,
              supportsRealtime: route.supportsRealtime ?? undefined,
              fares: route.fares || undefined,
            })),
          },
          highlights,
          text_match,
        };
      }

      if (result.__typename === 'SearchRailLine') {
        const lineCode = normalizeRailLineCode(result.line_code);
        return {
          type: 'route',
          document: {
            id: lineCode,
            route_id: lineCode,
            agency_id: result.agency,
            route_short_name: lineCode,
            route_long_name: result.line_fullname,
            route_type: 2,
            route_color: '',
            route_text_color: '',
            source: 'rail',
          },
          highlights,
          text_match,
        };
      }

      if (result.__typename === 'SearchRailStation') {
        const lineNames = getRailLineNamesFromAliases(
          result.station_aliases || [],
        );
        return {
          type: 'stop',
          document: {
            id: result.station_code,
            stop_id: result.station_code,
            stop_name: result.station_name,
            stop_desc:
              lineNames.length > 0
                ? `GeoSampa - ${lineNames.join(', ')}`
                : undefined,
            stop_lat: result.railLatitude || 0,
            stop_lon: result.railLongitude || 0,
            is_subway_station: true,
            source: 'gpkg',
          },
          highlights,
          text_match,
        };
      }

      if (result.__typename === 'SearchBikeStation') {
        return {
          type: 'stop',
          document: {
            id: result.station_id,
            stop_id: result.station_id,
            stop_name: result.station_name,
            stop_lat: result.bikeLatitude,
            stop_lon: result.bikeLongitude,
            source: 'bike',
          },
          highlights,
          text_match,
        };
      }

      return null;
    })
    .filter((result): result is TypesenseSearchResult => result !== null);

  return {
    success: true,
    query,
    results: mappedResults,
    total: mappedResults.length,
  };
}

function normalizeRailLineCode(lineCode: string): string {
  const match = lineCode.match(/\d+/);
  return match ? `L${parseInt(match[0], 10)}` : lineCode;
}

function getRailLineNamesFromAliases(aliases: string[]): string[] {
  const codes = new Set<number>();
  for (const alias of aliases) {
    const code = getLineCodeByColorName(alias);
    if (code !== undefined) codes.add(code);
  }
  return Array.from(codes)
    .sort((a, b) => a - b)
    .map((code) => getRailLineByCode(code)?.colorName)
    .filter((lineName): lineName is string => lineName !== undefined);
}

function mapHighlights(
  highlights?: SearchHighlightResult[] | null,
): Record<string, string[]> | undefined {
  if (!highlights?.length) return undefined;
  return highlights.reduce<Record<string, string[]>>((acc, highlight) => {
    acc[highlight.field] = [...(acc[highlight.field] || []), highlight.snippet];
    return acc;
  }, {});
}
