import type { BusFare, SearchTypes } from '@metro/shared/utils';

export interface TypesenseRoute {
  id: string;
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
  source?: 'gtfs' | 'rail';
  sourceAgency?: string;
  sourceId?: string;
  supportsRealtime?: boolean;
  fares?: BusFare[];
}

export interface TypesenseStop {
  id: string;
  stop_id: string;
  stop_name: string;
  stop_desc?: string;
  stop_lat: number;
  stop_lon: number;
  is_subway_station?: boolean;
  source?: 'gtfs' | 'gpkg' | 'bike';
  sourceAgency?: string;
  sourceId?: string;
  platformCode?: string;
  mergedStopIds?: string[];
  routes?: TypesenseRoute[];
}

export interface TypesenseSearchResult {
  type: 'route' | 'stop';
  document: TypesenseRoute | TypesenseStop;
  highlights?: Record<string, string[]>;
  text_match?: number;
}

export interface TypesenseSearchResponse {
  success: boolean;
  query: string;
  results: TypesenseSearchResult[];
  total: number;
  message?: string;
}

export interface SearchHighlightResult {
  field: string;
  snippet: string;
}

export interface SearchGraphQLResultBase {
  __typename:
    | 'SearchBusRoute'
    | 'SearchBusStop'
    | 'SearchRailLine'
    | 'SearchRailStation'
    | 'SearchBikeStation';
  type: SearchTypes;
  score?: number | null;
  highlights?: SearchHighlightResult[] | null;
}

export interface SearchGraphQLBusRoute
  extends SearchGraphQLResultBase,
    TypesenseRoute {
  __typename: 'SearchBusRoute';
}

export interface SearchGraphQLBusStop extends SearchGraphQLResultBase {
  __typename: 'SearchBusStop';
  id: string;
  stop_id: string;
  stop_name: string;
  stop_desc?: string | null;
  stop_lat: number;
  stop_lon: number;
  routes?: SearchGraphQLBusRoute[] | null;
  sourceAgency?: string | null;
  sourceId?: string | null;
  platformCode?: string | null;
  mergedStopIds?: string[] | null;
}

export interface SearchGraphQLRailLine extends SearchGraphQLResultBase {
  __typename: 'SearchRailLine';
  id: string;
  line_code: string;
  line_fullname: string;
  agency: string;
}

export interface SearchGraphQLRailStation extends SearchGraphQLResultBase {
  __typename: 'SearchRailStation';
  id: string;
  station_code: string;
  station_name: string;
  station_aliases?: string[] | null;
  railLatitude?: number | null;
  railLongitude?: number | null;
}

export interface SearchGraphQLBikeStation extends SearchGraphQLResultBase {
  __typename: 'SearchBikeStation';
  id: string;
  station_id: string;
  station_name: string;
  bikeLatitude: number;
  bikeLongitude: number;
}

export type SearchGraphQLResult =
  | SearchGraphQLBusRoute
  | SearchGraphQLBusStop
  | SearchGraphQLRailLine
  | SearchGraphQLRailStation
  | SearchGraphQLBikeStation;

export interface SearchGraphQLResponse {
  data?: {
    search?: SearchGraphQLResult[];
  };
}

export interface NearbyGraphQLResponse {
  data?: {
    nearbyStops?: SearchGraphQLResult[];
  };
}

export interface NearbyStopsResponse {
  success: boolean;
  stops: TypesenseStop[];
  center: { lat: number; lon: number };
  radius: number;
  message?: string;
}
