import type { SearchTypes } from '@metro/shared/utils';

export interface NextArrivalComponentSearchResult {
  data?: {
    search: NextArrivalSearchItem[];
  };
}

interface NextArrivalSearchItemBase {
  __typename:
    | 'SearchBusStop'
    | 'SearchRailStation'
    | 'SearchBusRoute'
    | 'SearchRailLine'
    | 'SearchBikeStation';
  type: SearchTypes;
  score?: number | null;
  highlights?: {
    field: string;
    snippet: string;
  }[];
}

export type NextArrivalSearchItem =
  | BusStopResult
  | RailStationResult
  | BusRouteResult
  | RailLineResult
  | BikeStationResult;

interface RailStationResult extends NextArrivalSearchItemBase {
  __typename: 'SearchRailStation';
  id: string;
  station_code: string;
  station_name: string;
  station_aliases?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface BusRouteResult extends NextArrivalSearchItemBase {
  __typename: 'SearchBusRoute';
  id: string;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
}

interface BusStopResult extends NextArrivalSearchItemBase {
  __typename: 'SearchBusStop';
  id: string;
  stop_id: string;
  stop_name: string;
  stop_desc: string | null;
  stop_lat: number;
  stop_lon: number;
  sourceAgency?: string | null;
  sourceId?: string | null;
  platformCode?: string | null;
  mergedStopIds?: string[] | null;
  routes: {
    route_id?: string;
    route_short_name: string;
  }[];
}

interface RailLineResult extends NextArrivalSearchItemBase {
  __typename: 'SearchRailLine';
  id: string;
  line_code: string;
  line_fullname: string;
  agency: string;
}

interface BikeStationResult extends NextArrivalSearchItemBase {
  __typename: 'SearchBikeStation';
  id: string;
  station_id: string;
  station_name: string;
  latitude: number;
  longitude: number;
}

export const STOP_SEARCH_QUERY = `
    query StopSearch($input: SearchFiltersInput!) {
      search(input: $input) {
        __typename
        ... on SearchBusStop {
          id
          type
          score
          stop_id
          stop_name
          stop_desc
          stop_lat
          stop_lon
          sourceAgency
          sourceId
          platformCode
          mergedStopIds
          routes {
            route_id
            route_short_name
          }
          highlights {
            field
            snippet
          }
        }
        ... on SearchRailStation {
          id
          type
          score
          station_code
          station_name
          station_aliases
          latitude
          longitude
          highlights {
            field
            snippet
          }
        }
      }
    }
  `;
