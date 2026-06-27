import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'typesense';
import type { MultiSearchRequestSchema } from 'typesense/lib/Typesense/Types';
import {
  SearchTypes,
  SearchTypesEnum,
  StopsAndStations,
} from '@metro/shared/utils';
import { SearchResponseHit } from 'typesense/lib/Typesense/Documents';

export interface RouteDocument {
  id: string;
  type?: 'busRoute';
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

export interface StopDocument {
  id: string;
  type?: 'busStop';
  stop_id: string;
  stop_name: string;
  stop_desc?: string;
  stop_lat: number;
  stop_lon: number;
  is_subway_station: boolean;
}

export interface LineDocument {
  id: string;
  type?: 'railLine';
  line_code: string;
  line_fullname: string;
  agency: string;
}

export interface StationDocument {
  id: string;
  type?: 'railStation';
  station_code: string;
  station_name: string;
  station_aliases: string[];
  location?: [number, number];
}

export interface BikeStationDocument {
  id: string;
  type?: 'bikeStation';
  station_id: string;
  station_name: string;
  location: [number, number];
}

export interface SearchResult {
  type: SearchTypes;
  document:
    | RouteDocument
    | StopDocument
    | LineDocument
    | StationDocument
    | BikeStationDocument;
  highlights?: Record<string, unknown>;
  score?: number;
}

export interface NearbySearchResult {
  type: SearchTypes;
  document: StopDocument | StationDocument | BikeStationDocument;
  highlights?: Record<string, unknown>;
  score?: number;
}

export type NearbySearchDocument =
  | StopDocument
  | StationDocument
  | BikeStationDocument;

type SearchDocument =
  | RouteDocument
  | StopDocument
  | LineDocument
  | StationDocument
  | BikeStationDocument;

type SearchRequest = MultiSearchRequestSchema<SearchDocument, string>;

type NearbySearchRequest = MultiSearchRequestSchema<
  NearbySearchDocument,
  string
>;

const GTFS_ROUTES_COLLECTION_NAME = 'metro-sptrans-gtfs-routes';
const GTFS_STOPS_COLLECTION_NAME = 'metro-sptrans-gtfs-stops';
const GPKG_LINES_COLLECTION_NAME = 'metro-rail-lines';
const GPKG_STATIONS_COLLECTION_NAME = 'metro-rail-stations';
const BIKE_STATIONS_COLLECTION_NAME = 'metro-bike-stations';

const GTFS_ROUTES_SCHEMA = {
  name: GTFS_ROUTES_COLLECTION_NAME,
  fields: [
    { name: 'route_id', type: 'string', sort: true },
    { name: 'agency_id', type: 'string' },
    { name: 'route_short_name', type: 'string' },
    { name: 'route_long_name', type: 'string' },
    { name: 'route_type', type: 'int32' },
    { name: 'route_color', type: 'string' },
    { name: 'route_text_color', type: 'string' },
  ],
  default_sorting_field: 'route_id',
};

const GTFS_STOPS_SCHEMA = {
  name: GTFS_STOPS_COLLECTION_NAME,
  fields: [
    { name: 'stop_id', type: 'string', sort: true },
    { name: 'stop_name', type: 'string' },
    { name: 'stop_desc', type: 'string', optional: true },
    { name: 'stop_lat', type: 'float' },
    { name: 'stop_lon', type: 'float' },
    { name: 'location', type: 'geopoint' },
    { name: 'is_subway_station', type: 'bool' },
  ],
  default_sorting_field: 'stop_id',
};

const GPKG_LINES_SCHEMA = {
  name: GPKG_LINES_COLLECTION_NAME,
  fields: [
    { name: 'line_code', type: 'string', sort: true },
    { name: 'line_fullname', type: 'string' },
    { name: 'agency', type: 'string' },
  ],
  default_sorting_field: 'line_code',
};

const GPKG_STATIONS_SCHEMA = {
  name: GPKG_STATIONS_COLLECTION_NAME,
  fields: [
    { name: 'station_code', type: 'string', sort: true },
    { name: 'station_name', type: 'string' },
    { name: 'station_aliases', type: 'string[]' },
    { name: 'location', type: 'geopoint', optional: true },
  ],
  default_sorting_field: 'station_code',
};

const BIKE_STATIONS_SCHEMA = {
  name: BIKE_STATIONS_COLLECTION_NAME,
  fields: [
    { name: 'station_id', type: 'string', sort: true },
    { name: 'station_name', type: 'string' },
    { name: 'location', type: 'geopoint' },
  ],
  default_sorting_field: 'station_id',
};

@Injectable()
export class TypesenseService implements OnModuleInit {
  private readonly logger = new Logger(TypesenseService.name);
  private client: Client;

