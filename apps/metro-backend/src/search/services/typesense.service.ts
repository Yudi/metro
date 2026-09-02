import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
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

const DEFAULT_CONNECTION_TIMEOUT_SECONDS = 1;
const DEFAULT_RECOVERY_INTERVAL_MS = 15_000;

/**
 * Keep third-party client errors out of logs. Axios/Typesense errors contain
 * the request config, which includes the Typesense API key and can also carry
 * user-supplied request data.
 */
export function formatTypesenseError(error: unknown): string {
  const record = isRecord(error) ? error : undefined;
  const response = isRecord(record?.response) ? record.response : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof record?.message === 'string'
        ? record.message
        : typeof error === 'string'
          ? error
          : 'Unknown error';
  const status = firstDefined(
    record?.httpStatus,
    record?.status,
    response?.status,
  );
  const code = record?.code;

  return [
    `status=${formatErrorValue(status, 'unknown')}`,
    `code=${formatErrorValue(code, 'unknown')}`,
    `message=${redactErrorMessage(message)}`,
  ].join(' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function formatErrorValue(value: unknown, fallback: string): string {
  if (typeof value === 'number' || typeof value === 'string') {
    return String(value).slice(0, 32);
  }

  return fallback;
}

function redactErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(
      /((?:["']?x-typesense-api-key["']?|["']?api[_-]?key["']?|["']?token["']?|["']?secret["']?|["']?password["']?)\s*[:=]\s*)["']?[^\s,}]+["']?/gi,
      '$1[REDACTED]',
    )
    .slice(0, 256);
}

@Injectable()
export class TypesenseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TypesenseService.name);
  private client: Client;
  private readonly liveCollectionTargets = new Map<string, string>();
  private readonly rebuildCollectionTargets = new Map<string, string>();
  private readonly rebuildExpectedCounts = new Map<string, number>();
  private previousLiveCollectionTargets = new Map<string, string>();
  private initialized = false;
  private recoveryTimer: NodeJS.Timeout | undefined;
  private recoveryInFlight = false;
  private shuttingDown = false;
  private readonly recoveryIntervalMs: number;

  constructor(private configService: ConfigService) {
    const connectionTimeoutSeconds = this.getConfiguredNumber(
      'TYPESENSE_CONNECTION_TIMEOUT_SECONDS',
      DEFAULT_CONNECTION_TIMEOUT_SECONDS,
      0.1,
      5,
    );
    this.recoveryIntervalMs = this.getConfiguredNumber(
      'TYPESENSE_RECOVERY_INTERVAL_MS',
      DEFAULT_RECOVERY_INTERVAL_MS,
      1_000,
      300_000,
    );

    this.client = new Client({
      nodes: [
        {
          host: this.configService.get('TYPESENSE_HOST', 'localhost'),
          port: parseInt(this.configService.get('TYPESENSE_PORT', '8108')),
          protocol: this.configService.get('TYPESENSE_PROTOCOL', 'http'),
        },
      ],
      apiKey: this.configService.get('TYPESENSE_API_KEY', 'typesense-api-key'),
      connectionTimeoutSeconds,
      numRetries: 0,
      retryIntervalSeconds: 0,
      healthcheckIntervalSeconds: Math.max(
        1,
        Math.ceil(this.recoveryIntervalMs / 1_000),
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.initializeCollections();
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    this.clearRecoveryProbe();
  }

  private async initializeCollections(): Promise<void> {
    try {
      const health = await this.client.health.retrieve();
      if (!health?.ok) {
        throw new Error('Typesense health check returned not ok');
      }

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

      for (const collectionName of this.getBaseCollectionNames()) {
        try {
          const alias = await this.client
            .aliases(`${collectionName}__live`)
            .retrieve();
          this.liveCollectionTargets.set(collectionName, alias.collection_name);
        } catch (error) {
          if (!this.isTypesenseNotFoundError(error)) {
            throw error;
          }

          this.liveCollectionTargets.set(collectionName, collectionName);
        }
      }

      this.logger.debug('Typesense collections initialized successfully');
      this.initialized = true;
      this.clearRecoveryProbe();
    } catch (error) {
      this.initialized = false;
      this.logger.error(
        `Failed to initialize Typesense collections: ${formatTypesenseError(error)}`,
      );
      this.scheduleRecoveryProbe();
    }
  }

  isAvailable(): boolean {
    return this.initialized;
  }

  private getConfiguredNumber(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const configured = Number(this.configService.get(key));
    return Number.isFinite(configured) && configured >= minimum && configured <= maximum
      ? configured
      : fallback;
  }

  private scheduleRecoveryProbe(): void {
    if (
      this.initialized ||
      this.recoveryTimer ||
      this.recoveryInFlight ||
      this.shuttingDown
    ) {
      return;
    }

    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined;
      this.recoveryInFlight = true;
      void this.initializeCollections().finally(() => {
        this.recoveryInFlight = false;
        this.scheduleRecoveryProbe();
      });
    }, this.recoveryIntervalMs);
    this.recoveryTimer.unref?.();
  }

  private clearRecoveryProbe(): void {
    if (!this.recoveryTimer) {
      return;
    }

    clearTimeout(this.recoveryTimer);
    this.recoveryTimer = undefined;
  }

  private assertAvailable(): void {
    if (this.initialized) {
      return;
    }

    // Fail immediately while a background probe handles recovery.
    this.scheduleRecoveryProbe();
    throw new ServiceUnavailableException(
      'Search service is temporarily unavailable',
    );
  }

  private markUnavailable(error: unknown): void {
    if (!this.isAvailabilityError(error)) {
      return;
    }

    this.initialized = false;
    this.scheduleRecoveryProbe();
  }

  private isAvailabilityError(error: unknown): boolean {
    const record = isRecord(error) ? error : undefined;
    const response = isRecord(record?.response) ? record.response : undefined;
    const status = firstDefined(record?.httpStatus, record?.status, response?.status);
    const code = typeof record?.code === 'string' ? record.code : '';
    const message =
      error instanceof Error
        ? error.message
        : typeof record?.message === 'string'
          ? record.message
          : '';

    if (typeof status === 'number' && (status === 0 || status >= 500)) {
      return true;
    }

    if (
      /^(ECONNABORTED|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)$/i.test(
        code,
      )
    ) {
      return true;
    }

    return /timed? ?out|network|socket|connect(?:ion)? refused|unavailable/i.test(
      message,
    );
  }

  private throwSearchFailure(operation: string, error: unknown): never {
    this.markUnavailable(error);
    this.logger.error(`${operation}: ${formatTypesenseError(error)}`);

    if (this.isAvailabilityError(error)) {
      throw new ServiceUnavailableException(
        'Search service is temporarily unavailable',
      );
    }

    throw error;
  }

  async beginFullRebuild(): Promise<void> {
    if (this.rebuildCollectionTargets.size > 0) {
      throw new Error('Typesense full rebuild already in progress');
    }

    const rebuildId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const schemas: Array<[string, unknown]> = [
      [GTFS_ROUTES_COLLECTION_NAME, GTFS_ROUTES_SCHEMA],
      [GTFS_STOPS_COLLECTION_NAME, GTFS_STOPS_SCHEMA],
      [GPKG_LINES_COLLECTION_NAME, GPKG_LINES_SCHEMA],
      [GPKG_STATIONS_COLLECTION_NAME, GPKG_STATIONS_SCHEMA],
      [BIKE_STATIONS_COLLECTION_NAME, BIKE_STATIONS_SCHEMA],
    ];

    const created: string[] = [];
    try {
      for (const [baseName, schema] of schemas) {
        const stagingName = `${baseName}__rebuild_${rebuildId}`;
        await this.client.collections().create({
          ...(schema as Record<string, unknown>),
          name: stagingName,
        } as never);
        created.push(stagingName);
        this.rebuildCollectionTargets.set(baseName, stagingName);
        this.rebuildExpectedCounts.set(baseName, 0);
      }

      this.previousLiveCollectionTargets = new Map(this.liveCollectionTargets);
    } catch (error) {
      await Promise.all(
        created.map((collectionName) =>
          this.client
            .collections(collectionName)
            .delete()
            .catch(() => undefined),
        ),
      );
      this.rebuildCollectionTargets.clear();
      this.rebuildExpectedCounts.clear();
      throw error;
    }
  }

  async finishFullRebuild(): Promise<void> {
    if (this.rebuildCollectionTargets.size === 0) {
      throw new Error('Typesense full rebuild has not started');
    }

    const aliasesSwapped: string[] = [];
    try {
      for (const [baseName, stagingName] of this.rebuildCollectionTargets) {
        const expected = this.rebuildExpectedCounts.get(baseName) ?? 0;
        const collection = await this.client
          .collections(stagingName)
          .retrieve();
        if (collection.num_documents !== expected) {
          throw new Error(
            `Typesense rebuild count mismatch for ${baseName}: expected ${expected}, got ${collection.num_documents}`,
          );
        }
      }

      for (const [baseName, stagingName] of this.rebuildCollectionTargets) {
        await this.client.aliases().upsert(`${baseName}__live`, {
          collection_name: stagingName,
        });
        aliasesSwapped.push(baseName);
      }

      for (const [baseName, stagingName] of this.rebuildCollectionTargets) {
        this.liveCollectionTargets.set(baseName, stagingName);
      }
      this.rebuildCollectionTargets.clear();
      this.rebuildExpectedCounts.clear();
    } catch (error) {
      // Restore aliases already swapped in this attempt.  The previous
      // physical collections remain untouched and therefore continue serving
      // search traffic if the rebuild fails.
      await Promise.all(
        aliasesSwapped.map((baseName) => {
          const previous = this.previousLiveCollectionTargets.get(baseName);
          return previous
            ? this.client
                .aliases()
                .upsert(`${baseName}__live`, { collection_name: previous })
                .catch(() => undefined)
            : this.client
                .aliases(`${baseName}__live`)
                .delete()
                .catch(() => undefined);
        }),
      );
      await this.discardFullRebuild();
      throw error;
    }
  }

  async discardFullRebuild(): Promise<void> {
    const stagingCollections = [...this.rebuildCollectionTargets.values()];
    this.rebuildCollectionTargets.clear();
    this.rebuildExpectedCounts.clear();
    await Promise.all(
      stagingCollections.map((collectionName) =>
        this.client
          .collections(collectionName)
          .delete()
          .catch(() => undefined),
      ),
    );
  }

  private getBaseCollectionNames(): string[] {
    return [
      GTFS_ROUTES_COLLECTION_NAME,
      GTFS_STOPS_COLLECTION_NAME,
      GPKG_LINES_COLLECTION_NAME,
      GPKG_STATIONS_COLLECTION_NAME,
      BIKE_STATIONS_COLLECTION_NAME,
    ];
  }

  private getReadCollectionName(baseName: string): string {
    return this.liveCollectionTargets.get(baseName) ?? baseName;
  }

  private getWriteCollectionName(baseName: string): string {
    return (
      this.rebuildCollectionTargets.get(baseName) ??
      this.liveCollectionTargets.get(baseName) ??
      baseName
    );
  }

  private async importDocuments(
    baseName: string,
    documents: Array<Record<string, unknown>>,
  ): Promise<void> {
    if (documents.length === 0) {
      if (this.rebuildCollectionTargets.has(baseName)) {
        this.rebuildExpectedCounts.set(baseName, 0);
      }
      return;
    }

    const response = await this.client
      .collections(this.getWriteCollectionName(baseName))
      .documents()
      .import(documents, { action: 'upsert' });
    const outcomes = Array.isArray(response) ? response : [response];
    const failures = outcomes.filter(
      (outcome) =>
        outcome && typeof outcome === 'object' && outcome.success === false,
    ) as Array<{ id?: string; error?: string }>;
    if (failures.length > 0) {
      const details = failures
        .slice(0, 10)
        .map(
          (failure) =>
            `${failure.id ?? 'unknown'}: ${failure.error ?? 'unknown error'}`,
        )
        .join('; ');
      const message = `Typesense rejected ${failures.length} malformed ${baseName} document(s): ${details}`;
      if (failures.length === documents.length) {
        throw new Error(message);
      }
      this.logger.warn(message);
    }

    if (this.rebuildCollectionTargets.has(baseName)) {
      this.rebuildExpectedCounts.set(
        baseName,
        documents.length - failures.length,
      );
    }
  }

  private async ensureCollectionExists(name: string, schema: unknown) {
    try {
      // Try to retrieve the collection to check if it exists
      await this.client.collections(name).retrieve();
      this.logger.debug(`Typesense collection '${name}' already exists`);
    } catch (error) {
      if (!this.isTypesenseNotFoundError(error)) {
        throw error;
      }

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

        this.logger.error(
          `Failed to create collection ${name}: ${formatTypesenseError(createError)}`,
        );
        throw createError;
      }
    }
  }

  private async createCollection(name: string, schema: unknown) {
    try {
      await this.client.collections(name).delete();
    } catch (error) {
      if (!this.isTypesenseNotFoundError(error)) {
        throw error;
      }
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

      this.logger.error(
        `Failed to create collection ${name}: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async clearRoutes(): Promise<void> {
    await this.recreateCollection(
      GTFS_ROUTES_COLLECTION_NAME,
      GTFS_ROUTES_SCHEMA,
    );
    this.logger.debug('Recreated routes collection');
  }

  async indexRoutes(routes: RouteDocument[]): Promise<void> {
    try {
      if (
        routes.length === 0 &&
        !this.rebuildCollectionTargets.has(GTFS_ROUTES_COLLECTION_NAME)
      ) {
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
      await this.importDocuments(GTFS_ROUTES_COLLECTION_NAME, documents);
      this.logger.debug(`Indexed ${routes.length} routes`);
    } catch (error) {
      this.logger.error(
        `Failed to index routes: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async clearStops(): Promise<void> {
    await this.recreateCollection(
      GTFS_STOPS_COLLECTION_NAME,
      GTFS_STOPS_SCHEMA,
    );
    this.logger.debug('Recreated stops collection');
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
      if (
        stops.length === 0 &&
        !this.rebuildCollectionTargets.has(GTFS_STOPS_COLLECTION_NAME)
      ) {
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
      await this.importDocuments(GTFS_STOPS_COLLECTION_NAME, documents);
      this.logger.debug(`Indexed ${stops.length} stops`);
    } catch (error) {
      this.logger.error(
        `Failed to index stops: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async search(
    query: string,
    types: SearchTypes[],
    limit = 10,
  ): Promise<SearchResult[]> {
    const searches: Array<{
      type: SearchTypes;
      request: SearchRequest;
    }> = [];

    if (types.includes('railLine')) {
      searches.push({
        type: SearchTypesEnum.RailLine,
        request: {
          collection: this.getReadCollectionName(GPKG_LINES_COLLECTION_NAME),
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
          collection: this.getReadCollectionName(GPKG_STATIONS_COLLECTION_NAME),
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
          collection: this.getReadCollectionName(GTFS_ROUTES_COLLECTION_NAME),
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
          collection: this.getReadCollectionName(GTFS_STOPS_COLLECTION_NAME),
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
          collection: this.getReadCollectionName(BIKE_STATIONS_COLLECTION_NAME),
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

    this.assertAvailable();

    try {
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
      return this.throwSearchFailure('Search failed', error);
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
    const searches: Array<{
      type: StopsAndStations;
      request: NearbySearchRequest;
    }> = [];

    // Convert meters to kilometers (Typesense only accepts km or mi)
    const radiusKm = radiusMeters / 1000;

    if (types.includes(SearchTypesEnum.BusStop)) {
      searches.push({
        type: SearchTypesEnum.BusStop,
        request: {
          collection: this.getReadCollectionName(GTFS_STOPS_COLLECTION_NAME),
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
          collection: this.getReadCollectionName(GPKG_STATIONS_COLLECTION_NAME),
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
          collection: this.getReadCollectionName(BIKE_STATIONS_COLLECTION_NAME),
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

    this.assertAvailable();

    try {
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
      return this.throwSearchFailure('Nearby stops search failed', error);
    }
  }

  async deleteRoute(routeId: string): Promise<void> {
    try {
      await this.client
        .collections(this.getWriteCollectionName(GTFS_ROUTES_COLLECTION_NAME))
        .documents(routeId)
        .delete();
    } catch (error) {
      this.logger.error(
        `Failed to delete route ${routeId}: ${formatTypesenseError(error)}`,
      );
    }
  }

  async deleteStop(stopId: string): Promise<void> {
    try {
      await this.client
        .collections(this.getWriteCollectionName(GTFS_STOPS_COLLECTION_NAME))
        .documents(stopId)
        .delete();
    } catch (error) {
      this.logger.error(
        `Failed to delete stop ${stopId}: ${formatTypesenseError(error)}`,
      );
    }
  }

  async indexBikeStations(stations: BikeStationDocument[]): Promise<void> {
    try {
      if (
        stations.length === 0 &&
        !this.rebuildCollectionTargets.has(BIKE_STATIONS_COLLECTION_NAME)
      ) {
        this.logger.debug(
          'Skipping bike station indexing: no stations provided',
        );
        return;
      }

      const documents = stations.map((station) => ({
        id: station.id,
        station_id: station.station_id,
        station_name: station.station_name,
        location: station.location,
      }));

      await this.importDocuments(BIKE_STATIONS_COLLECTION_NAME, documents);
      this.logger.debug(`Indexed ${stations.length} bike stations`);
    } catch (error) {
      this.logger.error(
        `Failed to index bike stations: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async indexRailLines(lines: LineDocument[]): Promise<void> {
    try {
      if (
        lines.length === 0 &&
        !this.rebuildCollectionTargets.has(GPKG_LINES_COLLECTION_NAME)
      ) {
        this.logger.debug('Skipping rail line indexing: no lines provided');
        return;
      }

      const documents = lines.map((line) => ({
        id: line.id,
        line_code: line.line_code,
        line_fullname: line.line_fullname,
        agency: line.agency,
      }));

      await this.importDocuments(GPKG_LINES_COLLECTION_NAME, documents);
      this.logger.debug(`Indexed ${lines.length} rail lines`);
    } catch (error) {
      this.logger.error(
        `Failed to index rail lines: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async indexRailStations(stations: StationDocument[]): Promise<void> {
    try {
      if (
        stations.length === 0 &&
        !this.rebuildCollectionTargets.has(GPKG_STATIONS_COLLECTION_NAME)
      ) {
        this.logger.debug(
          'Skipping rail station indexing: no stations provided',
        );
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

      await this.importDocuments(GPKG_STATIONS_COLLECTION_NAME, documents);
      this.logger.debug(`Indexed ${stations.length} rail stations`);
    } catch (error) {
      this.logger.error(
        `Failed to index rail stations: ${formatTypesenseError(error)}`,
      );
      throw error;
    }
  }

  async clearIndex(): Promise<void> {
    await this.clearAllData();
    this.logger.debug('Cleared and recreated all Typesense collections');
  }

  private async clearRailLines(): Promise<void> {
    await this.recreateCollection(
      GPKG_LINES_COLLECTION_NAME,
      GPKG_LINES_SCHEMA,
    );
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

  private async recreateCollection(
    name: string,
    schema: unknown,
  ): Promise<void> {
    try {
      await this.client.collections(name).delete();
    } catch (error) {
      if (!this.isTypesenseNotFoundError(error)) {
        throw error;
      }
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

  private isTypesenseNotFoundError(error: unknown): boolean {
    const maybeTypesenseError = error as { httpStatus?: unknown };
    return (
      typeof error === 'object' &&
      error !== null &&
      maybeTypesenseError.httpStatus === 404
    );
  }
}
