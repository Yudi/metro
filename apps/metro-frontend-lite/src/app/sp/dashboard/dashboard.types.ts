import type {
  FavoriteRailLineOption,
  RailLinesStatusResponse,
  RailLineStatus,
  SpecialRailLineStatus,
} from '@metro/shared/utils';
import type {
  LiteDirectionHeadway,
  LiteRailScheduledService,
} from '../../shared/search/lite-search.types';
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
  stopId: string;
  name: string;
  agencies?: string[];
  routeShortNames: string[];
  sourceAgency?: string;
  sourceId?: string;
  platformCode?: string;
  mergedStopIds?: string[];
}

export interface BusRouteGraphQL {
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
      stopId: string;
      name: string;
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
  trains: Omit<LiteNextTrainArrival, 'lineCode' | 'stationCode'>[];
  scheduledServices?: LiteRailScheduledService[];
  headway?: LiteDirectionHeadway[];
  operationClosed?: boolean;
  outOfSchedule?: boolean;
  hasError?: boolean;
}

export interface RoutesForStopResponse {
  data?: {
    routesForStop: BusRouteGraphQL[];
  };
}

export interface DashboardRailStatus {
  lastUpdated: RailLinesStatusResponse['lastUpdated'];
  lines: Pick<
    RailLineStatus,
    'code' | 'statusLabel' | 'statusColor' | 'description' | 'detail'
  >[];
  specialLines?: Pick<
    SpecialRailLineStatus,
    'code' | 'colorHex' | 'line' | 'statusLabel' | 'nextDepartures'
  >[];
}

export interface RailStatusResponse {
  data?: {
    railLinesStatus: DashboardRailStatus;
    railSpecialLinesStatus?: DashboardRailStatus['specialLines'];
  };
}

export interface NextTrainsResponse {
  data?: {
    nextTrains: {
      trains: Omit<LiteNextTrainArrival, 'lineCode' | 'stationCode'>[];
      scheduledServices?: LiteRailScheduledService[];
      headway?: LiteDirectionHeadway[];
      operationClosed?: boolean;
      outOfSchedule?: boolean;
      hasError?: boolean;
    } | null;
  };
}
