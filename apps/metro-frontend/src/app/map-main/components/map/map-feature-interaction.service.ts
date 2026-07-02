import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoggerService } from '@metro/shared/api';
import { Feature } from 'ol';
import { FeatureLike } from 'ol/Feature';
import { BikeStationsService } from '../../services/bike-stations.service';
import { MapService } from '../../services/map.service';
import {
  VectorTileLayerService,
  VectorTileLayerType,
} from '../../services/vector-tile-layer.service';
import { MapDetailsDialogService } from './map-details-dialog.service';
import { MapDisplayService } from './map-display.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';

@Injectable({
  providedIn: 'root',
})
export class MapFeatureInteractionService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly mapState = inject(MapStateService);
  private readonly displayService = inject(MapDisplayService);
  private readonly logger = inject(LoggerService);
  private readonly mapService = inject(MapService);
  private readonly bikeStationsService = inject(BikeStationsService);
  private readonly vectorTileService = inject(VectorTileLayerService);
  private readonly detailsService = inject(MapDetailsDialogService);
  private readonly selectionService = inject(MapSelectionService);

  handleFeatureSelection(feature: Feature | FeatureLike): void {
    const clusterMembers = this.getClusterMembers(feature as Feature);

    if (clusterMembers && clusterMembers.length > 1) {
      this.mapService.zoomToFeatures(clusterMembers);
      return;
    }

    const targetFeature =
      clusterMembers && clusterMembers.length === 1
        ? clusterMembers[0]
        : (feature as Feature);

    const properties = targetFeature.getProperties();

    if (this.vectorTileService.isVectorTileFeature(feature)) {
      this.handleVectorTileFeatureSelection(feature);
      return;
    }

    if (properties['vehicleId']) {
      this.showVehicleInfo(properties);
    } else if (properties['stopId']) {
      this.detailsService.showRoutesForStop(properties['stopId'] as string);
    } else if (properties['type'] === 'bike_station') {
      const stationId = properties['stationId'] as string | undefined;
      if (stationId) {
        this.detailsService.showBikeStationDetails(stationId);
      }
    } else if (properties['routeId']) {
      this.showRouteDetails(properties['routeId'] as string, properties);
    } else if (properties['shapeId']) {
      this.showShapeDetails(properties['shapeId'] as string);
    }
  }

  private handleVectorTileFeatureSelection(feature: FeatureLike): void {
    const layerType = this.vectorTileService.getFeatureLayerType(feature);

    switch (layerType) {
      case VectorTileLayerType.RAIL_STATIONS:
        this.handleSubwayStationClick(feature);
        break;
      case VectorTileLayerType.RAIL_ROUTES:
        this.handleSubwayRouteClick(feature);
        break;
      case VectorTileLayerType.BUS_STOPS:
        this.handleBusStopTileClick(feature);
        break;
      case VectorTileLayerType.BUS_ROUTES:
        this.handleBusRouteTileClick(feature);
        break;
      case VectorTileLayerType.BIKE_STATIONS:
        this.handleBikeStationTileClick(feature);
        break;
      default:
        this.logger.debug(
          'Unknown vector tile feature type',
          feature.getProperties(),
        );
    }
  }

  private handleSubwayStationClick(feature: FeatureLike): void {
    const properties = feature.getProperties();
    this.logger.debug(
      'handleSubwayStationClick: raw feature properties',
      properties,
    );

    this.logger.debug('Feature property details:', {
      keys: Object.keys(properties),
      values: Object.entries(properties).map(([key, value]) => ({
        key,
        type: typeof value,
        isArray: Array.isArray(value),
        value: value,
      })),
    });

    const stationData = this.vectorTileService.extractRailStationData(feature);

    if (!stationData) {
      this.logger.error('Could not extract station data from feature', {
        allProperties: properties,
        propertyKeys: Object.keys(properties),
        geometryType: feature.getGeometry()?.getType(),
      });
      this.snackBar.open('Erro ao carregar dados da estação', 'Fechar', {
        duration: 3000,
      });
      return;
    }

    this.logger.debug('Subway station clicked (vector tile)', stationData);

    if (stationData.lines.length === 0) {
      this.logger.warn('Station has no lines', stationData);
    }

    this.detailsService.openSubwayStationDialog(stationData);
  }

  private handleSubwayRouteClick(feature: FeatureLike): void {
    const routeData = this.vectorTileService.extractRailRouteData(feature);

    if (!routeData) {
      this.logger.warn('Could not extract route data from feature');
      return;
    }

    this.logger.debug('Subway route clicked (vector tile)', routeData);

    let message = '';

    if (routeData.lineCode) {
      const lineName = routeData.name || `L${routeData.lineCode}`;
      message = `Linha: ${lineName}`;
    } else if (routeData.name) {
      message = `Linha: ${routeData.name}`;
    } else if (routeData.lineNumber) {
      message = `Linha: L${routeData.lineNumber}`;
    } else {
      message = `Linha ID: ${routeData.id}`;
    }

    this.snackBar.open(message, 'Fechar', { duration: 3000 });
  }

  private handleBusStopTileClick(feature: FeatureLike): void {
    const stopData = this.vectorTileService.extractBusStopData(feature);

    if (!stopData) {
      this.logger.warn('Could not extract bus stop data from vector tile');
      return;
    }

    this.detailsService.showRoutesForStop(stopData.stopId);
  }

  private handleBusRouteTileClick(feature: FeatureLike): void {
    const routeData = this.vectorTileService.extractBusRouteData(feature);

    if (!routeData) {
      this.logger.warn('Could not extract bus route data from vector tile');
      return;
    }

    this.showRouteDetails(routeData.routeId, {
      shortName: routeData.shortName,
      longName: routeData.longName,
      color: routeData.color,
      textColor: routeData.textColor,
    });
  }

  private handleBikeStationTileClick(feature: FeatureLike): void {
    const clusterData =
      this.vectorTileService.extractBikeStationClusterData(feature);

    if (clusterData) {
      if (
        Number.isFinite(clusterData.latitude) &&
        Number.isFinite(clusterData.longitude)
      ) {
        const currentZoom = this.mapService.zoomLevel() ?? 12;
        const targetZoom = Math.min(18, currentZoom + 2);

        this.displayService.centerOn(
          [clusterData.longitude, clusterData.latitude],
          targetZoom,
        );
      }
      return;
    }

    const stationData = this.vectorTileService.extractBikeStationData(feature);

    if (!stationData) {
      this.logger.warn('Could not extract bike station data from vector tile');
      return;
    }

    const station = this.bikeStationsService.upsertStationSummary(stationData);
    this.mapState.setBikeStations(this.bikeStationsService.stations());
    this.detailsService.showBikeStationDetails(station.stationId);
  }

  private showVehicleInfo(properties: Record<string, unknown>): void {
    const vehicleId = String(properties['vehicleId'] || '');
    const routeShortName = String(properties['routeShortName'] || '');

    this.snackBar.open(
      `Ônibus ${vehicleId} - Linha ${routeShortName}`,
      'Close',
      { duration: 3000 },
    );
  }

  private showRouteDetails(
    routeId: string,
    properties: Record<string, unknown>,
  ): void {
    const routeName = properties['shortName']
      ? `${properties['shortName']} - ${properties['longName']}`
      : properties['longName'] || routeId;

    this.snackBar
      .open(`Rota: ${routeName}`, 'Adicionar', { duration: 5000 })
      .onAction()
      .subscribe(() => {
        this.selectionService.addRouteToSelection(routeId, true);
      });
  }

  private showShapeDetails(shapeId: string): void {
    this.snackBar.open(`Shape: ${shapeId}`, 'Close', { duration: 3000 });
  }

  private getClusterMembers(feature: Feature): Feature[] | null {
    const members = feature.get('features');
    if (!Array.isArray(members)) {
      return null;
    }

    return members as Feature[];
  }
}
