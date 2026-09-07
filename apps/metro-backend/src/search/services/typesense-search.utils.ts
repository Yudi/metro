import { Client } from 'typesense';
import type { MultiSearchRequestSchema } from 'typesense/lib/Typesense/Types';
import type { SearchResponseHit } from 'typesense/lib/Typesense/Documents';
import {
  SearchTypes,
  SearchTypesEnum,
  StopsAndStations,
} from '@metro/shared/utils';
import {
  BIKE_STATIONS_COLLECTION_NAME,
  GPKG_LINES_COLLECTION_NAME,
  GPKG_STATIONS_COLLECTION_NAME,
  GTFS_ROUTES_COLLECTION_NAME,
  GTFS_STOPS_COLLECTION_NAME,
  MAX_SEARCH_LIMIT,
} from './typesense-schemas';
import {
  BikeStationDocument,
  LineDocument,
  NearbySearchDocument,
  RouteDocument,
  SearchDocument,
  SearchResult,
  StationDocument,
  StopDocument,
} from './typesense.types';

type SearchRequest = MultiSearchRequestSchema<SearchDocument, string>;
type NearbySearchRequest = MultiSearchRequestSchema<
  NearbySearchDocument,
  string
>;

export interface TypesenseSearchContext {
  client: Client;
  getReadCollectionName: (baseName: string) => string;
  assertAvailable: () => void;
  throwSearchFailure: (operation: string, error: unknown) => never;
}

export function normalizeSearchLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
    throw new RangeError(
      `Search limit must be an integer between 1 and ${MAX_SEARCH_LIMIT}`,
    );
  }

  return limit;
}

export async function searchTypesense(
  context: TypesenseSearchContext,
  query: string,
  types: SearchTypes[],
  limit = 10,
): Promise<SearchResult[]> {
  const safeLimit = normalizeSearchLimit(limit);
  const searches: Array<{
    type: SearchTypes;
    request: SearchRequest;
  }> = [];

  if (types.includes('railLine')) {
    searches.push({
      type: SearchTypesEnum.RailLine,
      request: {
        collection: context.getReadCollectionName(GPKG_LINES_COLLECTION_NAME),
        q: query,
        query_by: 'line_code,line_fullname,agency',
        query_by_weights: '8,12,1',
        per_page: safeLimit,
        typo_tokens_threshold: 2,
      },
    });
  }

  if (types.includes('railStation')) {
    searches.push({
      type: SearchTypesEnum.RailStation,
      request: {
        collection: context.getReadCollectionName(
          GPKG_STATIONS_COLLECTION_NAME,
        ),
        q: query,
        query_by: 'station_code,station_name,station_aliases',
        query_by_weights: '2,8,4',
        per_page: safeLimit,
        typo_tokens_threshold: 2,
      },
    });
  }

  if (types.includes('busRoute')) {
    searches.push({
      type: SearchTypesEnum.BusRoute,
      request: {
        collection: context.getReadCollectionName(GTFS_ROUTES_COLLECTION_NAME),
        q: query,
        query_by: 'route_short_name,route_long_name',
        per_page: safeLimit,
        typo_tokens_threshold: 2,
      },
    });
  }

  if (types.includes('busStop')) {
    searches.push({
      type: SearchTypesEnum.BusStop,
      request: {
        collection: context.getReadCollectionName(GTFS_STOPS_COLLECTION_NAME),
        q: query,
        query_by: 'stop_name,stop_desc',
        per_page: safeLimit,
        typo_tokens_threshold: 2,
      },
    });
  }

  if (types.includes('bikeStation')) {
    searches.push({
      type: SearchTypesEnum.BikeStation,
      request: {
        collection: context.getReadCollectionName(
          BIKE_STATIONS_COLLECTION_NAME,
        ),
        q: query,
        query_by: 'station_id,station_name',
        per_page: safeLimit,
        typo_tokens_threshold: 2,
      },
    });
  }

  if (searches.length === 0) {
    return [];
  }

  context.assertAvailable();

  try {
    const results = await context.client.multiSearch.perform<
      SearchDocument[],
      string
    >({
      searches: searches.map((search) => search.request),
    });

    return results.results.flatMap((result, index) =>
      (result.hits ?? [])
        .map((hit) => ({
          type: searches[index].type,
          document: hit.document,
          highlights:
            (hit.highlights as unknown as Record<string, unknown>) || undefined,
          score: hit.text_match,
        }))
        .filter((hit) => !isGtfsRailSearchResult(hit)),
    );
  } catch (error) {
    return context.throwSearchFailure('Search failed', error);
  }
}

