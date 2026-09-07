export const GTFS_ROUTES_COLLECTION_NAME = 'metro-sptrans-gtfs-routes';
export const GTFS_STOPS_COLLECTION_NAME = 'metro-sptrans-gtfs-stops';
export const GPKG_LINES_COLLECTION_NAME = 'metro-rail-lines';
export const GPKG_STATIONS_COLLECTION_NAME = 'metro-rail-stations';
export const BIKE_STATIONS_COLLECTION_NAME = 'metro-bike-stations';

export const GTFS_ROUTES_SCHEMA = {
  name: GTFS_ROUTES_COLLECTION_NAME,
  fields: [
    { name: 'route_id', type: 'string', sort: true },
    { name: 'agency_id', type: 'string' },
    { name: 'sourceAgency', type: 'string', optional: true },
    { name: 'sourceId', type: 'string', optional: true },
    { name: 'supportsRealtime', type: 'bool', optional: true, index: false },
    { name: 'faresJson', type: 'string', optional: true, index: false },
    { name: 'route_short_name', type: 'string' },
    { name: 'route_long_name', type: 'string' },
    { name: 'route_type', type: 'int32' },
    { name: 'route_color', type: 'string' },
    { name: 'route_text_color', type: 'string' },
  ],
  default_sorting_field: 'route_id',
};

export const GTFS_STOPS_SCHEMA = {
  name: GTFS_STOPS_COLLECTION_NAME,
  fields: [
    { name: 'stop_id', type: 'string', sort: true },
    { name: 'stop_name', type: 'string' },
    { name: 'stop_desc', type: 'string', optional: true },
    { name: 'stop_lat', type: 'float' },
    { name: 'stop_lon', type: 'float' },
    { name: 'location', type: 'geopoint' },
    { name: 'is_subway_station', type: 'bool' },
    { name: 'sourceAgency', type: 'string', optional: true },
    { name: 'sourceId', type: 'string', optional: true },
    { name: 'platformCode', type: 'string', optional: true },
    { name: 'mergedStopIds', type: 'string[]', optional: true },
    { name: 'agencies', type: 'string[]', optional: true },
  ],
  default_sorting_field: 'stop_id',
};

export const GPKG_LINES_SCHEMA = {
  name: GPKG_LINES_COLLECTION_NAME,
  fields: [
    { name: 'line_code', type: 'string', sort: true },
    { name: 'line_fullname', type: 'string' },
    { name: 'agency', type: 'string' },
  ],
  default_sorting_field: 'line_code',
};

export const GPKG_STATIONS_SCHEMA = {
  name: GPKG_STATIONS_COLLECTION_NAME,
  fields: [
    { name: 'station_code', type: 'string', sort: true },
    { name: 'station_name', type: 'string' },
    { name: 'station_aliases', type: 'string[]' },
    { name: 'location', type: 'geopoint', optional: true },
  ],
  default_sorting_field: 'station_code',
};

export const BIKE_STATIONS_SCHEMA = {
  name: BIKE_STATIONS_COLLECTION_NAME,
  fields: [
    { name: 'station_id', type: 'string', sort: true },
    { name: 'station_name', type: 'string' },
    { name: 'location', type: 'geopoint' },
  ],
  default_sorting_field: 'station_id',
};

export const TYPESENSE_COLLECTION_SCHEMAS: Array<[string, unknown]> = [
  [GTFS_ROUTES_COLLECTION_NAME, GTFS_ROUTES_SCHEMA],
  [GTFS_STOPS_COLLECTION_NAME, GTFS_STOPS_SCHEMA],
  [GPKG_LINES_COLLECTION_NAME, GPKG_LINES_SCHEMA],
  [GPKG_STATIONS_COLLECTION_NAME, GPKG_STATIONS_SCHEMA],
  [BIKE_STATIONS_COLLECTION_NAME, BIKE_STATIONS_SCHEMA],
];

export const DEFAULT_CONNECTION_TIMEOUT_SECONDS = 1;
export const DEFAULT_RECOVERY_INTERVAL_MS = 15_000;
export const MAX_SEARCH_LIMIT = 100;

export const TYPESENSE_BASE_COLLECTION_NAMES = [
  GTFS_ROUTES_COLLECTION_NAME,
  GTFS_STOPS_COLLECTION_NAME,
  GPKG_LINES_COLLECTION_NAME,
  GPKG_STATIONS_COLLECTION_NAME,
  BIKE_STATIONS_COLLECTION_NAME,
];
