import { Service, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import {
  extractTrackedRailVehicleLineCode,
  getRailLineById,
  SpecialRailService,
} from '@metro/shared/utils';
import { LoggerService } from '@metro/shared/api';
import { BikeStationsService } from '../../services/bike-stations.service';
import { CptmVehicleLayerService } from '../../services/cptm-vehicle-layer.service';
import { RealtimeWebsocketService } from '../../services/realtime-websocket.service';
import {
  VectorTileLayerService,
  VectorTileLayerType,
} from '../../services/vector-tile-layer.service';
import { GeographyCacheService } from '../../utils/geography-cache.service';
import { MapDataLoaderService } from './map-data-loader.service';
import { MapDisplayService } from './map-display.service';
import { MapStateService } from './map-state.service';
import { SelectedRoute, SelectedStop } from './map.types';

@Service()
export class MapSelectionService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly mapState = inject(MapStateService);
  private readonly dataLoader = inject(MapDataLoaderService);
  private readonly displayService = inject(MapDisplayService);
  private readonly logger = inject(LoggerService);
  private readonly bikeStationsService = inject(BikeStationsService);
  private readonly cache = inject(GeographyCacheService);
  private readonly realtimeService = inject(RealtimeWebsocketService);
  private readonly cptmVehicleLayer = inject(CptmVehicleLayerService);
  private readonly vectorTileService = inject(VectorTileLayerService);

  async addRouteToSelection(
    routeId: string,
    shouldDisplaySnackbar: boolean,
  ): Promise<void> {
    this.logger.debug('Adding route to selection', { routeId });

    const routeResult = await firstValueFrom(this.cache.getRoute(routeId)).then(
      (route) => ({ success: true as const, route }),
      (error: unknown) => {
        this.logger.error('Failed to load route selection', error);
        if (shouldDisplaySnackbar) {
          this.snackBar.open('Não foi possível carregar a rota', 'Fechar', {
            duration: 3000,
          });
        }
        return { success: false as const };
      },
    );
    if (!routeResult.success) {
      return;
    }

    const { route } = routeResult;
    if (!route) {
      this.logger.warn('Route not found', { routeId });
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Rota não encontrada', 'Fechar', {
          duration: 2000,
        });
      }
      return;
    }

    // The lookup is asynchronous, so two callers can pass the initial
    // selection check before either one updates map state. Only the first
    // completed lookup owns the realtime route subscription.
    if (this.mapState.selectedRoutes().has(route.routeId)) {
      return;
    }

    const selectedRoute: SelectedRoute = {
      id: route.routeId,
      shortName: route.shortName,
      longName: route.longName,
      color: route.color ?? undefined,
      textColor: route.textColor ?? undefined,
    };
    this.mapState.addRouteToSelection(selectedRoute);

    this.logger.debug('Selected routes after addition', {
      selectedRoutes: Array.from(this.mapState.selectedRoutes().keys()),
    });

    this.dataLoader.syncVectorTileFilters();
    void this.dataLoader.loadRouteData(routeId, shouldDisplaySnackbar);
    this.subscribeToRouteRealtime(route.shortName);

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`Rota adicionada`, 'Fechar', { duration: 2000 });
    }
  }

  addRailLineToSelection(lineId: string, shouldDisplaySnackbar = true): void {
    this.logger.debug('Adding rail line to selection', { lineId });

    const railLine = getRailLineById(lineId);
    if (!railLine) {
      this.logger.warn('Rail line not found', { lineId });
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Linha não encontrada', 'Fechar', {
          duration: 2000,
        });
      }
      return;
    }

    if (this.mapState.selectedRoutes().has(railLine.lineId)) {
      this.logger.debug('Rail line already selected', { lineId });
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Linha já selecionada', 'Fechar', {
          duration: 2000,
        });
      }
      return;
    }

    const selectedRoute: SelectedRoute = {
      id: railLine.lineId,
      shortName: railLine.lineId,
      longName: railLine.fullName,
      color: railLine.colorHex.replace('#', ''),
      textColor: 'FFFFFF',
    };
    this.mapState.addRouteToSelection(selectedRoute);

    this.logger.debug('Selected routes after rail line addition', {
      selectedRoutes: Array.from(this.mapState.selectedRoutes().keys()),
    });

    const vehicleLineCode = extractTrackedRailVehicleLineCode(railLine.lineId);
    if (vehicleLineCode) {
      this.cptmVehicleLayer.subscribeToLine(vehicleLineCode);
      this.logger.info(
        `Subscribed to private vehicles for line: ${vehicleLineCode}`,
      );
    }

    this.vectorTileService.setLayerVisibility(
      VectorTileLayerType.RAIL_ROUTES,
      true,
    );

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`${railLine.fullName} adicionada`, 'Fechar', {
        duration: 2000,
      });
    }
  }

  addSpecialRailLineToSelection(
    service: SpecialRailService,
    shouldDisplaySnackbar = true,
  ): void {
    if (this.mapState.selectedRoutes().has(service.code)) {
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Linha já selecionada', 'Fechar', {
          duration: 2000,
        });
      }
      return;
    }

    this.mapState.addRouteToSelection({
      id: service.code,
      shortName: service.code,
      longName: service.name,
      color: service.colorHex.replace('#', ''),
      textColor: service.textColorHex.replace('#', ''),
    });
    this.cptmVehicleLayer.subscribeToLine(service.code);

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`${service.name} adicionada`, 'Fechar', {
        duration: 2000,
      });
    }
  }

  async addStopToSelection(
    stopId: string,
    shouldDisplaySnackbar = true,
  ): Promise<void> {
    const stopResult = await firstValueFrom(this.cache.getStop(stopId)).then(
      (stop) => ({ success: true as const, stop }),
      (error: unknown) => {
        this.logger.error('Failed to load stop selection', error);
        if (shouldDisplaySnackbar) {
          this.snackBar.open('Não foi possível carregar a parada', 'Fechar', {
            duration: 3000,
          });
        }
        return { success: false as const };
      },
    );
    if (!stopResult.success) {
      return;
    }

    const { stop } = stopResult;
    if (!stop) {
      this.logger.warn('Stop not found', { stopId });
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Parada não encontrada', 'Fechar', {
          duration: 2000,
        });
      }
      return;
    }

    const selectedStop: SelectedStop = {
      id: stop.stopId,
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      isSubwayStation: stop.isSubwayStation,
    };
    this.mapState.addStopToSelection(selectedStop);
    this.dataLoader.syncVectorTileFilters();
    void this.dataLoader.loadStopData(stopId, shouldDisplaySnackbar);

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`Parada adicionada`, 'Fechar', { duration: 2000 });
    }
  }

  removeRouteFromSelection(routeId: string): void {
    const route = this.mapState.selectedRoutes().get(routeId);
    this.unsubscribeFromRouteRealtime(route?.shortName);

    this.mapState.removeRouteFromSelection(routeId);
    this.dataLoader.removeRouteDisplayData(routeId);

    this.snackBar.open(`Rota removida`, 'Fechar', { duration: 2000 });
  }

  removeStopFromSelection(stopId: string): void {
    this.mapState.removeStopFromSelection(stopId);
    this.dataLoader.removeStopDisplayData(stopId);

    this.snackBar.open(`Parada removida`, 'Fechar', { duration: 2000 });
  }

  addBikeStationToSelection(
    stationId: string,
    shouldDisplaySnackbar = true,
  ): void {
    const station =
      this.bikeStationsService.getStation(stationId) ??
      this.mapState.bikeStations().find((item) => item.stationId === stationId);

    if (!station) {
      this.logger.warn('Bike station not found', { stationId });
      return;
    }

    this.mapState.addBikeStationToSelection({
      id: station.stationId,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
    });
    this.displayService.updateMapDisplay();
    if (shouldDisplaySnackbar) {
      this.snackBar.open('Estação fixada', 'Fechar', { duration: 2000 });
    }
  }

  removeBikeStationFromSelection(stationId: string): void {
    this.mapState.removeBikeStationFromSelection(stationId);
    this.displayService.updateMapDisplay();
    this.snackBar.open('Estação removida', 'Fechar', { duration: 2000 });
  }

  clearAllSelections(shouldDisplaySnackbar = true): void {
    for (const route of this.mapState.selectedRoutes().values()) {
      this.unsubscribeFromRouteRealtime(route.shortName);
    }

    this.mapState.clearAllSelections();
    this.dataLoader.syncVectorTileFilters();
    this.displayService.clearSelection();
    this.displayService.updateMapDisplay();

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`Seleções limpas`, 'Fechar', { duration: 2000 });
    }
  }

  private subscribeToRouteRealtime(shortName: string | null | undefined): void {
    if (!shortName) {
      return;
    }

    const vehicleLineCode = extractTrackedRailVehicleLineCode(shortName);
    if (vehicleLineCode) {
      this.cptmVehicleLayer.subscribeToLine(vehicleLineCode);
      this.logger.info(
        `Subscribed to private vehicles for line: ${vehicleLineCode}`,
      );
    } else if (
      !shortName.startsWith('METRÔ') &&
      !shortName.startsWith('CPTM')
    ) {
      this.realtimeService.subscribeToRoute(shortName);
      this.logger.info(`Subscribed to real-time for route: ${shortName}`);
    }
  }

  private unsubscribeFromRouteRealtime(
    shortName: string | null | undefined,
  ): void {
    if (!shortName) {
      return;
    }

    const vehicleLineCode = extractTrackedRailVehicleLineCode(shortName);
    if (vehicleLineCode) {
      this.cptmVehicleLayer.unsubscribeFromLine(vehicleLineCode);
      this.logger.info(
        `Unsubscribed from private vehicles for line: ${vehicleLineCode}`,
      );
    } else if (
      !shortName.startsWith('METRÔ') &&
      !shortName.startsWith('CPTM')
    ) {
      this.realtimeService.unsubscribeFromRoute(shortName);
      this.logger.info(`Unsubscribed from real-time for route: ${shortName}`);
    }
  }
}
