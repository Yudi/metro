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
  private readonly cacheTtl = 60 * 60 * 1000;
  private readonly maxCacheEntries = 2_000;
  private readonly maxCacheBytes = 64 * 1024 * 1024;
  private cacheBytes = 0;

  get(cacheKey: string): Buffer | null {
    const cached = this.tileCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.delete(cacheKey);
      return null;
    }

    this.tileCache.delete(cacheKey);
    this.tileCache.set(cacheKey, cached);
    return cached.tile;
  }

  set(cacheKey: string, tile: Buffer): void {
    if (tile.length > this.maxCacheBytes) {
      return;
    }

    this.delete(cacheKey);
    this.tileCache.set(cacheKey, {
      tile,
      expiresAt: Date.now() + this.cacheTtl,
    });
    this.cacheBytes += tile.length;
    this.prune();
  }

  clear(): void {
    this.tileCache.clear();
    this.cacheBytes = 0;
    this.logger.debug('Vector tile cache cleared');
  }

  clearLayer(layer: VectorTileLayer): void {
    const prefix = `${layer}/`;
    for (const key of this.tileCache.keys()) {
      if (key.startsWith(prefix)) {
        this.delete(key);
      }
    }
    this.logger.debug(`Vector tile cache cleared for layer: ${layer}`);
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.tileCache.size,
      keys: Array.from(this.tileCache.keys()),
    };
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.tileCache) {
      if (entry.expiresAt <= now) {
        this.delete(key);
      }
    }

    while (
      this.tileCache.size > this.maxCacheEntries ||
      this.cacheBytes > this.maxCacheBytes
    ) {
      const oldestKey = this.tileCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.delete(oldestKey);
    }
  }

  private delete(cacheKey: string): void {
    const existing = this.tileCache.get(cacheKey);
    if (!existing) {
      return;
    }

    this.cacheBytes -= existing.tile.length;
    this.tileCache.delete(cacheKey);
  }
}
