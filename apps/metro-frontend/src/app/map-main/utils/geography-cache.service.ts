import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import {
  BusStopGraphQL,
  BusRouteGraphQL,
  GeographyGraphQLService,
} from '../services/geography-graphql.service';

/**
 * Cache service for geography data to minimize backend requests
 * Implements smart caching with TTL and cache invalidation
 */
@Injectable({
  providedIn: 'root',
})
export class GeographyCacheService {
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Cache stores
  private subwayStationsCache: Observable<BusStopGraphQL[]> | null = null;
  private subwayRoutesCache: Observable<BusRouteGraphQL[]> | null = null;
  private stopCache = new Map<
    string,
    { data: Observable<BusStopGraphQL | null>; timestamp: number }
  >();
  private routeCache = new Map<
    string,
    { data: Observable<BusRouteGraphQL | null>; timestamp: number }
  >();

  private geographyService = inject(GeographyGraphQLService);

  /**
   * Get subway stations with caching
   * Subway stations rarely change, so cache them permanently during session
   */
  getSubwayStations(): Observable<BusStopGraphQL[]> {
    if (!this.subwayStationsCache) {
      this.subwayStationsCache = this.geographyService.getSubwayStations().pipe(
        shareReplay(1) // Share and replay the last emission
      );
    }
    return this.subwayStationsCache;
  }

  /**
   * Get subway routes with caching
   */
  getSubwayRoutes(): Observable<BusRouteGraphQL[]> {
    if (!this.subwayRoutesCache) {
      this.subwayRoutesCache = this.geographyService
        .getSubwayRoutes()
        .pipe(shareReplay(1));
    }
    return this.subwayRoutesCache;
  }

  /**
   * Get stop by ID with caching
   */
  getStop(id: string): Observable<BusStopGraphQL | null> {
    const cached = this.stopCache.get(id);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const data = this.geographyService.getBusStop(id).pipe(shareReplay(1));

    this.stopCache.set(id, { data, timestamp: now });
    return data;
  }

  /**
   * Get route by ID with caching
   */
  getRoute(id: string): Observable<BusRouteGraphQL | null> {
    const cached = this.routeCache.get(id);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const data = this.geographyService.getBusRoute(id).pipe(shareReplay(1));

    this.routeCache.set(id, { data, timestamp: now });
    return data;
  }

  /**
   * Invalidate all caches
   */
  clearCache(): void {
    this.subwayStationsCache = null;
    this.subwayRoutesCache = null;
    this.stopCache.clear();
    this.routeCache.clear();
  }

  /**
   * Invalidate specific stop cache
   */
  invalidateStop(id: string): void {
    this.stopCache.delete(id);
  }

  /**
   * Invalidate specific route cache
   */
  invalidateRoute(id: string): void {
    this.routeCache.delete(id);
  }

  /**
   * Prefetch subway data on app initialization
   */
  prefetchSubwayData(): void {
    this.getSubwayStations().subscribe();
    this.getSubwayRoutes().subscribe();
  }
}
