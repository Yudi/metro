interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface InFlightEntry<T> {
  generation: number;
  promise: Promise<T>;
}

/** Caches successful async loads and shares concurrent loads for the same key. */
export class AsyncTtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, InFlightEntry<T>>();
  private generation = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
      throw new RangeError('Cache TTL must be a positive integer');
    }
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError('Cache size must be a positive integer');
    }
  }

  getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) {
      // Refresh insertion order so the least recently used result is evicted.
      this.entries.delete(key);
      this.entries.set(key, cached);
      return Promise.resolve(cached.value);
    }
    if (cached) {
      this.entries.delete(key);
    }

    const pending = this.inFlight.get(key);
    if (pending?.generation === this.generation) {
      return pending.promise;
    }

    const generation = this.generation;
    const promise = Promise.resolve()
      .then(load)
      .then((value) => {
        if (generation === this.generation) {
          this.cache(key, value, Date.now() + this.ttlMs);
        }
        return value;
      })
      .finally(() => {
        if (this.inFlight.get(key)?.generation === generation) {
          this.inFlight.delete(key);
        }
      });

    this.inFlight.set(key, { generation, promise });
    return promise;
  }

  /** Drops cached values and prevents older pending loads from repopulating it. */
  clear(): void {
    this.generation += 1;
    this.entries.clear();
    this.inFlight.clear();
  }

  private cache(key: string, value: T, expiresAt: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt });

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.entries.delete(oldestKey);
    }
  }
}
