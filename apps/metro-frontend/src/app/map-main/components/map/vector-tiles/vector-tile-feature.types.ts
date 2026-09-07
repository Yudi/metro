export interface BikeStationTileData {
  stationId: string;
  latitude: number;
  longitude: number;
  capacity: number | null;
  effectiveCapacity: number;
  numBikesAvailable: number;
  electricBikesAvailable: number;
}

export interface BikeStationClusterTileData {
  latitude: number;
  longitude: number;
  capacity: number | null;
  effectiveCapacity: number;
  numBikesAvailable: number;
  electricBikesAvailable: number;
  stationCount: number;
}

export interface RailStationTileData {
  id: string;
  name: string;
  agencies: string[];
  lines: string[];
  isMerged: boolean;
}

export interface RailRouteTileData {
  id: number;
  name?: string;
  lineNumber?: number;
  lineCode?: number;
  colorHex?: string;
  agency: string;
}

export interface BusStopTileData {
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
  sourceAgency?: string;
  sourceId?: string;
  platformCode?: string;
  mergedStopIds?: string[];
}

export interface BusRouteTileData {
  routeId: string;
  shortName: string;
  longName: string;
  color: string;
  textColor: string;
  sourceAgency?: string;
  sourceId?: string;
  supportsRealtime?: boolean;
}
