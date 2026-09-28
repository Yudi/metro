import { Service, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, Subscription } from 'rxjs';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import type {
  BusStopGraphQL,
  StopFullDataSnapshot,
} from '../../geography/geography-graphql.service';
import { MapStateService } from './map-state.service';
import { LoggerService } from '@metro/shared/api';
import { isSubwayRoute } from '../../geography/transit-utils';
import { VectorTileLayerService } from './vector-tiles/vector-tile-layer.service';

export type StopDataLoadResult =
  | { status: 'loaded'; stop: BusStopGraphQL }
  | { status: 'not-found' }
  | { status: 'cancelled' }
  | { status: 'error'; error: unknown };

interface ActiveStopDataRequest {
  canonicalStopId?: string;
  subscription: Subscription;
  cancel(): void;
}

@Service()
export class MapDataLoaderService {
  private geographyService = inject(GeographyGraphQLService);
  private snackBar = inject(MatSnackBar);
  private mapState = inject(MapStateService);
  private logger = inject(LoggerService);
  private vectorTileLayerService = inject(VectorTileLayerService);
  private readonly activeStopRequests = new Map<string, ActiveStopDataRequest>();
  private activeLoadCount = 0;

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

  async loadRouteData(
    routeId: string,
    shouldDisplaySnackbar = true,
  ): Promise<void> {
    const finishLoading = this.beginLoading();
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
      if (shouldDisplaySnackbar) {
        this.snackBar.open(
          'Não foi possível carregar os dados da rota',
          'Fechar',
          { duration: 3000 },
        );
      }
    } finally {
      finishLoading();
    }
  }

  loadStopData(
    stopId: string,
    shouldDisplaySnackbar = true,
    stopUpdates?: Observable<StopFullDataSnapshot>,
    onStopReceived?: (stop: BusStopGraphQL) => void,
  ): Promise<StopDataLoadResult> {
    this.cancelStopDataLoad(stopId);

    const finishLoading = this.beginLoading();
    let receivedStop: BusStopGraphQL | null = null;
    let hasGraphqlErrors = false;
    let graphqlErrorReported = false;
    const processedRouteIds = new Set<string>();
    let initialResultSettled = false;
    let resolveInitialResult!: (result: StopDataLoadResult) => void;
    const initialResult = new Promise<StopDataLoadResult>((resolve) => {
      resolveInitialResult = resolve;
    });
    const settleInitialResult = (result: StopDataLoadResult) => {
      if (initialResultSettled) {
        return;
      }
      initialResultSettled = true;
      resolveInitialResult(result);
    };

    const request: ActiveStopDataRequest = {
      subscription: new Subscription(),
      cancel: () => {
        if (this.activeStopRequests.get(stopId) !== request) {
          return;
        }
        this.activeStopRequests.delete(stopId);
        request.subscription.unsubscribe();
        finishLoading();
        settleInitialResult({ status: 'cancelled' });
      },
    };
    this.activeStopRequests.set(stopId, request);

    const completeRequest = (result?: StopDataLoadResult) => {
      if (this.activeStopRequests.get(stopId) !== request) {
        return;
      }
      this.activeStopRequests.delete(stopId);
      request.subscription.unsubscribe();
      finishLoading();

      if (
        !receivedStop &&
        (!result || result.status === 'not-found')
      ) {
        this.logger.warn('Stop not found', { stopId });
      }
      settleInitialResult(
        result ??
          (receivedStop
            ? { status: 'loaded', stop: receivedStop }
            : hasGraphqlErrors
              ? { status: 'error', error: new Error('GraphQL stop query failed') }
              : { status: 'not-found' }),
      );
    };

    const reportGraphqlErrors = (errors: readonly unknown[]) => {
      hasGraphqlErrors = true;
      if (graphqlErrorReported) {
        return;
      }
      graphqlErrorReported = true;
      this.logger.error('Error loading stop data', errors);
      if (shouldDisplaySnackbar) {
        this.snackBar.open(
          'Não foi possível carregar os dados da parada',
          'Fechar',
          { duration: 3000 },
        );
      }
    };

    const subscription = (stopUpdates ??
      this.geographyService.watchStopFullData(stopId)).subscribe({
        next: (snapshot) => {
          if (this.activeStopRequests.get(stopId) !== request) {
            return;
          }

          if (snapshot.errors?.length) {
            reportGraphqlErrors(snapshot.errors);
          }

          if (snapshot.stop && !receivedStop) {
            receivedStop = snapshot.stop;
            request.canonicalStopId = snapshot.stop.stopId;
            this.mapState.addStopToDisplay(
              snapshot.stop,
              request.canonicalStopId,
            );
            onStopReceived?.(snapshot.stop);
            this.logger.debug('Stop data loaded before related routes', {
              stopId: snapshot.stop.stopId,
              name: snapshot.stop.name,
            });
            settleInitialResult({ status: 'loaded', stop: snapshot.stop });
          }

          if (snapshot.routes !== undefined) {
            const routeSnapshot = snapshot.routes ?? [];
            const newRouteData = routeSnapshot.filter(({ route }) => {
              if (processedRouteIds.has(route.routeId)) {
                return false;
              }
              processedRouteIds.add(route.routeId);
              return true;
            });
            const newRoutes = newRouteData.map(({ route }) => route);

            if (newRoutes.length > 0) {
              this.mapState.addRoutesToDisplay(
                newRoutes,
                request.canonicalStopId ?? stopId,
                true,
              );

              for (const route of newRoutes) {
                if (isSubwayRoute(route)) {
                  this.logger.debug(
                    'Skipping stop loading for subway route derived from stop',
                    { routeId: route.routeId, shortName: route.shortName },
                  );
                } else {
                  this.logger.debug('Registered route derived from stop', {
                    routeId: route.routeId,
                  });
                }
              }

              this.syncVectorTileFilters();
            }

            this.logger.debug('Stop routes loaded', {
              stopId,
              routesCount: routeSnapshot.length,
            });
          }

          if (!snapshot.hasNext) {
            completeRequest();
          }
        },
        error: (error: unknown) => {
          if (this.activeStopRequests.get(stopId) !== request) {
            return;
          }
          this.logger.error('Error loading stop data', error);
          if (shouldDisplaySnackbar) {
            this.snackBar.open(
              'Não foi possível carregar os dados da parada',
              'Fechar',
              { duration: 3000 },
            );
          }
          completeRequest(
            receivedStop ? undefined : { status: 'error', error },
          );
        },
        complete: () => {
          if (this.activeStopRequests.get(stopId) !== request) {
            return;
          }
          completeRequest();
        },
      });

    request.subscription.add(subscription);
    return initialResult;
  }
  async loadNearbyStops(lat: number, lon: number): Promise<void> {
    const finishLoading = this.beginLoading();
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
      finishLoading();
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
    this.cancelStopDataLoad(stopId);
    this.logger.debug('Removing display data sourced from stop', { stopId });
    this.mapState.removeStopDisplayData(stopId);
    this.syncVectorTileFilters();
    this.triggerDisplayUpdate();
  }

  cancelStopDataLoads(): void {
    for (const request of [...this.activeStopRequests.values()]) {
      request.cancel();
    }
  }

  syncVectorTileFilters(): void {
    const selectedRoutes = Array.from(this.mapState.selectedRoutes().keys());
    const displayedRoutes = this.mapState
      .displayedRoutes()
      .map((route) => route.routeId);
    const routeIds = Array.from(
      new Set([...selectedRoutes, ...displayedRoutes]),
    );
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

  cancelStopDataLoad(stopId: string): void {
    for (const [requestId, request] of this.activeStopRequests) {
      if (requestId === stopId || request.canonicalStopId === stopId) {
        request.cancel();
      }
    }
  }

  private beginLoading(): () => void {
    this.activeLoadCount++;
    this.mapState.isLoading.set(true);
    let finished = false;

    return () => {
      if (finished) {
        return;
      }
      finished = true;
      this.activeLoadCount = Math.max(0, this.activeLoadCount - 1);
      this.mapState.isLoading.set(this.activeLoadCount > 0);
    };
  }
}
