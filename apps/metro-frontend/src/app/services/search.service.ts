import { Injectable, inject } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DocumentNode } from 'graphql';

export interface Route {
  id: string;
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

export interface Stop {
  id: string;
  stop_id: string;
  stop_name: string;
  stop_desc?: string;
  stop_lat: number;
  stop_lon: number;
}

export interface Trip {
  id: string;
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign: string;
  direction_id: number;
  shape_id: string;
}

export interface Calendar {
  id: string;
  service_id: string;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
  start_date: string;
  end_date: string;
}

export interface SearchHighlight {
  field: string;
  snippet: string;
}

export interface RouteSearchResult {
  type: string;
  route: Route;
  highlights?: SearchHighlight[];
}

export interface StopSearchResult {
  type: string;
  stop: Stop;
  highlights?: SearchHighlight[];
}

export interface SearchResults {
  routes: RouteSearchResult[];
  stops: StopSearchResult[];
  total: number;
}

export interface RouteDetails {
  route: Route;
  trips: Trip[];
  calendars: Calendar[];
  totalTrips: number;
}

export interface StopTime {
  id: string;
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: number;
}

export interface StopDetails {
  stop: Stop;
  routes: Route[];
  trips: Trip[];
  calendars: Calendar[];
  stopTimes: StopTime[];
}

export interface RouteShape {
  shape_id: string;
  geometry: string;
}

// GraphQL Response Types
interface SearchResponse {
  search: SearchGraphQLResult[];
}

interface SearchGraphQLHighlight {
  field: string;
  snippet: string;
}

interface SearchGraphQLBusRoute {
  __typename: 'SearchBusRoute';
  type: string;
  highlights?: SearchGraphQLHighlight[];
  id: string;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color?: string | null;
  route_text_color?: string | null;
}

interface SearchGraphQLBusStop {
  __typename: 'SearchBusStop';
  type: string;
  highlights?: SearchGraphQLHighlight[];
  id: string;
  stop_id: string;
  stop_name: string;
  stop_desc?: string | null;
  stop_lat: number;
  stop_lon: number;
}

type SearchGraphQLResult = SearchGraphQLBusRoute | SearchGraphQLBusStop;

interface NearbyStopsResponse {
  nearbyStops: Stop[];
}

interface RouteDetailsResponse {
  routeDetails: RouteDetails | null;
}

interface StopDetailsResponse {
  stopDetails: StopDetails | null;
}

interface RouteShapeResponse {
  routeShape: RouteShape[];
}

interface ReindexResponse {
  reindexSearch: boolean;
}

const SEARCH_QUERY = gql`
  query Search($input: SearchFiltersInput!) {
    search(input: $input) {
      __typename
      ... on SearchBusRoute {
        type
        id
        route_id
        route_short_name
        route_long_name
        route_type
        route_color
        route_text_color
        highlights {
          field
          snippet
        }
      }
      ... on SearchBusStop {
        type
        id
        stop_id
        stop_name
        stop_desc
        stop_lat
        stop_lon
        highlights {
          field
          snippet
        }
      }
    }
  }
`;

const NEARBY_STOPS_QUERY = gql`
  query NearbyStops($input: NearbyStopsInput!) {
    nearbyStops(input: $input) {
      id
      stop_id
      stop_name
      stop_desc
      stop_lat
      stop_lon
    }
  }
`;

const ROUTE_DETAILS_QUERY = gql`
  query RouteDetails($routeId: String!) {
    routeDetails(routeId: $routeId) {
      route {
        id
        route_id
        agency_id
        route_short_name
        route_long_name
        route_type
        route_color
        route_text_color
      }
      trips {
        id
        route_id
        service_id
        trip_id
        trip_headsign
        direction_id
        shape_id
      }
      calendars {
        id
        service_id
        monday
        tuesday
        wednesday
        thursday
        friday
        saturday
        sunday
        start_date
        end_date
      }
      totalTrips
    }
  }
`;

const STOP_DETAILS_QUERY = gql`
  query StopDetails($stopId: String!) {
    stopDetails(stopId: $stopId) {
      stop {
        id
        stop_id
        stop_name
        stop_desc
        stop_lat
        stop_lon
      }
      routes {
        id
        route_id
        agency_id
        route_short_name
        route_long_name
        route_type
        route_color
        route_text_color
      }
      trips {
        id
        route_id
        service_id
        trip_id
        trip_headsign
        direction_id
        shape_id
      }
      calendars {
        id
        service_id
        monday
        tuesday
        wednesday
        thursday
        friday
        saturday
        sunday
        start_date
        end_date
      }
      stopTimes {
        id
        trip_id
        arrival_time
        departure_time
        stop_id
        stop_sequence
      }
    }
  }
`;

const ROUTE_SHAPE_QUERY = gql`
  query RouteShape($routeId: String!) {
    routeShape(routeId: $routeId) {
      shape_id
      geometry
    }
  }
`;

const REINDEX_MUTATION: DocumentNode = gql`
  mutation ReindexSearch {
    reindexSearch
  }
`;

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  private apollo = inject(Apollo);

