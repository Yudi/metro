import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'typesense';
import { randomBytes } from 'node:crypto';
import {
  SearchTypes,
  SearchTypesEnum,
  StopsAndStations,
} from '@metro/shared/utils';
import type { SearchResponseHit } from 'typesense/lib/Typesense/Documents';
import {
  BikeStationDocument,
  LineDocument,
  NearbySearchDocument,
  RouteDocument,
  SearchResult,
  StationDocument,
  StopDocument,
} from './typesense.types';
import {
  BIKE_STATIONS_COLLECTION_NAME,
  BIKE_STATIONS_SCHEMA,
  DEFAULT_CONNECTION_TIMEOUT_SECONDS,
  DEFAULT_RECOVERY_INTERVAL_MS,
  GPKG_LINES_COLLECTION_NAME,
  GPKG_LINES_SCHEMA,
  GPKG_STATIONS_COLLECTION_NAME,
  GPKG_STATIONS_SCHEMA,
  GTFS_ROUTES_COLLECTION_NAME,
  GTFS_ROUTES_SCHEMA,
  GTFS_STOPS_COLLECTION_NAME,
  GTFS_STOPS_SCHEMA,
  TYPESENSE_BASE_COLLECTION_NAMES,
  TYPESENSE_COLLECTION_SCHEMAS,
} from './typesense-schemas';
import {
  formatTypesenseError,
  isTypesenseAvailabilityError,
  isTypesenseNotFoundError,
} from './typesense-error.utils';
import {
  normalizeSearchLimit,
  searchNearbyStops,
  searchTypesense,
} from './typesense-search.utils';
import { TypesenseIndexingFacade } from './typesense-indexing.facade';
import { TypesenseCollectionFacade } from './typesense-collection.facade';
import { getConfiguredNumber } from './typesense-config.utils';
import { AsyncTtlCache } from '../../common/cache/async-ttl-cache';
import {
  discardUnaliasedRebuilds,
  retireManagedRebuilds,
} from './typesense-rebuild-lifecycle';

const TEXT_SEARCH_CACHE_TTL_MS = 5_000;
const TEXT_SEARCH_CACHE_MAX_ENTRIES = 128;

const TEXT_SEARCH_COLLECTIONS: ReadonlyArray<readonly [SearchTypes, string]> =
  [
    [SearchTypesEnum.RailLine, GPKG_LINES_COLLECTION_NAME],
    [SearchTypesEnum.RailStation, GPKG_STATIONS_COLLECTION_NAME],
    [SearchTypesEnum.BusRoute, GTFS_ROUTES_COLLECTION_NAME],
    [SearchTypesEnum.BusStop, GTFS_STOPS_COLLECTION_NAME],
    [SearchTypesEnum.BikeStation, BIKE_STATIONS_COLLECTION_NAME],
  ];

export type {
  BikeStationDocument,
  LineDocument,
  NearbySearchDocument,
  RouteDocument,
  SearchDocument,
  SearchResult,
  StationDocument,
  StopDocument,
} from './typesense.types';
export { formatTypesenseError } from './typesense-error.utils';

