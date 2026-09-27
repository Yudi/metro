import type {
  RouteDocument,
  SearchResult,
  LineDocument,
  StationDocument,
  StopDocument,
} from '../services/typesense.types';

export function busRouteSearchResult(
  overrides: Partial<RouteDocument> & { score?: number } = {},
): SearchResult {
  const { score = 0, ...documentOverrides } = overrides;
  return {
    type: 'busRoute',
    score,
    highlights: {},
    document: {
      id: 'route-477A',
      route_id: '477A',
      agency_id: 'sptrans:1',
      route_short_name: '477A',
      route_long_name: 'Interlagos - Metrô Praça da Árvore',
      route_type: 3,
      route_color: 'FFFFFF',
      route_text_color: '000000',
      ...documentOverrides,
    },
  };
}

export function busStopSearchResult(
  overrides: Partial<StopDocument> & { score?: number } = {},
): SearchResult {
  const { score = 0, ...documentOverrides } = overrides;
  return {
    type: 'busStop',
    score,
    highlights: {},
    document: {
      id: 'stop-1',
      stop_id: 'stop-1',
      stop_name: 'Terminal Interlagos',
      stop_lat: -23.7,
      stop_lon: -46.7,
      is_subway_station: false,
      ...documentOverrides,
    },
  };
}

export function railLineSearchResult(
  overrides: Partial<LineDocument> & { score?: number } = {},
): SearchResult {
  const { score = 0, ...documentOverrides } = overrides;
  return {
    type: 'railLine',
    score,
    highlights: {},
    document: {
      id: '1',
      line_code: '1',
      line_fullname: 'Linha 1 - Azul',
      agency: 'Metrô',
      ...documentOverrides,
    },
  };
}

export function railStationSearchResult(
  overrides: Partial<StationDocument> & { score?: number } = {},
): SearchResult {
  const { score = 0, ...documentOverrides } = overrides;
  return {
    type: 'railStation',
    score,
    highlights: {},
    document: {
      id: 'station-1',
      station_code: 'station-1',
      station_name: 'República',
      station_aliases: [],
      location: [-23.55, -46.63],
      ...documentOverrides,
    },
  };
}
