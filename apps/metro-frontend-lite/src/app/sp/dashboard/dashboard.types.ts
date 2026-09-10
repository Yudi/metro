import type {
  FavoriteRailLineOption,
  DirectionHeadway,
  RailLinesStatusResponse,
  RailScheduledService,
} from '@metro/shared/utils';
import type { LiteNextTrainArrival } from '../../shared/search/lite-search.service';

export interface BusRouteInsight {
  routeId: string;
  shortName: string;
  longName: string;
  color?: string;
  textColor?: string;
  sourceAgency?: string;
  sourceId?: string;
  supportsRealtime?: boolean;
  fares?: Array<{ price: number; currency: string }>;
}

export type LiteAgencyKey = 'artesp' | 'sptrans';

export interface LiteAgencyDisplay {
  key: LiteAgencyKey | null;
  label: string;
}

export interface BusStopInsight {
  id: string;
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
  isSubwayStation: boolean;
  agencies?: string[];
  routeShortNames: string[];
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
  color?: string;
  textColor?: string;
  sourceAgency?: string;
  sourceId?: string;
  supportsRealtime?: boolean;
  fares?: Array<{ price: number; currency: string }>;
}

export interface BusFavoritesLookupResponse {
  data?: {
    multipleBusRoutes: BusRouteInsight[];
    multipleBusStops: Array<{
      id: string;
      stopId: string;
      name: string;
      latitude: number;
      longitude: number;
      isSubwayStation: boolean;
      agencies?: string[];
      routeShortNames?: string[];
      sourceAgency?: string;
      sourceId?: string;
      platformCode?: string;
      mergedStopIds?: string[];
    }>;
  };
}

export interface MergedRailStationInsight {
  id: string;
  name: string;
  lines: string[];
}

export interface RailStationInsight {
  key: string;
  name: string;
  lineCodes: number[];
  lines: FavoriteRailLineOption[];
}

export interface RailNextTrainGroup {
  key: string;
  stationName: string;
  line: FavoriteRailLineOption;
  trains: LiteNextTrainArrival[];
  scheduledServices?: RailScheduledService[];
  headway?: DirectionHeadway[];
  operationClosed?: boolean;
  outOfSchedule?: boolean;
  hasError?: boolean;
}

export interface RoutesForStopResponse {
  data?: {
    routesForStop: BusRouteGraphQL[];
  };
}

export interface RailStatusResponse {
  data?: {
    railLinesStatus: RailLinesStatusResponse;
    railSpecialLinesStatus?: RailLinesStatusResponse['specialLines'];
  };
}

export interface NextTrainsResponse {
  data?: {
    nextTrains: {
      trains: LiteNextTrainArrival[];
      scheduledServices?: RailScheduledService[];
      headway?: DirectionHeadway[];
      operationClosed?: boolean;
      outOfSchedule?: boolean;
      hasError?: boolean;
    } | null;
  };
}
