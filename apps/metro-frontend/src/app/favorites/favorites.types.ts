import type { FavoriteRailLineOption } from '@metro/shared/utils';

export interface FavoriteRailStation {
  id: string;
  name: string;
  favoriteIds: string[];
  lines: FavoriteRailLineOption[];
}

export interface MergedRailStationFavorite {
  id: string;
  name: string;
  lines: string[];
}

export interface AgencyIdentity {
  name: string;
  iconPath: string | null;
}

export interface FavoriteBusRoute {
  routeId: string;
  shortName: string;
  longName: string;
  sourceAgency?: string;
  color?: string;
  textColor?: string;
  fares?: Array<{ price: number; currency: string }>;
}

export interface FavoriteBusStop {
  stopId: string;
  name: string;
  sourceId?: string;
  platformCode?: string;
  favoriteId?: string;
  mergedStopIds?: string[];
}

export interface FavoriteBusLookupResponse {
  data: {
    multipleBusRoutes: FavoriteBusRoute[];
    multipleBusStops: FavoriteBusStop[];
  };
}
