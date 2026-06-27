import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GeographyGraphQLService } from '../../services/geography-graphql.service';
import { MapStateService } from './map-state.service';
import { LoggerService } from '@metro/shared/api';
import { isSubwayRoute } from '../../utils/transit-utils';
import { VectorTileLayerService } from '../../services/vector-tile-layer.service';

@Injectable({
  providedIn: 'root',
})
export class MapDataLoaderService {
  private geographyService = inject(GeographyGraphQLService);
  private snackBar = inject(MatSnackBar);
  private mapState = inject(MapStateService);
  private logger = inject(LoggerService);
  private vectorTileLayerService = inject(VectorTileLayerService);

  // Callback to update display - will be set by the component
  private updateDisplayCallback?: () => void;

  setUpdateDisplayCallback(callback: () => void): void {
    this.updateDisplayCallback = callback;
  }

  private triggerDisplayUpdate(): void {
    if (this.updateDisplayCallback) {
      this.updateDisplayCallback();
    }
  }

  async loadRouteData(routeId: string): Promise<void> {
    this.mapState.isLoading.set(true);
    this.logger.debug('loadRouteData called', { routeId });

    try {
      // Use combined query to get route, trips, shapes, and stops in a single request
      const routeFullData = await this.geographyService
        .getRouteFullData(routeId)
        .toPromise();

      if (!routeFullData) {
        this.logger.warn('Route not found', { routeId });
        return;
      }

      const { route } = routeFullData;

      this.logger.debug('Route full data loaded', {
        routeId: route.routeId,
        shortName: route.shortName,
      });

      // Add route to display, tracking that this routeId is the source
      this.mapState.addRouteToDisplay(route, routeId, false);
      this.syncVectorTileFilters();
      this.triggerDisplayUpdate();
    } catch (error) {
      this.logger.error('Error loading route data', error);
      this.snackBar.open('Error loading route data', 'Close', {
        duration: 3000,
      });
    } finally {
      this.mapState.isLoading.set(false);
    }
  }

  async loadStopData(stopId: string): Promise<void> {
    this.mapState.isLoading.set(true);

    try {
      // Use combined query to get stop and all routes with their full data in a single request
      const stopFullData = await this.geographyService
        .getStopFullData(stopId)
        .toPromise();

      if (!stopFullData) {
        this.logger.warn('Stop not found', { stopId });
        return;
      }

      const { stop, routes: routesFullData } = stopFullData;

      this.logger.debug('Stop full data loaded', {
        stopId: stop.stopId,
        name: stop.name,
        routesCount: routesFullData.length,
      });

      // Add the clicked stop to display, with itself as source
      this.mapState.addStopToDisplay(stop, stopId);
      this.triggerDisplayUpdate();

      if (routesFullData.length > 0) {
        // Process each route and its data - all sourced from this stop selection
        for (const routeData of routesFullData) {
          const { route } = routeData;

          // Add route marked as derived from stop (no real-time subscription)
          // Source is the stop that caused this route to be loaded
          this.mapState.addRouteToDisplay(route, stopId, true);

          // Skip subway routes for stop loading (stations already displayed)
          if (isSubwayRoute(route)) {
            this.logger.debug(
              'Skipping stop loading for subway route derived from stop',
              { routeId: route.routeId, shortName: route.shortName }
            );
            continue;
          }

          this.logger.debug('Registered route derived from stop', {
            routeId: route.routeId,
          });
        }

        this.syncVectorTileFilters();
        this.triggerDisplayUpdate();
      }
    } catch (error) {
      this.logger.error('Error loading stop data', error);
      this.snackBar.open('Error loading stop data', 'Close', {
        duration: 3000,
      });
    } finally {
      this.mapState.isLoading.set(false);
    }
  }

  async loadNearbyStops(lat: number, lon: number): Promise<void> {
    this.mapState.isLoading.set(true);
    this.mapState.nearbyCenter.set({ lat, lon });

    try {
      this.syncVectorTileFilters();
      this.snackBar.open('Paradas próximas carregadas no mapa', 'Fechar', {
        duration: 3000,
      });
    } catch (error) {
      this.logger.error('Error loading nearby stops', error);
      this.snackBar.open('Error loading nearby stops', 'Close', {
        duration: 3000,
      });
    } finally {
      this.mapState.isLoading.set(false);
    }
  }

  refreshDisplayedData(): void {
    // Rebuild displayed data based on current selections
    this.mapState.resetDisplayedData();

    // Trigger immediate display update to clear old features from map
    this.triggerDisplayUpdate();

    // Note: Subway stations are now rendered via Vector Tiles (MVT)
    // No need to load them via GraphQL

    // Reload data for all selected items (use keys to get IDs from the Maps)
    this.mapState
      .selectedRoutes()
      .forEach((_, routeId) => this.loadRouteData(routeId));
    this.mapState
      .selectedStops()
      .forEach((_, stopId) => this.loadStopData(stopId));
    this.syncVectorTileFilters();
  }

  /**
   * Remove display data for a specific route without refetching other data.
   * Uses source tracking to only remove items that are no longer needed by any selection.
   */
  removeRouteDisplayData(routeId: string): void {
    this.logger.debug('Removing display data sourced from route', { routeId });
    this.mapState.removeRouteDisplayData(routeId);
    this.syncVectorTileFilters();
    this.triggerDisplayUpdate();
  }

  /**
   * Remove display data for a specific stop without refetching other data.
   * Uses source tracking to only remove items that are no longer needed by any selection.
   * This automatically handles cleanup of routes/shapes/stops derived from this stop.
   */
  removeStopDisplayData(stopId: string): void {
    this.logger.debug('Removing display data sourced from stop', { stopId });
    this.mapState.removeStopDisplayData(stopId);
    this.syncVectorTileFilters();
    this.triggerDisplayUpdate();
  }

  /**
   * Load all subway stations automatically
   * @deprecated Subway stations are now rendered via Vector Tiles (MVT)
   * This method is kept for backwards compatibility but does nothing
   */
  loadSubwayStations(): void {
    this.logger.debug(
      'loadSubwayStations() called but subway stations are now rendered via Vector Tiles'
    );
    // No-op: Subway stations are now handled by VectorTileLayerService
    // which renders MVT tiles directly from the backend
  }

  /**
   * Load all subway routes and their shapes when subway routes layer is enabled
   * @deprecated Subway routes are now rendered via Vector Tiles (MVT)
   * This method is kept for backwards compatibility but does nothing
   */
  async loadAllSubwayRoutes(): Promise<void> {
    this.logger.debug(
      'loadAllSubwayRoutes() called but subway routes are now rendered via Vector Tiles'
    );
    // No-op: Subway routes are now handled by VectorTileLayerService
    // which renders MVT tiles directly from the backend
  }

  syncVectorTileFilters(): void {
    const selectedRoutes = Array.from(this.mapState.selectedRoutes().keys());
    const displayedRoutes = this.mapState
      .displayedRoutes()
      .map((route) => route.routeId);
    const routeIds = Array.from(new Set([...selectedRoutes, ...displayedRoutes]));
    const stopIds = Array.from(this.mapState.selectedStops().keys());
    const nearbyCenter = this.mapState.nearbyCenter();
    const nearby =
      this.mapState.displayMode() === 'nearby' && nearbyCenter
        ? {
            lat: nearbyCenter.lat,
            lon: nearbyCenter.lon,
            radiusMeters: this.mapState.nearbyRadius(),
          }
        : null;

    this.vectorTileLayerService.setBusRouteIds(routeIds);
    this.vectorTileLayerService.setBusStopFilter({
      routeIds,
      stopIds,
      nearby,
    });
  }
}
