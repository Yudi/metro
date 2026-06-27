import { Injectable, inject } from '@angular/core';
import { GeographyCacheService } from './geography-cache.service';
import { LoggerService } from '@metro/shared/api';
import { firstValueFrom } from 'rxjs';

/**
 * Service for prefetching commonly used data to improve perceived performance
 */
@Injectable({
  providedIn: 'root',
})
export class DataPrefetchService {
  private cache = inject(GeographyCacheService);
  private logger = inject(LoggerService);

  private prefetchInProgress = false;
  private prefetchComplete = false;

  /**
   * Prefetch critical data that's likely to be needed
   * Should be called on app initialization
   * @deprecated Subway data is now served via Vector Tiles (MVT) - no GraphQL prefetch needed
   */
  async prefetchCriticalData(): Promise<void> {
    // Note: Subway stations and routes are now rendered via Vector Tiles (MVT)
    // No need to prefetch them via GraphQL anymore
    this.logger.debug(
      'prefetchCriticalData() - subway data now served via Vector Tiles'
    );
    this.prefetchComplete = true;
  }

  /**
   * Prefetch data for a specific route (useful when user is likely to view it)
   */
  async prefetchRoute(routeId: string): Promise<void> {
    try {
      this.logger.debug('Prefetching route data', { routeId });
      await firstValueFrom(this.cache.getRoute(routeId));
    } catch (error) {
      this.logger.warn('Failed to prefetch route', { routeId, error });
    }
  }

  /**
   * Prefetch data for a specific stop
   */
  async prefetchStop(stopId: string): Promise<void> {
    try {
      this.logger.debug('Prefetching stop data', { stopId });
      await firstValueFrom(this.cache.getStop(stopId));
    } catch (error) {
      this.logger.warn('Failed to prefetch stop', { stopId, error });
    }
  }

  /**
   * Prefetch nearby routes based on recently viewed items
   */
  async prefetchNearbyRoutes(routeIds: string[]): Promise<void> {
    if (routeIds.length === 0) return;

    this.logger.debug('Prefetching nearby routes', { count: routeIds.length });

    const prefetchPromises = routeIds
      .slice(0, 5) // Limit to 5 to avoid overwhelming the cache
      .map((routeId) => this.prefetchRoute(routeId));

    await Promise.allSettled(prefetchPromises);
  }

  /**
   * Check if critical data has been prefetched
   */
  isPrefetchComplete(): boolean {
    return this.prefetchComplete;
  }

  /**
   * Reset prefetch state (useful for testing or re-initialization)
   */
  resetPrefetchState(): void {
    this.prefetchInProgress = false;
    this.prefetchComplete = false;
  }
}