export async function searchNearbyStops(
  context: TypesenseSearchContext,
  lat: number,
  lon: number,
  radiusMeters = 1000,
  types: StopsAndStations[] = [
    SearchTypesEnum.BusStop,
    SearchTypesEnum.RailStation,
    SearchTypesEnum.BikeStation,
  ],
  limit = 20,
): Promise<SearchResponseHit<NearbySearchDocument>[]> {
  const searches: Array<{
    type: StopsAndStations;
    request: NearbySearchRequest;
  }> = [];
  const radiusKm = radiusMeters / 1000;

  if (types.includes(SearchTypesEnum.BusStop)) {
    searches.push({
      type: SearchTypesEnum.BusStop,
      request: {
        collection: context.getReadCollectionName(GTFS_STOPS_COLLECTION_NAME),
        q: '*',
        filter_by: `location:(${lat}, ${lon}, ${radiusKm} km)`,
        sort_by: `location(${lat}, ${lon}):asc`,
        per_page: limit,
      },
    });
  }

  if (types.includes(SearchTypesEnum.RailStation)) {
    searches.push({
      type: SearchTypesEnum.RailStation,
      request: {
        collection: context.getReadCollectionName(
          GPKG_STATIONS_COLLECTION_NAME,
        ),
        q: '*',
        filter_by: `location:(${lat}, ${lon}, ${radiusKm} km)`,
        sort_by: `location(${lat}, ${lon}):asc`,
        per_page: limit,
      },
    });
  }

  if (types.includes(SearchTypesEnum.BikeStation)) {
    searches.push({
      type: SearchTypesEnum.BikeStation,
      request: {
        collection: context.getReadCollectionName(
          BIKE_STATIONS_COLLECTION_NAME,
        ),
        q: '*',
        filter_by: `location:(${lat}, ${lon}, ${radiusKm} km)`,
        sort_by: `location(${lat}, ${lon}):asc`,
        per_page: limit,
      },
    });
  }

  if (searches.length === 0) {
    return [];
  }

  context.assertAvailable();

  try {
    const results = await context.client.multiSearch.perform<
      NearbySearchDocument[],
      string
    >({
      searches: searches.map((search) => search.request),
    });

    const hits = results.results
      .flatMap((result, index) =>
        (result.hits ?? []).map((hit) => {
          const targetType = searches[index]?.type;
          let document: NearbySearchDocument;

          if (targetType === SearchTypesEnum.BusStop) {
            document = {
              ...(hit.document as StopDocument),
              type: 'busStop',
            };
          } else if (targetType === SearchTypesEnum.RailStation) {
            document = {
              ...(hit.document as StationDocument),
              type: 'railStation',
            };
          } else {
            document = {
              ...(hit.document as BikeStationDocument),
              type: 'bikeStation',
            };
          }

          return { ...hit, document };
        }),
      )
      .sort((a, b) => {
        const aDist = a.geo_distance_meters?.location ?? Number.MAX_VALUE;
        const bDist = b.geo_distance_meters?.location ?? Number.MAX_VALUE;
        return aDist - bDist;
      });

    return hits.slice(0, limit);
  } catch (error) {
    return context.throwSearchFailure('Nearby stops search failed', error);
  }
}

function isGtfsRailSearchResult(result: SearchResult): boolean {
  if (result.type === SearchTypesEnum.BusRoute) {
    const route = result.document as RouteDocument;
    return isGtfsRailRouteId(route.route_id);
  }

  if (result.type === SearchTypesEnum.BusStop) {
    const stop = result.document as StopDocument;
    return stop.is_subway_station === true;
  }

  return false;
}

function isGtfsRailRouteId(routeId: string): boolean {
  return routeId.startsWith('METRÔ') || routeId.startsWith('CPTM');
}

export type {
  BikeStationDocument,
  LineDocument,
  NearbySearchDocument,
  RouteDocument,
  SearchDocument,
  SearchResult,
  StationDocument,
  StopDocument,
};
