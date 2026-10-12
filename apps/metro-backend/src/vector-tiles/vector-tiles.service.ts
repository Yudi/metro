import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BikePollingService } from '../bike/services/bike-polling.service';
import { BikeVectorTileService } from './services/bike-vector-tile.service';
import { BusVectorTileService } from './services/bus-vector-tile.service';
import { RailTileService } from './services/rail-tile.service';
import { VectorTileCacheService } from './services/vector-tile-cache.service';
import { VectorTileLayer, VectorTileOptions } from './vector-tile.types';

export { VectorTileLayer } from './vector-tile.types';
export type { VectorTileOptions } from './vector-tile.types';

/**
 * Coordinates vector tile generation and bounded tile caching.
 *
 * Layer-specific SQL and feature shaping live in category services so this
 * class remains the API-facing dispatcher.
 */
@Injectable()
export class VectorTilesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VectorTilesService.name);
  private readonly bikePollListener = this.handleBikePollComplete.bind(this);
  private readonly inFlightTiles = new Map<string, Promise<Buffer | null>>();
  private cacheGeneration = 0;

  constructor(
    private readonly cache: VectorTileCacheService,
    private readonly bikePolling: BikePollingService,
    private readonly railTiles: RailTileService,
    private readonly busTiles: BusVectorTileService,
    private readonly bikeTiles: BikeVectorTileService,
  ) {}

  onModuleInit(): void {
    this.bikePolling.onPollComplete(this.bikePollListener);
  }

  onModuleDestroy(): void {
    this.bikePolling.offPollComplete(this.bikePollListener);
  }

  /**
   * Get a vector tile for the specified layer and coordinates.
   */
  async getTile(
    layer: VectorTileLayer,
    z: number,
    x: number,
    y: number,
    options: VectorTileOptions = {},
  ): Promise<Buffer | null> {
    const cacheKey = `${layer}/${z}/${x}/${y}/${this.getOptionsCacheKey(options)}`;

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const inFlight = this.inFlightTiles.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const generation = this.cacheGeneration;
    const request = this.generateTile(layer, z, x, y, options)
      .then((tile) => {
        const result = tile && tile.length > 0 ? tile : null;
        if (generation === this.cacheGeneration) {
          this.cache.set(cacheKey, result);
        }
        return result;
      })
      .finally(() => {
        if (this.inFlightTiles.get(cacheKey) === request) {
          this.inFlightTiles.delete(cacheKey);
        }
      });
    this.inFlightTiles.set(cacheKey, request);

    return request;
  }

  /**
   * Clear the tile cache. Useful after data updates.
   */
  clearCache(): void {
    this.cacheGeneration++;
    this.inFlightTiles.clear();
    this.cache.clear();
  }

  /**
   * Clear cache for a specific layer.
   */
  clearLayerCache(layer: VectorTileLayer): void {
    this.cacheGeneration++;
    const prefix = `${layer}/`;
    for (const key of this.inFlightTiles.keys()) {
      if (key.startsWith(prefix)) {
        this.inFlightTiles.delete(key);
      }
    }
    this.cache.clearLayer(layer);
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; keys: string[] } {
    return this.cache.getStats();
  }

  private async generateTile(
    layer: VectorTileLayer,
    z: number,
    x: number,
    y: number,
    options: VectorTileOptions,
  ): Promise<Buffer | null> {
    switch (layer) {
      case VectorTileLayer.RAIL_STATIONS:
        return this.railTiles.generateRailStationsTile(z, x, y);
      case VectorTileLayer.RAIL_ROUTES:
        return this.railTiles.generateRailRoutesTile(z, x, y);
      case VectorTileLayer.BUS_ROUTES:
        return this.busTiles.generateBusRoutesTile(z, x, y, options);
      case VectorTileLayer.BUS_STOPS:
        return this.busTiles.generateBusStopsTile(z, x, y, options);
      case VectorTileLayer.BIKE_STATIONS:
        return this.bikeTiles.generateBikeStationsTile(z, x, y);
      default:
        this.logger.warn(`Unknown layer: ${layer}`);
        return null;
    }
  }

  private getOptionsCacheKey(options: VectorTileOptions): string {
    const routeIds = this.busTiles.normalizeIds(options.routeIds).sort();
    const stopIds = this.busTiles.normalizeIds(options.stopIds).sort();
    const nearby = this.busTiles.normalizeNearby(options.nearby);

    return JSON.stringify({
      routeIds,
      stopIds,
      nearby: nearby
        ? {
            latitude: nearby.latitude.toFixed(6),
            longitude: nearby.longitude.toFixed(6),
            radiusMeters: Math.round(nearby.radiusMeters),
          }
        : null,
    });
  }

  private handleBikePollComplete(): void {
    this.clearLayerCache(VectorTileLayer.BIKE_STATIONS);
  }
}
