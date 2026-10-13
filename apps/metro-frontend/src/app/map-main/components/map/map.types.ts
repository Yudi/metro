import {
  BusRouteGraphQL,
  BusShapeGraphQL,
} from '../../geography/geography-graphql.service';
import type {
  LiveTrainTrackingApiId,
  SpecialRailService,
} from '@metro/shared/utils';
import type {
  BikePricingPlan,
  BikeVehicleAvailability,
} from '@metro/shared/bike-contracts';
import type { BusFare } from '@metro/shared/utils';
import type { BusTerminalSummary } from '@metro/shared/bus-terminal-contracts';

export type { BikePricingPlan, BikeVehicleAvailability };

export interface BusShapeWithRoute extends BusShapeGraphQL {
  routeInfo?: BusRouteGraphQL;
}

// Selection item types for centralized state management
export interface SelectedRoute {
  id: string; // Stable selection identity: favoriteCode or legacy routeId.
  routeId?: string; // Actual feed route ID used for route-wide operations.
  shortName: string;
  longName: string;
  destination?: string;
  isCircular?: boolean;
  directionId?: number;
  color?: string;
  textColor?: string;
  sourceAgency?: string;
  supportsRealtime?: boolean;
  fares?: BusFare[];
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
    | 'bus_terminal'
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
    favoriteCode?: string;
    destination?: string;
    isCircular?: boolean;
    directionId?: number;
    route_short_name: string;
    route_long_name: string;
    route_color: string;
    route_text_color: string;
    route_type: number;
    source?: 'gtfs' | 'rail'; // Data source: GTFS (bus) or rail (from RAIL_LINES)
    sourceAgency?: string;
    sourceId?: string;
    supportsRealtime?: boolean;
    fares?: BusFare[];
  };
  /** Private API IDs that can serve real-time train data for this station */
  liveTrainTrackingApiIds?: LiveTrainTrackingApiId[];
  /** Line codes for subway stations */
  lineCodes?: number[];
  /** Data source: gtfs (bus), rail (rail lines), gpkg (rail stations), or bike */
  source?: 'gtfs' | 'gpkg' | 'rail' | 'bike';
  sourceAgency?: string;
  sourceId?: string;
  platformCode?: string;
  mergedStopIds?: string[];
  specialService?: SpecialRailService;
  terminalData?: BusTerminalSummary;
}

export interface MapSelectionCounts {
  routes: number;
  stops: number;
  displayed: number;
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
  /** True when the last on-demand detail request failed or timed out. */
  detailsError?: boolean;
}

/**
 * Tracks the source/reason for feature creation to enable selective removal
 */
export enum FeatureCreationSource {
  SELECTION = 'selection', // User manually selected this feature
  ROUTE_DISPLAY = 'route_display', // Feature created when displaying routes
  SUBWAY_SYSTEM = 'subway_system', // Feature created as part of subway system display
  BIKE = 'bike', // Feature created for bike layer
  ADDRESS_SEARCH = 'address_search', // Pin for a searched address
}
