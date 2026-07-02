import { Injectable, inject } from '@angular/core';
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

@Injectable({
  providedIn: 'root',
})
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

    const route = await firstValueFrom(this.cache.getRoute(routeId));
    if (!route) {
      this.logger.warn('Route not found', { routeId });
      this.snackBar.open('Route not found', 'Close', { duration: 2000 });
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

    this.dataLoader.loadRouteData(routeId);
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
    const stop = await this.cache.getStop(stopId).toPromise();
    if (!stop) {
      this.logger.warn('Stop not found', { stopId });
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Stop not found', 'Close', { duration: 2000 });
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
    this.dataLoader.loadStopData(stopId);

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
    this.realtimeService.unsubscribeFromStop(stopId);

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

    for (const stopId of this.mapState.selectedStops().keys()) {
      this.realtimeService.unsubscribeFromStop(stopId);
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
