import type {
  BusFare,
  DirectionHeadway,
  ExtendedNextTrainLineCode,
  RailScheduledService,
} from '@metro/shared/utils';

/**
 * Minimal search result for lite version
 */
export type LiteSearchResultKind = 'busStop' | 'railStation' | 'bikeStation';

export interface LiteBusRoute {
  id: string;
  routeId: string;
  shortName: string;
  longName: string;
  routeType: number;
  color: string;
  textColor: string;
  sourceAgency?: string;
  sourceId?: string;
  supportsRealtime?: boolean;
  fares?: BusFare[];
}

export interface LiteBikeAvailability {
  stationId: string;
  capacity: number | null;
  effectiveCapacity: number;
  numBikesAvailable: number;
  electricBikesAvailable: number;
}

export interface LiteSearchStop {
  id: string;
  kind: LiteSearchResultKind;
  stopId: string;
  name: string;
  isSubway: boolean;
  lineCodes: number[];
  latitude: number;
  longitude: number;
  /** Route short names for this stop (e.g., "METRÔ L1-AZUL") */
  routeShortNames?: string[];
  routes?: LiteBusRoute[];
  bikeAvailability?: LiteBikeAvailability;
  stationAliases?: string[];
  stationCode?: string;
  sourceAgency?: string;
  sourceId?: string;
  platformCode?: string;
  mergedStopIds?: string[];
}

/**
 * Next train arrival data
 */
export interface LiteNextTrainArrival {
  lineCode: string;
  stationCode: string;
  destinationCode: string;
  destinationName: string;
  arrivalTime: string;
  isAtPlatform: boolean;
}

export interface LiteNextTrainsResult {
  trains: LiteNextTrainArrival[];
  scheduledServices: RailScheduledService[];
  headway?: DirectionHeadway[];
  operationClosed?: boolean;
  outOfSchedule?: boolean;
  hasError?: boolean;
}

/**
 * Station info for next train feature (L4/L8/L9)
 */
export interface NextTrainStationInfo {
  lineCode: ExtendedNextTrainLineCode;
  stationCode: string;
}

export interface LiteRouteRailConnectionStation {
  id: string;
  name: string;
  agencies: string[];
  lines: string[];
  distanceMeters: number;
  nearStopId: string;
  nearStopName: string;
  stopSequence: number;
}

export interface LiteRouteRailConnectionDirection {
  directionId: number;
  headsign: string;
  stations: LiteRouteRailConnectionStation[];
}

export interface LiteRouteRailConnection {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  directions: LiteRouteRailConnectionDirection[];
}

export interface GraphQLResponse<T> {
  data?: T;
}

export interface SearchGraphQLResult {
  __typename: string;
  id: string;
  type: LiteSearchResultKind;
  score?: number | null;
  stop_id?: string;
  stop_name?: string;
  stop_desc?: string | null;
  stop_lat?: number;
  stop_lon?: number;
  routes?: LiteBusRouteGraphQL[];
  sourceAgency?: string;
  sourceId?: string;
  platformCode?: string;
  mergedStopIds?: string[];
  station_code?: string;
  station_name?: string;
  station_aliases?: string[] | null;
  railLatitude?: number | null;
  railLongitude?: number | null;
  bikeLatitude?: number | null;
  bikeLongitude?: number | null;
  station_id?: string;
}

export interface LiteBusRouteGraphQL {
  id: string;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color?: string | null;
  route_text_color?: string | null;
  sourceAgency?: string | null;
  sourceId?: string | null;
  supportsRealtime?: boolean | null;
  fares?: BusFare[] | null;
}

export interface LiteScheduledBusDeparture {
  routeId: string;
  routeShortName: string;
  tripId: string;
  headsign: string;
  directionId: number;
  departureTime: string;
  sourceAgency: string;
  platformCode?: string;
}

export interface BikeStationsSummaryPayload {
  stations: LiteBikeAvailability[];
}