@Injectable()
export class TypesenseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TypesenseService.name);
  private client: Client;
  private readonly liveCollectionTargets = new Map<string, string>();
  private readonly aliasedBaseCollectionNames = new Set<string>();
  private readonly rebuildCollectionTargets = new Map<string, string>();
  private readonly rebuildExpectedCounts = new Map<string, number>();
  private readonly previousLiveCollectionTargets = new Map<string, string>();
  private rebuildInProgress = false;
  private retirementInFlight = false;
  private retirementTimer: NodeJS.Timeout | undefined;
  private initialized = false;
  private recoveryTimer: NodeJS.Timeout | undefined;
  private recoveryInFlight = false;
  private shuttingDown = false;
  private readonly recoveryIntervalMs: number;
  private readonly indexing: TypesenseIndexingFacade;
  private readonly collections: TypesenseCollectionFacade;
  private readonly textSearchCache = new AsyncTtlCache<SearchResult[]>(
    TEXT_SEARCH_CACHE_TTL_MS,
    TEXT_SEARCH_CACHE_MAX_ENTRIES,
  );

  constructor(private configService: ConfigService) {
    const connectionTimeoutSeconds = getConfiguredNumber(
      this.configService,
      'TYPESENSE_CONNECTION_TIMEOUT_SECONDS',
      DEFAULT_CONNECTION_TIMEOUT_SECONDS,
      0.1,
      5,
    );
    this.recoveryIntervalMs = getConfiguredNumber(
      this.configService,
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

    this.collections = new TypesenseCollectionFacade({
      getClient: () => this.client,
      logger: this.logger,
    });

    this.indexing = new TypesenseIndexingFacade({
      getClient: () => this.client,
      getWriteCollectionName: (baseName) =>
        this.getWriteCollectionName(baseName),
      isRebuilding: (baseName) => this.rebuildCollectionTargets.has(baseName),
      importDocuments: (baseName, documents) =>
        this.importDocuments(baseName, documents),
      recreateCollection: (name, schema) =>
        this.recreateCollection(name, schema),
      logger: this.logger,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.initializeCollections();
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    this.clearRecoveryProbe();
    clearInterval(this.retirementTimer);
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
          this.aliasedBaseCollectionNames.add(collectionName);
        } catch (error) {
          if (!isTypesenseNotFoundError(error)) {
            throw error;
          }

          this.liveCollectionTargets.set(collectionName, collectionName);
          this.aliasedBaseCollectionNames.delete(collectionName);
        }
      }

      // Recovery can observe an alias promoted by another process while this
      // instance was unavailable. Do not retain results from its old targets.
      this.textSearchCache.clear();

      // Unaliased rebuilds may still belong to another active process.
      // Only discard staging collections created by this instance's rebuild.

      this.logger.debug('Typesense collections initialized successfully');
      this.initialized = true;
      this.clearRecoveryProbe();
      await this.retireSupersededCollections();
      if (!this.retirementTimer && !this.shuttingDown) {
        this.retirementTimer = setInterval(() => {
          void this.retireSupersededCollections();
        }, 15 * 60 * 1_000);
        this.retirementTimer.unref?.();
      }
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
    if (!isTypesenseAvailabilityError(error)) {
      return;
    }

    this.initialized = false;
    this.scheduleRecoveryProbe();
  }

  private throwSearchFailure(operation: string, error: unknown): never {
    this.markUnavailable(error);
    this.logger.error(`${operation}: ${formatTypesenseError(error)}`);

    if (isTypesenseAvailabilityError(error)) {
      throw new ServiceUnavailableException(
        'Search service is temporarily unavailable',
      );
    }

    throw error;
  }

  async beginFullRebuild(
    collectionNames: readonly string[] = TYPESENSE_BASE_COLLECTION_NAMES,
  ): Promise<void> {
    if (!Array.isArray(collectionNames) || collectionNames.length === 0) {
      throw new Error('Typesense rebuild requires at least one collection');
    }

    const requestedNames = new Set(collectionNames);
    const validNames = new Set(TYPESENSE_BASE_COLLECTION_NAMES);
    if (
      requestedNames.size !== collectionNames.length ||
      collectionNames.some((name) => !validNames.has(name))
    ) {
      throw new Error('Typesense rebuild contains an invalid collection name');
    }

    if (this.rebuildInProgress) {
      throw new Error('Typesense full rebuild already in progress');
    }
    // Reserve before the first await so simultaneous starts cannot leak stages.
    this.rebuildInProgress = true;

    const rebuildId = `${Date.now()}_${randomBytes(8).toString('hex')}`;
    const schemas = TYPESENSE_COLLECTION_SCHEMAS.filter(([baseName]) =>
      requestedNames.has(baseName),
    );

    const created: string[] = [];
    try {
      this.previousLiveCollectionTargets.clear();
      for (const baseName of requestedNames) {
        try {
          const alias = await this.client
            .aliases(`${baseName}__live`)
            .retrieve();
          this.previousLiveCollectionTargets.set(baseName, alias.collection_name);
        } catch (error) {
          if (!isTypesenseNotFoundError(error)) {
            throw error;
          }
          this.previousLiveCollectionTargets.set(baseName, baseName);
        }
      }
      for (const [baseName, schema] of schemas) {
        const stagingName = `${baseName}__rebuild_${rebuildId}`;
        await this.client.collections().create({
          ...(schema as Record<string, unknown>),
          name: stagingName,
          metadata: {
            metro_rebuild: {
              version: 1,
              base_name: baseName,
              previous_target: this.previousLiveCollectionTargets.get(baseName),
            },
          },
        } as never);
        created.push(stagingName);
        this.rebuildCollectionTargets.set(baseName, stagingName);
        this.rebuildExpectedCounts.set(baseName, 0);
      }
    } catch (error) {
      await this.discardCollections(created);
      this.rebuildCollectionTargets.clear();
      this.rebuildExpectedCounts.clear();
      this.rebuildInProgress = false;
      throw error;
    }
  }

  async finishFullRebuild(): Promise<void> {
    if (this.rebuildCollectionTargets.size === 0) {
      throw new Error('Typesense full rebuild has not started');
    }

    const aliasesAttempted: string[] = [];
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
        const aliasName = `${baseName}__live`;
        let currentTarget = baseName;
        try {
          currentTarget = (await this.client.aliases(aliasName).retrieve())
            .collection_name;
        } catch (error) {
          if (!isTypesenseNotFoundError(error)) {
            throw error;
          }
        }
        if (currentTarget !== this.previousLiveCollectionTargets.get(baseName)) {
          throw new Error(
            `Typesense alias changed during rebuild: ${aliasName}`,
          );
        }
        // A timeout can still mean the server applied this write.
        aliasesAttempted.push(baseName);
        await this.client.aliases().upsert(`${baseName}__live`, {
          collection_name: stagingName,
        });
      }

      for (const [baseName, stagingName] of this.rebuildCollectionTargets) {
        this.liveCollectionTargets.set(baseName, stagingName);
        this.aliasedBaseCollectionNames.add(baseName);
      }
      this.rebuildCollectionTargets.clear();
      this.rebuildExpectedCounts.clear();
      this.rebuildInProgress = false;
      this.textSearchCache.clear();
    } catch (error) {
      // Restore aliases already swapped in this attempt.  The previous
      // physical collections remain untouched and therefore continue serving
      // search traffic if the rebuild fails.
      await Promise.all(
        aliasesAttempted.map(async (baseName) => {
          const previous = this.previousLiveCollectionTargets.get(baseName);
          try {
            const alias = await this.client
              .aliases(`${baseName}__live`)
              .retrieve();
            if (
              alias.collection_name === this.rebuildCollectionTargets.get(baseName) &&
              previous
            ) {
              await this.client.aliases().upsert(`${baseName}__live`, {
                collection_name: previous,
              });
            }
          } catch (rollbackError) {
            this.logger.warn(
              `Could not restore Typesense alias: ${formatTypesenseError(rollbackError)}`,
            );
          }
        }),
      );
      for (const baseName of aliasesAttempted) {
        try {
          const alias = await this.client
            .aliases(`${baseName}__live`)
            .retrieve();
          this.liveCollectionTargets.set(baseName, alias.collection_name);
          this.aliasedBaseCollectionNames.add(baseName);
        } catch (inspectionError) {
          if (isTypesenseNotFoundError(inspectionError)) {
            this.liveCollectionTargets.set(baseName, baseName);
            this.aliasedBaseCollectionNames.delete(baseName);
          } else {
            this.markUnavailable(inspectionError);
          }
        }
      }
      this.textSearchCache.clear();
      await this.discardFullRebuild();
      throw error;
    }
    // Retirement failure must never roll back a successfully promoted rebuild.
    await this.retireSupersededCollections();
  }

  async discardFullRebuild(): Promise<void> {
    const stagingCollections = [...this.rebuildCollectionTargets.values()];
    this.rebuildCollectionTargets.clear();
    this.rebuildExpectedCounts.clear();
    await this.discardCollections(stagingCollections);
    this.rebuildInProgress = false;
  }

  private async discardCollections(names: readonly string[]): Promise<void> {
    try {
      await discardUnaliasedRebuilds(this.client, names);
    } catch (error) {
      this.logger.warn(
        `Typesense staging cleanup deferred: ${formatTypesenseError(error)}`,
      );
    }
  }

  private async retireSupersededCollections(): Promise<void> {
    if (this.retirementInFlight || this.shuttingDown) {
      return;
    }
    this.retirementInFlight = true;
    try {
      const pinned = new Set(
        this.configService
          .get<string>('TYPESENSE_REBUILD_PINNED_COLLECTIONS', '')
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean),
      );
      for (const name of this.rebuildCollectionTargets.values()) {
        pinned.add(name);
      }
      const retired = await retireManagedRebuilds(this.client, pinned);
      if (retired.length > 0) {
        this.logger.log(
          `Retired ${retired.length} superseded Typesense rebuild collections`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Typesense retirement deferred: ${formatTypesenseError(error)}`,
      );
    } finally {
      this.retirementInFlight = false;
    }
  }

  private getBaseCollectionNames(): string[] {
    return [...TYPESENSE_BASE_COLLECTION_NAMES];
  }

  private getReadCollectionName(baseName: string): string {
    return this.aliasedBaseCollectionNames.has(baseName)
      ? `${baseName}__live`
      : baseName;
  }

  private getWriteCollectionName(baseName: string): string {
    return (
      this.rebuildCollectionTargets.get(baseName) ??
      this.getReadCollectionName(baseName)
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

    const writeCollectionName = this.getWriteCollectionName(baseName);
    const affectsLiveSearch =
      writeCollectionName === this.getReadCollectionName(baseName);
    if (affectsLiveSearch) {
      this.textSearchCache.clear();
    }

    try {
      const response = await this.client
        .collections(writeCollectionName)
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
        const message = `Typesense rejected ${failures.length} malformed ${baseName} document${failures.length === 1 ? '' : 's'}: ${details}`;
        throw new Error(message);
      }

      if (this.rebuildCollectionTargets.has(baseName)) {
        this.rebuildExpectedCounts.set(
          baseName,
          documents.length - failures.length,
        );
      }
    } finally {
      if (affectsLiveSearch) {
        this.textSearchCache.clear();
      }
    }
  }

  private async ensureCollectionExists(name: string, schema: unknown) {
    return this.collections.ensureCollectionExists(name, schema);
  }

  async clearRoutes(): Promise<void> {
    return this.withTextSearchInvalidation(
      [
        {
          baseName: GTFS_ROUTES_COLLECTION_NAME,
          collectionName: GTFS_ROUTES_COLLECTION_NAME,
        },
      ],
      () => this.indexing.clearRoutes(),
    );
  }

  async indexRoutes(routes: RouteDocument[]): Promise<void> {
    return this.indexing.indexRoutes(routes);
  }

  async clearStops(): Promise<void> {
    return this.withTextSearchInvalidation(
      [
        {
          baseName: GTFS_STOPS_COLLECTION_NAME,
          collectionName: GTFS_STOPS_COLLECTION_NAME,
        },
      ],
      () => this.indexing.clearStops(),
    );
  }

  async indexStops(stops: StopDocument[]): Promise<void> {
    return this.indexing.indexStops(stops);
  }

  async search(
    query: string,
    types: SearchTypes[],
    limit = 10,
  ): Promise<SearchResult[]> {
    const searchableTypes = TEXT_SEARCH_COLLECTIONS.filter(([type]) =>
      types.includes(type),
    ).map(([type]) => type);
    const context = {
      client: this.client,
      getReadCollectionName: this.getReadCollectionName.bind(this),
      assertAvailable: this.assertAvailable.bind(this),
      throwSearchFailure: this.throwSearchFailure.bind(this),
    };

    if (searchableTypes.length === 0) {
      return searchTypesense(context, query, types, limit);
    }

    const safeLimit = normalizeSearchLimit(limit);
    this.assertAvailable();
    const collectionIdentities = TEXT_SEARCH_COLLECTIONS.filter(([type]) =>
      searchableTypes.includes(type),
    ).map(([type, baseName]) => [
      type,
      this.getReadCollectionName(baseName),
    ]);
    const key = JSON.stringify([
      query,
      searchableTypes,
      safeLimit,
      collectionIdentities,
    ]);

    return this.textSearchCache.getOrLoad(key, () =>
      searchTypesense(context, query, searchableTypes, safeLimit),
    );
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
    return searchNearbyStops(
      {
        client: this.client,
        getReadCollectionName: this.getReadCollectionName.bind(this),
        assertAvailable: this.assertAvailable.bind(this),
        throwSearchFailure: this.throwSearchFailure.bind(this),
      },
      lat,
      lon,
      radiusMeters,
      types,
      limit,
    );
  }

  async deleteRoute(routeId: string): Promise<void> {
    const baseName = GTFS_ROUTES_COLLECTION_NAME;
    return this.withTextSearchInvalidation(
      [
        {
          baseName,
          collectionName: this.getWriteCollectionName(baseName),
        },
      ],
      () => this.indexing.deleteRoute(routeId),
    );
  }

  async deleteStop(stopId: string): Promise<void> {
    const baseName = GTFS_STOPS_COLLECTION_NAME;
    return this.withTextSearchInvalidation(
      [
        {
          baseName,
          collectionName: this.getWriteCollectionName(baseName),
        },
      ],
      () => this.indexing.deleteStop(stopId),
    );
  }

  async indexBikeStations(stations: BikeStationDocument[]): Promise<void> {
    return this.indexing.indexBikeStations(stations);
  }

  async indexRailLines(lines: LineDocument[]): Promise<void> {
    return this.indexing.indexRailLines(lines);
  }

  async indexRailStations(stations: StationDocument[]): Promise<void> {
    return this.indexing.indexRailStations(stations);
  }

  async clearIndex(): Promise<void> {
    return this.withTextSearchInvalidation(
      TYPESENSE_BASE_COLLECTION_NAMES.map((baseName) => ({
        baseName,
        collectionName: baseName,
      })),
      () => this.indexing.clearIndex(),
    );
  }

  private async recreateCollection(
    name: string,
    schema: unknown,
  ): Promise<void> {
    return this.collections.recreateCollection(name, schema);
  }

  private async withTextSearchInvalidation<T>(
    writes: ReadonlyArray<{ baseName: string; collectionName: string }>,
    operation: () => Promise<T>,
  ): Promise<T> {
    const affectsLiveSearch = writes.some(
      ({ baseName, collectionName }) =>
        collectionName === this.getReadCollectionName(baseName) ||
        collectionName === this.liveCollectionTargets.get(baseName),
    );
    if (affectsLiveSearch) {
      this.textSearchCache.clear();
    }

    try {
      return await operation();
    } finally {
      if (affectsLiveSearch) {
        this.textSearchCache.clear();
      }
    }
  }
}
