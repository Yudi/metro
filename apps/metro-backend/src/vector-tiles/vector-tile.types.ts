/**
 * Available vector tile layers.
 */
export enum VectorTileLayer {
  RAIL_STATIONS = 'rail-stations',
  RAIL_ROUTES = 'rail-routes',
  BUS_ROUTES = 'bus-routes',
  BUS_STOPS = 'bus-stops',
  BIKE_STATIONS = 'bike-stations',
  // Legacy layers (deprecated, kept for backwards compatibility)
  SUBWAY_STATIONS = 'subway-stations',
  SUBWAY_ROUTES = 'subway-routes',
}

export interface VectorTileOptions {
  routeIds?: string[];
  stopIds?: string[];
  nearby?: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
}

/**
 * Tile bounds in Web Mercator (EPSG:3857) coordinates.
 */
export interface TileBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
