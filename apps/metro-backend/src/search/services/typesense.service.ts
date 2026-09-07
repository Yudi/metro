import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'typesense';
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
import { searchNearbyStops, searchTypesense } from './typesense-search.utils';
import { TypesenseIndexingFacade } from './typesense-indexing.facade';
import { TypesenseCollectionFacade } from './typesense-collection.facade';
import { getConfiguredNumber } from './typesense-config.utils';

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
  private readonly rebuildCollectionTargets = new Map<string, string>();
  private readonly rebuildExpectedCounts = new Map<string, number>();
  private previousLiveCollectionTargets = new Map<string, string>();
  private initialized = false;
  private recoveryTimer: NodeJS.Timeout | undefined;
  private recoveryInFlight = false;
  private shuttingDown = false;
  private readonly recoveryIntervalMs: number;
  private readonly indexing: TypesenseIndexingFacade;
  private readonly collections: TypesenseCollectionFacade;

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
          if (!isTypesenseNotFoundError(error)) {
            throw error;
          }

          this.liveCollectionTargets.set(collectionName, collectionName);
        }
      }

      // Unaliased rebuilds may still belong to another active process.
      // Only discard staging collections created by this instance's rebuild.

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

  async beginFullRebuild(): Promise<void> {
    if (this.rebuildCollectionTargets.size > 0) {
      throw new Error('Typesense full rebuild already in progress');
    }

    const rebuildId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const schemas = TYPESENSE_COLLECTION_SCHEMAS;

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
    return [...TYPESENSE_BASE_COLLECTION_NAMES];
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
      throw new Error(message);
    }

    if (this.rebuildCollectionTargets.has(baseName)) {
      this.rebuildExpectedCounts.set(
        baseName,
        documents.length - failures.length,
      );
    }
  }

  private async ensureCollectionExists(name: string, schema: unknown) {
    return this.collections.ensureCollectionExists(name, schema);
  }

  async clearRoutes(): Promise<void> {
    return this.indexing.clearRoutes();
  }

  async indexRoutes(routes: RouteDocument[]): Promise<void> {
    return this.indexing.indexRoutes(routes);
  }

  async clearStops(): Promise<void> {
    return this.indexing.clearStops();
  }

  async indexStops(stops: StopDocument[]): Promise<void> {
    return this.indexing.indexStops(stops);
  }

  async search(
    query: string,
    types: SearchTypes[],
    limit = 10,
  ): Promise<SearchResult[]> {
    return searchTypesense(
      {
        client: this.client,
        getReadCollectionName: this.getReadCollectionName.bind(this),
        assertAvailable: this.assertAvailable.bind(this),
        throwSearchFailure: this.throwSearchFailure.bind(this),
      },
      query,
      types,
      limit,
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
    return this.indexing.deleteRoute(routeId);
  }

  async deleteStop(stopId: string): Promise<void> {
    return this.indexing.deleteStop(stopId);
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
    return this.indexing.clearIndex();
  }

  private async recreateCollection(
    name: string,
    schema: unknown,
  ): Promise<void> {
    return this.collections.recreateCollection(name, schema);
  }
}