  constructor(private configService: ConfigService) {
    this.client = new Client({
      nodes: [
        {
          host: this.configService.get('TYPESENSE_HOST', 'localhost'),
          port: parseInt(this.configService.get('TYPESENSE_PORT', '8108')),
          protocol: this.configService.get('TYPESENSE_PROTOCOL', 'http'),
        },
      ],
      apiKey: this.configService.get('TYPESENSE_API_KEY', 'typesense-api-key'),
      connectionTimeoutSeconds: 10,
    });
  }

  async onModuleInit() {
    await this.initializeCollections();
  }

  private async initializeCollections() {
    try {
      await this.ensureCollectionExists(
        GTFS_ROUTES_COLLECTION_NAME,
        GTFS_ROUTES_SCHEMA,
      );
      await this.ensureCollectionExists(
        GTFS_STOPS_COLLECTION_NAME,
        GTFS_STOPS_SCHEMA,
      );
      await this.ensureCollectionExists(
        GPKG_LINES_COLLECTION_NAME,
        GPKG_LINES_SCHEMA,
      );
      await this.ensureCollectionExists(
        GPKG_STATIONS_COLLECTION_NAME,
        GPKG_STATIONS_SCHEMA,
      );
      await this.ensureCollectionExists(
        BIKE_STATIONS_COLLECTION_NAME,
        BIKE_STATIONS_SCHEMA,
      );

      this.logger.debug('Typesense collections initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Typesense collections:', error);
    }
  }

  private async ensureCollectionExists(name: string, schema: unknown) {
    try {
      // Try to retrieve the collection to check if it exists
      await this.client.collections(name).retrieve();
      this.logger.debug(`Typesense collection '${name}' already exists`);
    } catch {
      // Collection doesn't exist, create it
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.client.collections().create(schema as any);
        this.logger.debug(`Created Typesense collection: ${name}`);
      } catch (createError) {
        if (this.isTypesenseAlreadyExistsError(createError)) {
          this.logger.debug(
            `Typesense collection '${name}' was created concurrently`,
          );
          return;
        }

        this.logger.error(`Failed to create collection ${name}:`, createError);
        throw createError;
      }
    }
  }

  private async createCollection(name: string, schema: unknown) {
    try {
      await this.client.collections(name).delete();
    } catch {
      // Collection doesn't exist, which is fine
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.client.collections().create(schema as any);
      this.logger.debug(`Created Typesense collection: ${name}`);
    } catch (error) {
      if (this.isTypesenseAlreadyExistsError(error)) {
        this.logger.debug(`Typesense collection '${name}' already exists`);
        return;
      }

      this.logger.error(`Failed to create collection ${name}:`, error);
      throw error;
    }
  }

  async clearRoutes(): Promise<void> {
    try {
      await this.recreateCollection(GTFS_ROUTES_COLLECTION_NAME, GTFS_ROUTES_SCHEMA);
      this.logger.debug('Recreated routes collection');
    } catch (error) {
      this.logger.error('Failed to clear routes:', error);
      // If the collection doesn't exist, this might fail, which is OK
    }
  }

