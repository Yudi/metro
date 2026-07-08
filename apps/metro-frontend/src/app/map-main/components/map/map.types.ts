import {
  BusRouteGraphQL,
  BusShapeGraphQL,
} from '../../services/geography-graphql.service';
import type {
  LiveTrainTrackingApiId,
  SpecialRailService,
} from '@metro/shared/utils';

export interface BusShapeWithRoute extends BusShapeGraphQL {
  routeInfo?: BusRouteGraphQL;
}

// Selection item types for centralized state management
export interface SelectedRoute {
  id: string; // routeId (e.g., "477A-10")
  shortName: string;
  longName: string;
  color?: string;
  textColor?: string;
}

export interface SelectedStop {
  id: string; // stopId
  name: string;
  latitude: number;
  longitude: number;
  isSubwayStation?: boolean;
}

export interface SelectedBikeStation {
  id: string; // stationId
  name: string;
  latitude: number;
  longitude: number;
}

export interface SearchResult {
  id: string;
  name: string;
  type:
    | 'stop'
    | 'route'
    | 'place'
    | 'bus_stop'
    | 'subway_station'
    | 'bike_station';
  description?: string;
  distance?: number;
  routes?: string[];
  latitude?: number;
  longitude?: number;
  /** Route data for route-type results */
  routeData?: {
    route_id: string;
    route_short_name: string;
    route_long_name: string;
    route_color: string;
    route_text_color: string;
    route_type: number;
    source?: 'gtfs' | 'rail'; // Data source: GTFS (bus) or rail (from RAIL_LINES)
  };
  /** Private API IDs that can serve real-time train data for this station */
  liveTrainTrackingApiIds?: LiveTrainTrackingApiId[];
  /** Line codes for subway stations */
  lineCodes?: number[];
  /** Data source: gtfs (bus), rail (rail lines), gpkg (rail stations), or bike */
  source?: 'gtfs' | 'gpkg' | 'rail' | 'bike';
  specialService?: SpecialRailService;
}

export interface MapSelectionCounts {
  routes: number;
  stops: number;
  displayed: number;
}

export type DisplayMode = 'selected' | 'nearby';

export interface NearbyCenter {
  lat: number;
  lon: number;
}

export interface BikePricingPlan {
  planId: string;
  name: string;
  currency: string;
  initialPrice: number;
  initialPriceFormatted: string;
  activationFee: number | null;
  activationFeeFormatted: string | null;
  perMinuteRate: number | null;
  perMinuteRateFormatted: string | null;
  perMinuteChargingStartsAfterMinutes: number;
  maxUsageMinutes: number | null;
}

export interface BikeVehicleAvailability {
  vehicleTypeId: string;
  name: string;
  formFactor: string;
  propulsionType: string;
  count: number;
  maxRangeMeters: number | null;
  pricingPlan: BikePricingPlan | null;
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

/**
 * Tracks the source/reason for feature creation to enable selective removal
 */
export enum FeatureCreationSource {
  SELECTION = 'selection', // User manually selected this feature
  NEARBY = 'nearby', // Feature created by nearby mode
  ROUTE_DISPLAY = 'route_display', // Feature created when displaying routes
  SUBWAY_SYSTEM = 'subway_system', // Feature created as part of subway system display
  BIKE = 'bike', // Feature created for bike layer
  EXPLORE = 'explore', // Feature created for manually selected explore location
}

/**
 * Type of selection that caused a feature to be created
 */
export type SourceSelectionType = 'route' | 'stop';

/**
 * Tracks which selection(s) caused a feature to be created.
 * Used for efficient cleanup when deselecting items.
 */
export interface FeatureSourceInfo {
  /** The type of selection (route or stop) */
  type: SourceSelectionType;
  /** The ID of the selection (routeId or stopId) */
  id: string;
}
