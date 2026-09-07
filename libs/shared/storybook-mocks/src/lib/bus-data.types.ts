/**
 * Shared mock types for bus and bike Storybook fixtures.
 */
import type {
  BikePricingPlan,
  BikeVehicleAvailability,
} from '@metro/shared/bike-contracts';
import type { BusFare } from '@metro/shared/utils';

export type { BikePricingPlan, BikeVehicleAvailability };

// Types

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

export interface VehiclePosition {
  p: number;
  a: boolean;
  ta: string;
  py: number;
  px: number;
  t?: string;
  heading?: number | null;
}

export interface LineWithVehicles {
  c: string;
  cl: number;
  sl: number;
  lt0: string;
  lt1: string;
  qv: number;
  vs: VehiclePosition[];
}

export interface VehiclePositionUpdate {
  routeShortName: string;
  hr: string;
  l: LineWithVehicles[];
  cacheTimestamp: number;
}

export interface StopArrivalUpdate {
  stopCode: string;
  hr: string;
  p: {
    cp: number;
    np: string;
    py: number;
    px: number;
    l: LineWithVehicles[];
  };
  cacheTimestamp: number;
}

export interface BikeStation {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  capacity: number | null;
  effectiveCapacity: number;
  numBikesAvailable: number;
  numBikesDisabled: number;
  numDocksAvailable: number;
  numDocksDisabled: number;
  status: string;
  isInstalled: boolean;
  isRenting: boolean;
  isReturning: boolean;
  lastReported: number;
  lastReportedIso: string;
  fetchedAt: number;
  electricBikesAvailable: number;
  hasElectricBikesAvailable: boolean;
  vehicleAvailability: BikeVehicleAvailability[];
  detailsLoaded: boolean;
}

export type RealtimeFetchKind =
  | 'arrivals'
  | 'no-arrivals'
  | 'loading'
  | 'error';

export interface MockRealtimeServiceOptions {
  /** Kind of result to return from realtime service */
  fetchKind: RealtimeFetchKind;
  /** Pre-populated arrivals data (optional) */
  arrivals?: Map<string, StopArrivalUpdate>;
}
