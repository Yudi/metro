import type { SearchTypes } from '@metro/shared/utils';

export interface RouteDocument {
  id: string;
  type?: 'busRoute';
  route_id: string;
  agency_id: string;
  sourceAgency?: string;
  sourceId?: string;
  supportsRealtime?: boolean;
  faresJson?: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

export interface StopDocument {
  id: string;
  type?: 'busStop';
  stop_id: string;
  stop_name: string;
  stop_desc?: string;
  stop_lat: number;
  stop_lon: number;
  is_subway_station: boolean;
  sourceAgency?: string;
  sourceId?: string;
  platformCode?: string;
  mergedStopIds?: string[];
  agencies?: string[];
}

export interface LineDocument {
  id: string;
  type?: 'railLine';
  line_code: string;
  line_fullname: string;
  agency: string;
}

export interface StationDocument {
  id: string;
  type?: 'railStation';
  station_code: string;
  station_name: string;
  station_aliases: string[];
  location?: [number, number];
}

export interface BikeStationDocument {
  id: string;
  type?: 'bikeStation';
  station_id: string;
  station_name: string;
  location: [number, number];
}

export interface SearchResult {
  type: SearchTypes;
  document:
    | RouteDocument
    | StopDocument
    | LineDocument
    | StationDocument
    | BikeStationDocument;
  highlights?: Record<string, unknown>;
  score?: number;
}

export interface NearbySearchResult {
  type: SearchTypes;
  document: StopDocument | StationDocument | BikeStationDocument;
  highlights?: Record<string, unknown>;
  score?: number;
}

export type NearbySearchDocument =
  | StopDocument
  | StationDocument
  | BikeStationDocument;

export type SearchDocument =
  | RouteDocument
  | StopDocument
  | LineDocument
  | StationDocument
  | BikeStationDocument;