  async indexRoutes(routes: RouteDocument[]): Promise<void> {
    try {
      if (routes.length === 0) {
        this.logger.debug('Skipping route indexing: no routes provided');
        return;
      }

      const documents = routes.map((route) => ({
        id: route.id,
        route_id: route.route_id,
        agency_id: route.agency_id,
        route_short_name: route.route_short_name,
        route_long_name: route.route_long_name,
        route_type: route.route_type,
        route_color: route.route_color,
        route_text_color: route.route_text_color,
      }));

      // Use upsert to replace existing documents or add new ones
      await this.client
        .collections(GTFS_ROUTES_COLLECTION_NAME)
        .documents()
        .import(documents, { action: 'upsert' });
      this.logger.debug(`Indexed ${routes.length} routes`);
    } catch (error) {
      this.logger.error('Failed to index routes:', error);
      throw error;
    }
  }

  async clearStops(): Promise<void> {
    try {
      // Delete and recreate the collection to clear all documents
      await this.client.collections(GTFS_STOPS_COLLECTION_NAME).delete();
      this.logger.debug('Deleted stops collection');

      // Recreate the stops collection
      await this.createCollection(GTFS_STOPS_COLLECTION_NAME, {
        name: GTFS_STOPS_COLLECTION_NAME,
        fields: [
          { name: 'stop_id', type: 'string' },
          { name: 'stop_name', type: 'string' },
          { name: 'stop_desc', type: 'string', optional: true },
          { name: 'stop_lat', type: 'float' },
          { name: 'stop_lon', type: 'float' },
          { name: 'location', type: 'geopoint' },
          { name: 'is_subway_station', type: 'bool' },
        ],
        default_sorting_field: 'stop_lat',
      });
      this.logger.debug('Recreated stops collection');
    } catch (error) {
      this.logger.error('Failed to clear stops:', error);
      // If the collection doesn't exist, this might fail, which is OK
    }
  }

  async clearAllData(): Promise<void> {
    await Promise.all([
      this.clearRoutes(),
      this.clearStops(),
      this.clearRailLines(),
      this.clearRailStations(),
      this.clearBikeStations(),
    ]);
    this.logger.debug('Cleared all data from Typesense');
  }

  async clearTransitData(): Promise<void> {
    await Promise.all([
      this.clearRoutes(),
      this.clearStops(),
      this.clearRailLines(),
      this.clearRailStations(),
      this.clearBikeStations(),
    ]);
    this.logger.debug('Cleared transit search data from Typesense');
  }

  async indexStops(stops: StopDocument[]): Promise<void> {
    try {
      if (stops.length === 0) {
        this.logger.debug('Skipping stop indexing: no stops provided');
        return;
      }

      const documents = stops.map((stop) => ({
        id: stop.id,
        stop_id: stop.stop_id,
        stop_name: stop.stop_name,
        stop_desc: stop.stop_desc || '',
        stop_lat: stop.stop_lat,
        stop_lon: stop.stop_lon,
        location: [stop.stop_lat, stop.stop_lon],
        is_subway_station: stop.is_subway_station,
      }));

      // Use upsert to replace existing documents or add new ones
      await this.client
        .collections(GTFS_STOPS_COLLECTION_NAME)
        .documents()
        .import(documents, { action: 'upsert' });
      this.logger.debug(`Indexed ${stops.length} stops`);
    } catch (error) {
      this.logger.error('Failed to index stops:', error);
      throw error;
    }
  }

