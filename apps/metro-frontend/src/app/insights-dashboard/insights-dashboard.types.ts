import type { FavoriteRailLineOption } from '@metro/shared/utils';
import type { BusStopGraphQL } from '../map-main/geography/geography-graphql.service';

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

export interface BusStopInsight extends BusStopGraphQL {
  routeShortNames: string[];
}

export interface RailStationInsight {
  key: string;
  name: string;
  lineCodes: number[];
  lines: FavoriteRailLineOption[];
}

export interface MergedRailStationInsight {
  id: string;
  name: string;
  lines: string[];
}

export interface AgencyIdentity {
  name: string;
  iconPath: string | null;
}

export interface BusFavoritesLookupResponse {
  data: {
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
