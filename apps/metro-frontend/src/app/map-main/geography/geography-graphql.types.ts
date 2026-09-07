import type { BusFare } from '@metro/shared/utils';

export interface BusStopGraphQL {
  id: string;
  stopId: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  isSubwayStation: boolean;
  agencies?: string[];
  routeShortNames?: string[];
  sourceAgency?: string;
  sourceId?: string;
  platformCode?: string;
  mergedStopIds?: string[];
  geometry?: {
    type: string;
    coordinates: number[][];
  };
}

export interface BusRouteGraphQL {
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
  geometry?: {
    type: string;
    coordinates: number[][];
  };
}

export interface BusShapeGraphQL {
  id: string;
  shapeId: string;
  geometry: {
    type: string;
    coordinates: number[][];
  };
}

export interface TripGraphQL {
  id: string;
  routeId: string;
  serviceId: string;
  tripId: string;
  tripHeadsign: string;
  directionId: number;
  shapeId: string;
}

/** Combined route data from a single GraphQL query. */
export interface RouteFullDataGraphQL {
  route: BusRouteGraphQL;
  trips?: TripGraphQL[];
  shapes?: BusShapeGraphQL[];
  stops?: BusStopGraphQL[];
}

export interface RouteRailConnectionStationGraphQL {
  id: string;
  name: string;
  agencies: string[];
  lines: string[];
  distanceMeters: number;
  nearStopId: string;
  nearStopName: string;
  stopSequence: number;
}

export interface RouteRailConnectionDirectionGraphQL {
  directionId: number;
  headsign: string;
  stations: RouteRailConnectionStationGraphQL[];
}

export interface RouteRailConnectionGraphQL {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  directions: RouteRailConnectionDirectionGraphQL[];
}

export interface ScheduledBusDepartureGraphQL {
  routeId: string;
  routeShortName: string;
  tripId: string;
  headsign: string;
  directionId: number;
  departureTime: string;
  sourceAgency: string;
  platformCode?: string;
}

/** Combined stop data from a single GraphQL query. */
export interface StopFullDataGraphQL {
  stop: BusStopGraphQL;
  routes: RouteFullDataGraphQL[];
}

export interface StopSearchInput {
  searchTerm?: string;
  bounds?: BoundingBox;
  limit?: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}