  async search(
    query: string,
    types: SearchTypes[],
    limit = 10,
  ): Promise<SearchResult[]> {
    try {
      const searches: Array<{
        type: SearchTypes;
        request: SearchRequest;
      }> = [];

      if (types.includes('railLine')) {
        searches.push({
          type: SearchTypesEnum.RailLine,
          request: {
            collection: GPKG_LINES_COLLECTION_NAME,
            q: query,
            query_by: 'line_code,line_fullname,agency',
            query_by_weights: '8,12,1',
            per_page: limit,
            typo_tokens_threshold: 2,
          },
        });
      }

      if (types.includes('railStation')) {
        searches.push({
          type: SearchTypesEnum.RailStation,
          request: {
            collection: GPKG_STATIONS_COLLECTION_NAME,
            q: query,
            query_by: 'station_code,station_name,station_aliases',
            query_by_weights: '2,8,4',
            per_page: limit,
            typo_tokens_threshold: 2,
          },
        });
      }

      if (types.includes('busRoute')) {
        searches.push({
          type: SearchTypesEnum.BusRoute,
          request: {
            collection: GTFS_ROUTES_COLLECTION_NAME,
            q: query,
            query_by: 'route_short_name,route_long_name',
            per_page: limit,
            typo_tokens_threshold: 2,
          },
        });
      }

      if (types.includes('busStop')) {
        searches.push({
          type: SearchTypesEnum.BusStop,
          request: {
            collection: GTFS_STOPS_COLLECTION_NAME,
            q: query,
            query_by: 'stop_name,stop_desc',
            per_page: limit,
            typo_tokens_threshold: 2,
          },
        });
      }

      if (types.includes('bikeStation')) {
        searches.push({
          type: SearchTypesEnum.BikeStation,
          request: {
            collection: BIKE_STATIONS_COLLECTION_NAME,
            q: query,
            query_by: 'station_id,station_name',
            per_page: limit,
            typo_tokens_threshold: 2,
          },
        });
      }

      if (searches.length === 0) {
        return [];
      }

      const results = await this.client.multiSearch.perform<
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
              (hit.highlights as unknown as Record<string, unknown>) ||
              undefined,
            score: hit.text_match,
          }))
          .filter((hit) => !this.isGtfsRailSearchResult(hit)),
      );
    } catch (error) {
      this.logger.error('Search failed:', error);
      throw error;
    }
  }

  private isGtfsRailSearchResult(result: SearchResult): boolean {
    if (result.type === SearchTypesEnum.BusRoute) {
      const route = result.document as RouteDocument;
      return this.isGtfsRailRouteId(route.route_id);
    }

    if (result.type === SearchTypesEnum.BusStop) {
      const stop = result.document as StopDocument;
      return stop.is_subway_station === true;
    }

    return false;
  }

  private isGtfsRailRouteId(routeId: string): boolean {
    return routeId.startsWith('METRÔ') || routeId.startsWith('CPTM');
  }

  async searchNearbyStops(
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
    try {
      // Convert meters to kilometers (Typesense only accepts km or mi)
      const radiusKm = radiusMeters / 1000;

      const searches: Array<{
        type: StopsAndStations;
        request: NearbySearchRequest;
      }> = [];

      if (types.includes(SearchTypesEnum.BusStop)) {
        searches.push({
          type: SearchTypesEnum.BusStop,
          request: {
            collection: GTFS_STOPS_COLLECTION_NAME,
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
            collection: GPKG_STATIONS_COLLECTION_NAME,
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
            collection: BIKE_STATIONS_COLLECTION_NAME,
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

      const results = await this.client.multiSearch.perform<
        NearbySearchDocument[],
        string
      >({
        searches: searches.map((s) => s.request),
      });

      const hits = results.results
        .flatMap((r, index) =>
          (r.hits ?? []).map((hit) => {
            const targetType = searches[index]?.type;

            // Ensure the returned document has a concrete literal `type` field
            // so it matches the expected NearbySearchDocument union.
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
              // BikeStation
              document = {
                ...(hit.document as BikeStationDocument),
                type: 'bikeStation',
              };
            }

            return {
              ...hit,
              document,
            };
          }),
        )
        .sort((a, b) => {
          const aDist = a.geo_distance_meters?.location ?? Number.MAX_VALUE;
          const bDist = b.geo_distance_meters?.location ?? Number.MAX_VALUE;

          return aDist - bDist;
        });

      const closest = hits.slice(0, limit);

      return closest;
    } catch (error) {
      this.logger.error('Nearby stops search failed:', error);
      throw error;
    }
  }

  async deleteRoute(routeId: string): Promise<void> {
    try {
      await this.client
        .collections(GTFS_ROUTES_COLLECTION_NAME)
        .documents(routeId)
        .delete();
    } catch (error) {
      this.logger.error(`Failed to delete route ${routeId}:`, error);
    }
  }

  async deleteStop(stopId: string): Promise<void> {
    try {
      await this.client
        .collections(GTFS_STOPS_COLLECTION_NAME)
        .documents(stopId)
        .delete();
    } catch (error) {
      this.logger.error(`Failed to delete stop ${stopId}:`, error);
    }
  }

  async indexBikeStations(stations: BikeStationDocument[]): Promise<void> {
    try {
      if (stations.length === 0) {
        this.logger.debug('Skipping bike station indexing: no stations provided');
        return;
      }

      const documents = stations.map((station) => ({
        id: station.id,
        station_id: station.station_id,
        station_name: station.station_name,
        location: station.location,
      }));

      await this.client
        .collections(BIKE_STATIONS_COLLECTION_NAME)
        .documents()
        .import(documents, { action: 'upsert' });
      this.logger.debug(`Indexed ${stations.length} bike stations`);
    } catch (error) {
      this.logger.error('Failed to index bike stations:', error);
      throw error;
    }
  }

  async indexRailLines(lines: LineDocument[]): Promise<void> {
    try {
      if (lines.length === 0) {
        this.logger.debug('Skipping rail line indexing: no lines provided');
        return;
      }

      const documents = lines.map((line) => ({
        id: line.id,
        line_code: line.line_code,
        line_fullname: line.line_fullname,
        agency: line.agency,
      }));

      await this.client
        .collections(GPKG_LINES_COLLECTION_NAME)
        .documents()
        .import(documents, { action: 'upsert' });
      this.logger.debug(`Indexed ${lines.length} rail lines`);
    } catch (error) {
      this.logger.error('Failed to index rail lines:', error);
      throw error;
    }
  }

  async indexRailStations(stations: StationDocument[]): Promise<void> {
    try {
      if (stations.length === 0) {
        this.logger.debug('Skipping rail station indexing: no stations provided');
        return;
      }

      const documents = stations.map((station) => {
        const document: Record<string, unknown> = {
          id: station.station_code,
          station_code: station.station_code,
          station_name: station.station_name,
          station_aliases: station.station_aliases || [],
        };

        if (station.location) {
          document.location = station.location;
        }

        return document;
      });

      await this.client
        .collections(GPKG_STATIONS_COLLECTION_NAME)
        .documents()
        .import(documents, { action: 'upsert' });
      this.logger.debug(`Indexed ${stations.length} rail stations`);
    } catch (error) {
      this.logger.error('Failed to index rail stations:', error);
      throw error;
    }
  }

  async clearIndex(): Promise<void> {
    try {
      await this.clearAllData();
      this.logger.debug('Cleared and recreated all Typesense collections');
    } catch (error) {
      this.logger.error('Failed to clear Typesense index:', error);
    }
  }

  private async clearRailLines(): Promise<void> {
    await this.recreateCollection(GPKG_LINES_COLLECTION_NAME, GPKG_LINES_SCHEMA);
  }

  private async clearRailStations(): Promise<void> {
    await this.recreateCollection(
      GPKG_STATIONS_COLLECTION_NAME,
      GPKG_STATIONS_SCHEMA,
    );
  }

  private async clearBikeStations(): Promise<void> {
    await this.recreateCollection(
      BIKE_STATIONS_COLLECTION_NAME,
      BIKE_STATIONS_SCHEMA,
    );
  }

  private async recreateCollection(name: string, schema: unknown): Promise<void> {
    try {
      await this.client.collections(name).delete();
    } catch {
      // Missing collections are recreated below.
    }

    await this.ensureCollectionExists(name, schema);
  }

  private isTypesenseAlreadyExistsError(error: unknown): boolean {
    const maybeTypesenseError = error as { httpStatus?: unknown };

    return (
      typeof error === 'object' &&
      error !== null &&
      maybeTypesenseError.httpStatus === 409
    );
  }
}
