import { Injectable, Logger } from '@nestjs/common';
import { VectorTileLayer } from '../vector-tile.types';

interface TileCacheEntry {
  tile: Buffer;
  expiresAt: number;
}

@Injectable()
export class VectorTileCacheService {
  private readonly logger = new Logger(VectorTileCacheService.name);
  private readonly tileCache = new Map<string, TileCacheEntry>();
  private readonly emptyTileCache = new Map<string, number>();
  private readonly cacheTtl = 60 * 60 * 1000;
  private readonly emptyCacheTtl = 30 * 1000;
  private readonly maxCacheEntries = 2_000;
  private readonly maxEmptyCacheEntries = 512;
  private readonly maxCacheBytes = 64 * 1024 * 1024;
  private cacheBytes = 0;

  get(cacheKey: string): Buffer | null | undefined {
    const cached = this.tileCache.get(cacheKey);
    if (cached) {
      if (cached.expiresAt <= Date.now()) {
        this.delete(cacheKey);
        return undefined;
      }

      this.tileCache.delete(cacheKey);
      this.tileCache.set(cacheKey, cached);
      return cached.tile;
    }

    const emptyExpiresAt = this.emptyTileCache.get(cacheKey);
    if (emptyExpiresAt === undefined) {
      return undefined;
    }
    if (emptyExpiresAt <= Date.now()) {
      this.emptyTileCache.delete(cacheKey);
      return undefined;
    }

    this.emptyTileCache.delete(cacheKey);
    this.emptyTileCache.set(cacheKey, emptyExpiresAt);
    return null;
  }

  set(cacheKey: string, tile: Buffer | null): void {
    if (tile && tile.length > 0 && tile.length > this.maxCacheBytes) {
      return;
    }

    this.delete(cacheKey);
    if (!tile || tile.length === 0) {
      this.emptyTileCache.set(cacheKey, Date.now() + this.emptyCacheTtl);
      this.prune();
      return;
    }

    this.tileCache.set(cacheKey, {
      tile,
      expiresAt: Date.now() + this.cacheTtl,
    });
    this.cacheBytes += tile.length;
    this.prune();
  }

  clear(): void {
    this.tileCache.clear();
    this.emptyTileCache.clear();
    this.cacheBytes = 0;
    this.logger.debug('Vector tile cache cleared');
  }

  clearLayer(layer: VectorTileLayer): void {
    const prefix = `${layer}/`;
    const cacheKeys = [
      ...this.tileCache.keys(),
      ...this.emptyTileCache.keys(),
    ];
    for (const key of cacheKeys) {
      if (key.startsWith(prefix)) {
        this.delete(key);
      }
    }
    this.logger.debug(`Vector tile cache cleared for layer: ${layer}`);
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.tileCache.size + this.emptyTileCache.size,
      keys: [...this.tileCache.keys(), ...this.emptyTileCache.keys()],
    };
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.tileCache) {
      if (entry.expiresAt <= now) {
        this.delete(key);
      }
    }
    for (const [key, expiresAt] of this.emptyTileCache) {
      if (expiresAt <= now) {
        this.emptyTileCache.delete(key);
      }
    }

    while (
      this.tileCache.size > this.maxCacheEntries ||
      this.cacheBytes > this.maxCacheBytes
    ) {
      const oldestKey = this.tileCache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.delete(oldestKey);
    }

    while (this.emptyTileCache.size > this.maxEmptyCacheEntries) {
      const oldestEmptyKey = this.emptyTileCache.keys().next().value;
      if (oldestEmptyKey === undefined) {
        break;
      }
      this.emptyTileCache.delete(oldestEmptyKey);
    }
  }

  private delete(cacheKey: string): void {
    const existing = this.tileCache.get(cacheKey);
    if (existing) {
      this.cacheBytes -= existing.tile.length;
      this.tileCache.delete(cacheKey);
    }
    this.emptyTileCache.delete(cacheKey);
  }
}
