/**
 * Shared types for rail (Metro and CPTM) data
 * Used across frontend and backend
 */

/**
 * Rail station from vector tile (MVT feature properties)
 * Based on mvt_rail_stations materialized view
 */
export interface RailStationFeature {
  id: number;
  name: string;
  line?: string; // Line name (e.g., "VERMELHA", "L07")
  agency: 'METRO' | 'CPTM';
  status?: string; // e.g., "OPERANDO"
}

/**
 * Rail route from vector tile (MVT feature properties)
 * Based on mvt_rail_routes materialized view
 */
export interface RailRouteFeature {
  id: number;
  name?: string; // Line name (e.g., "VERMELHA")
  line_number?: number; // Line number (e.g., 7, 8)
  agency: 'METRO' | 'CPTM';
}

/**
 * Full rail station with geometry (GeoJSON)
 */
export interface RailStation {
  id: number;
  name: string;
  line?: string;
  agency: 'METRO' | 'CPTM';
  status?: string;
  geometry?: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
}

/**
 * Full rail route with geometry (GeoJSON)
 */
export interface RailRoute {
  id: number;
  name?: string;
  line_number?: number;
  agency: 'METRO' | 'CPTM';
  geometry?: {
    type: 'LineString';
    coordinates: number[][]; // [[lon, lat], [lon, lat], ...]
  };
}

/**
 * Vector tile layer names for rail data
 */
export enum RailVectorTileLayer {
  RAIL_STATIONS = 'rail-stations',
  RAIL_ROUTES = 'rail-routes',
}

/**
 * Rail data source types (GeoSampa sources)
 */
export type RailDataSource =
  | 'metro_station'
  | 'metro_line'
  | 'trem_station'
  | 'trem_line';

/**
 * Rail agency identifiers
 */
export type RailAgency = 'METRO' | 'CPTM';

/**
 * Check if a feature is from a rail agency (Metro or CPTM)
 */
export function isRailAgency(agency: string): agency is RailAgency {
  return agency === 'METRO' || agency === 'CPTM';
}