  search(
    query: string,
    type?: 'route' | 'stop',
    limit = 10
  ): Observable<SearchResults> {
    return this.apollo
      .query<SearchResponse>({
        query: SEARCH_QUERY,
        variables: {
          input: {
            query,
            limit,
            includeBusRoutes: type !== 'stop',
            includeBusStops: type !== 'route',
            includeRailLines: false,
            includeRailStations: false,
            includeBikeStations: false,
          },
        },
      })
      .pipe(
        map((result) => {
          const searchData = (result.data?.search || []) as SearchGraphQLResult[];
          return this.mapSearchResults(searchData);
        })
      );
  }

  private mapSearchResults(results: SearchGraphQLResult[]): SearchResults {
    const mapped: SearchResults = {
      routes: [],
      stops: [],
      total: results.length,
    };

    for (const result of results) {
      if (result.__typename === 'SearchBusRoute') {
        mapped.routes.push({
          type: result.type,
          route: {
            id: result.id,
            route_id: result.route_id,
            agency_id: '',
            route_short_name: result.route_short_name,
            route_long_name: result.route_long_name,
            route_type: result.route_type,
            route_color: result.route_color || '',
            route_text_color: result.route_text_color || '',
          },
          highlights: result.highlights,
        });
        continue;
      }

      mapped.stops.push({
        type: result.type,
        stop: {
          id: result.id,
          stop_id: result.stop_id,
          stop_name: result.stop_name,
          stop_desc: result.stop_desc || undefined,
          stop_lat: result.stop_lat,
          stop_lon: result.stop_lon,
        },
        highlights: result.highlights,
      });
    }

    return mapped;
  }

  searchNearbyStops(
    latitude: number,
    longitude: number,
    radiusMeters = 1000,
    limit = 20
  ): Observable<Stop[]> {
    return this.apollo
      .query<NearbyStopsResponse>({
        query: NEARBY_STOPS_QUERY,
        variables: {
          input: {
            latitude,
            longitude,
            radiusMeters,
            limit,
          },
        },
      })
      .pipe(
        map((result) => {
          const stopsData = result.data?.nearbyStops;
          return stopsData ? (stopsData as Stop[]) : [];
        })
      );
  }

  getRouteDetails(routeId: string): Observable<RouteDetails | null> {
    return this.apollo
      .query<RouteDetailsResponse>({
        query: ROUTE_DETAILS_QUERY,
        variables: { routeId },
      })
      .pipe(
        map((result) => {
          const routeData = result.data?.routeDetails;
          return routeData ? (routeData as RouteDetails) : null;
        })
      );
  }

  getStopDetails(stopId: string): Observable<StopDetails | null> {
    return this.apollo
      .query<StopDetailsResponse>({
        query: STOP_DETAILS_QUERY,
        variables: { stopId },
      })
      .pipe(
        map((result) => {
          const stopData = result.data?.stopDetails;
          return stopData ? (stopData as StopDetails) : null;
        })
      );
  }

  getRouteShape(routeId: string): Observable<RouteShape[]> {
    return this.apollo
      .query<RouteShapeResponse>({
        query: ROUTE_SHAPE_QUERY,
        variables: { routeId },
      })
      .pipe(
        map((result) => {
          const shapeData = result.data?.routeShape;
          return shapeData ? (shapeData as RouteShape[]) : [];
        })
      );
  }

  reindexSearch(): Observable<boolean> {
    return this.apollo
      .mutate<ReindexResponse>({
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - Apollo Angular type definition issue
        mutation: REINDEX_MUTATION,
      })
      .pipe(map((result) => result.data?.reindexSearch ?? false));
  }
}
