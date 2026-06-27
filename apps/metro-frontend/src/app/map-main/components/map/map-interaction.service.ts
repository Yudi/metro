import { Injectable, inject, effect } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  MatDialog,
  MatDialogRef,
  MatDialogState,
} from '@angular/material/dialog';
import { Feature } from 'ol';
import { FeatureLike } from 'ol/Feature';
import { GeographyGraphQLService } from '../../services/geography-graphql.service';
import { SearchDialogComponent } from '../search-dialog/search-dialog.component';
import {
  ExploreDialogComponent,
  ExploreDialogResult,
} from '../explore-dialog/explore-dialog.component';
import {
  BusStopDialogComponent,
  BusStopDialogData,
} from '../bus-stop-dialog/bus-stop-dialog.component';
import {
  SubwayStationDialogComponent,
  SubwayStationDialogData,
} from '../subway-station-dialog/subway-station-dialog.component';
import { MapStateService } from './map-state.service';
import { MapDataLoaderService } from './map-data-loader.service';
import { MapDisplayService } from './map-display.service';
import { SearchResult, SelectedRoute, SelectedStop } from './map.types';
import { LoggerService } from '@metro/shared/api';
import { MapService } from '../../services/map.service';
import { BikeStationsService } from '../../services/bike-stations.service';
import { GeographyCacheService } from '../../utils/geography-cache.service';
import { RealtimeWebsocketService } from '../../services/realtime-websocket.service';
import { CptmVehicleLayerService } from '../../services/cptm-vehicle-layer.service';
import {
  extractTrackedRailVehicleLineCode,
  getRailLineById,
  SpecialRailService,
  SAO_PAULO_CITY_CENTER,
  SAO_PAULO_CITY_CENTER_COORDINATES,
} from '@metro/shared/utils';
import {
  BikeStationDialogComponent,
  BikeStationDialogData,
  BikeStationDialogResult,
} from '../bike-station-dialog/bike-station-dialog.component';
import {
  VectorTileLayerService,
  VectorTileLayerType,
} from '../../services/vector-tile-layer.service';
import { GeolocationService } from '@metro/shared/geolocation';
import { UserLocationLayerService } from '../../services/user-location-layer.service';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class MapInteractionService {
  private readonly geographyService = inject(GeographyGraphQLService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly mapState = inject(MapStateService);
  private readonly dataLoader = inject(MapDataLoaderService);
  private readonly displayService = inject(MapDisplayService);
  private readonly logger = inject(LoggerService);
  private readonly mapService = inject(MapService);
  private readonly bikeStationsService = inject(BikeStationsService);
  private readonly cache = inject(GeographyCacheService);
  private readonly realtimeService = inject(RealtimeWebsocketService);
  private readonly cptmVehicleLayer = inject(CptmVehicleLayerService);
  private readonly vectorTileService = inject(VectorTileLayerService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly userLocationLayer = inject(UserLocationLayerService);

  private bikeStationDialogRef: MatDialogRef<
    BikeStationDialogComponent,
    BikeStationDialogResult | undefined
  > | null = null;
  private activeBikeStationId: string | null = null;

  constructor() {
    effect(() => {
      const stations = this.mapState.bikeStations();
      const dialogRef = this.bikeStationDialogRef;

      if (
        !dialogRef ||
        dialogRef.getState() !== MatDialogState.OPEN ||
        !this.activeBikeStationId
      ) {
        return;
      }

      const nextStation = stations.find(
        (station) => station.stationId === this.activeBikeStationId,
      );

      if (nextStation) {
        dialogRef.componentInstance?.updateStation(nextStation);
      }
    });
  }

  openSearchModal(): void {
    const dialogRef = this.dialog.open(SearchDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      maxHeight: '80vh',
      panelClass: 'search-dialog-panel',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        if ('showAll' in result) {
          // Handle "Show All Results" case
          this.logger.debug('Showing all results on map', {
            count: result.results.length,
          });
          this.snackBar.open(
            `Showing ${result.results.length} results on map`,
            'Close',
            { duration: 3000 },
          );
        } else {
          // Handle single result selection
          this.handleSearchResult(result);
        }
      }
    });
  }

  openExploreModal(): void {
    const dialogRef = this.dialog.open<
      ExploreDialogComponent,
      undefined,
      ExploreDialogResult | undefined
    >(ExploreDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      maxHeight: '80vh',
      panelClass: 'search-dialog-panel',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) {
        return;
      }

      if (result.action === 'manual') {
        this.startExploreLocationSelection();
        return;
      }

      this.setExploreLocation(result.latitude, result.longitude, result.label);
    });
  }

  private handleSearchResult(result: SearchResult): void {
    if (
      result.type === 'stop' ||
      result.type === 'bus_stop' ||
      result.type === 'subway_station'
    ) {
      // For GPKG rail stations, handle selection and dialog
      if (result.source === 'gpkg' && result.type === 'subway_station') {
        this.handleGPKGRailStationSelection(result);
      } else {
        // For GTFS stops/stations, use the regular flow
        this.addStopToSelection(result.id);
      }
      // Zoom to the stop location on the map
      if (result.latitude && result.longitude) {
        this.displayService.centerOn([result.longitude, result.latitude], 16);
      }
    } else if (result.type === 'bike_station') {
      if (result.latitude && result.longitude) {
        this.bikeStationsService.upsertStationSummary({
          stationId: result.id,
          name: result.name,
          latitude: result.latitude,
          longitude: result.longitude,
          capacity: null,
          effectiveCapacity: 0,
          numBikesAvailable: 0,
          electricBikesAvailable: 0,
        });
        this.mapState.setBikeStations(this.bikeStationsService.stations());
        this.displayService.centerOn([result.longitude, result.latitude], 17);
      }
      this.showBikeStationDetails(result.id);
    } else if (result.type === 'route') {
      // For routes, use route_id from routeData (the actual route code like "477P-10")
      this.logger.debug('User selected route', { result });
      if (result.specialService) {
        this.addSpecialRailLineToSelection(result.specialService);
      } else if (result.routeData?.route_id) {
        // Check if this is a rail line (from RAIL_LINES constant)
        if (result.routeData.source === 'rail') {
          this.logger.debug('Loading rail line', {
            lineId: result.routeData.route_id,
          });
          this.addRailLineToSelection(result.routeData.route_id);
        } else {
          this.logger.debug('Loading bus route', {
            routeCode: result.routeData.route_id,
          });
          this.addRouteToSelection(result.routeData.route_id, true);
        }
      } else {
        this.logger.warn('Route search result missing routeData', result);
      }
    }
  }

  /**
   * Handle GPKG rail station selection from search
   * Adds the station to map selection and opens the dialog
   */
  private handleGPKGRailStationSelection(result: SearchResult): void {
    this.logger.debug('[handleGPKGRailStationSelection] Received result:', {
      id: result.id,
      name: result.name,
      description: result.description,
      routes: result.routes,
      lineCodes: result.lineCodes,
      source: result.source,
    });

    if (!result.latitude || !result.longitude) {
      this.logger.warn('GPKG station missing coordinates', result);
      return;
    }

    // Add station to map selection so it gets pinned
    const selectedStop: SelectedStop = {
      id: result.id,
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      isSubwayStation: true,
    };
    this.mapState.addStopToSelection(selectedStop);
    this.snackBar.open(`Estação adicionada`, 'Fechar', { duration: 2000 });

    // Open dialog with GPKG station data
    // routes contains Portuguese color names (e.g., "AMARELA", "ESMERALDA")
    const stopData = {
      id: result.id,
      name: result.name,
      agencies: [] as string[],
      lines: result.routes || [], // Portuguese color names
      isMerged: false,
    };

    this.logger.debug(
      '[handleGPKGRailStationSelection] stopData.lines:',
      stopData.lines,
    );

    // Try to extract agencies from description if available
    if (result.description) {
      const parts = result.description.split(' - ');
      if (parts.length >= 2) {
        // First part is agencies (e.g., "METRO, VIAQUATRO")
        const agencyPart = parts[0];
        stopData.agencies = agencyPart.split(',').map((a) => a.trim());
      }
    }

    this.openSubwayStationDialog(stopData);
  }

  // Selection Management Methods with notifications
  async addRouteToSelection(
    routeId: string,
    shouldDisplaySnackbar: boolean,
  ): Promise<void> {
    this.logger.debug('Adding route to selection', { routeId });

    // Load route data to get metadata
    const route = await firstValueFrom(this.cache.getRoute(routeId));
    if (!route) {
      this.logger.warn('Route not found', { routeId });
      this.snackBar.open('Route not found', 'Close', { duration: 2000 });
      return;
    }

    // Add to selection with metadata
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

    // Load route display data (shapes, stops)
    this.dataLoader.loadRouteData(routeId);

    // Subscribe to real-time data based on route type
    if (route.shortName) {
      // Check if this line has private vehicle tracking (L4, L10-L13)
      const vehicleLineCode = extractTrackedRailVehicleLineCode(route.shortName);
      if (vehicleLineCode) {
        this.cptmVehicleLayer.subscribeToLine(vehicleLineCode);
        this.logger.info(
          `Subscribed to private vehicles for line: ${vehicleLineCode}`,
        );
      } else if (
        !route.shortName.startsWith('METRÔ') &&
        !route.shortName.startsWith('CPTM')
      ) {
        // Subscribe to bus real-time data
        this.realtimeService.subscribeToRoute(route.shortName);
        this.logger.info(
          `Subscribed to real-time for route: ${route.shortName}`,
        );
      }
    }

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`Rota adicionada`, 'Fechar', { duration: 2000 });
    }
  }

  /**
   * Add a rail line (Metro/CPTM) to selection
   * Uses static RAIL_LINES data instead of GTFS database query
   */
  addRailLineToSelection(lineId: string, shouldDisplaySnackbar = true): void {
    this.logger.debug('Adding rail line to selection', { lineId });

    // Get rail line info from static constant
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

    // Check if already selected
    if (this.mapState.selectedRoutes().has(railLine.lineId)) {
      this.logger.debug('Rail line already selected', { lineId });
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Linha já selecionada', 'Fechar', {
          duration: 2000,
        });
      }
      return;
    }

    // Add to selection with metadata
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

    // For lines with private vehicle tracking (L4, L10-L13), subscribe to train vehicle updates
    const vehicleLineCode = extractTrackedRailVehicleLineCode(railLine.lineId);
    if (vehicleLineCode) {
      this.cptmVehicleLayer.subscribeToLine(vehicleLineCode);
      this.logger.info(
        `Subscribed to private vehicles for line: ${vehicleLineCode}`,
      );
    }

    // Enable rail routes layer to show the line on map
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
        this.snackBar.open('Linha já selecionada', 'Fechar', { duration: 2000 });
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
    // Load stop data to get metadata
    const stop = await this.cache.getStop(stopId).toPromise();
    if (!stop) {
      this.logger.warn('Stop not found', { stopId });
      if (shouldDisplaySnackbar) {
        this.snackBar.open('Stop not found', 'Close', { duration: 2000 });
      }
      return;
    }

    // Add to selection with metadata
    const selectedStop: SelectedStop = {
      id: stop.stopId,
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      isSubwayStation: stop.isSubwayStation,
    };
    this.mapState.addStopToSelection(selectedStop);

    // Load stop display data
    this.dataLoader.loadStopData(stopId);

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`Parada adicionada`, 'Fechar', { duration: 2000 });
    }
  }

  removeRouteFromSelection(routeId: string): void {
    // Get route metadata before removing (for real-time unsubscribe)
    const route = this.mapState.selectedRoutes().get(routeId);
    if (route?.shortName) {
      // Check if this line has private vehicle tracking (L4, L10-L13)
      const vehicleLineCode = extractTrackedRailVehicleLineCode(route.shortName);
      if (vehicleLineCode) {
        this.cptmVehicleLayer.unsubscribeFromLine(vehicleLineCode);
        this.logger.info(
          `Unsubscribed from private vehicles for line: ${vehicleLineCode}`,
        );
      } else if (
        !route.shortName.startsWith('METRÔ') &&
        !route.shortName.startsWith('CPTM')
      ) {
        this.realtimeService.unsubscribeFromRoute(route.shortName);
        this.logger.info(
          `Unsubscribed from real-time for route: ${route.shortName}`,
        );
      }
    }

    this.mapState.removeRouteFromSelection(routeId);
    // Use targeted removal instead of full refresh to avoid refetching stop data
    this.dataLoader.removeRouteDisplayData(routeId);

    this.snackBar.open(`Rota removida`, 'Fechar', { duration: 2000 });
  }

  removeStopFromSelection(stopId: string): void {
    this.realtimeService.unsubscribeFromStop(stopId);

    this.mapState.removeStopFromSelection(stopId);
    // Use targeted removal - source tracking ensures only items
    // that are no longer needed by any selection are removed
    this.dataLoader.removeStopDisplayData(stopId);

    this.snackBar.open(`Parada removida`, 'Fechar', { duration: 2000 });
  }

  clearAllSelections(shouldDisplaySnackbar = true): void {
    // Unsubscribe from all real-time data for routes
    for (const route of this.mapState.selectedRoutes().values()) {
      if (route.shortName) {
        // Check if this line has private vehicle tracking (L4, L10-L13)
        const vehicleLineCode = extractTrackedRailVehicleLineCode(
          route.shortName,
        );
        if (vehicleLineCode) {
          this.cptmVehicleLayer.unsubscribeFromLine(vehicleLineCode);
        } else if (
          !route.shortName.startsWith('METRÔ') &&
          !route.shortName.startsWith('CPTM')
        ) {
          this.realtimeService.unsubscribeFromRoute(route.shortName);
        }
      }
    }

    // Unsubscribe from all real-time data for stops
    for (const stopId of this.mapState.selectedStops().keys()) {
      this.realtimeService.unsubscribeFromStop(stopId);
    }

    this.mapState.clearAllSelections();
    this.dataLoader.syncVectorTileFilters();
    // Clear the selection layer
    this.displayService.clearSelection();
    // Trigger display update to remove features from the map
    this.displayService.updateMapDisplay();

    if (shouldDisplaySnackbar) {
      this.snackBar.open(`Seleções limpas`, 'Fechar', { duration: 2000 });
    }
  }

  // Feature interaction methods
  handleFeatureSelection(feature: Feature | FeatureLike): void {
    // Handle regular features (GeoJSON-based)
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

    // Check if this is a vector tile feature first
    if (this.vectorTileService.isVectorTileFeature(feature)) {
      this.handleVectorTileFeatureSelection(feature);
      return;
    }

    // Check if it's a vehicle feature
    if (properties['vehicleId']) {
      this.showVehicleInfo(properties);
    }
    // Check if it's a stop feature
    else if (properties['stopId']) {
      this.showRoutesForStop(properties['stopId'] as string);
    }
    // Check if it's a bike station feature
    else if (properties['type'] === 'bike_station') {
      const stationId = properties['stationId'] as string | undefined;
      if (stationId) {
        this.showBikeStationDetails(stationId);
      }
    }
    // Check if it's a route feature
    else if (properties['routeId']) {
      this.showRouteDetails(properties['routeId'] as string, properties);
    }
    // Check if it's a shape feature
    else if (properties['shapeId']) {
      this.showShapeDetails(properties['shapeId'] as string);
    }
  }

  /**
   * Handle clicks on vector tile features (subway stations and routes)
   */
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

  /**
   * Handle click on a subway station from vector tile layer
   */
  private handleSubwayStationClick(feature: FeatureLike): void {
    const properties = feature.getProperties();
    this.logger.debug(
      'handleSubwayStationClick: raw feature properties',
      properties,
    );

    // Log ALL property keys and values for debugging
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

    // Open the subway station dialog with the extracted data
    this.openSubwayStationDialog(stationData);
  }

  /**
   * Handle click on a subway route from vector tile layer
   */
  private handleSubwayRouteClick(feature: FeatureLike): void {
    const routeData = this.vectorTileService.extractRailRouteData(feature);

    if (!routeData) {
      this.logger.warn('Could not extract route data from feature');
      return;
    }

    this.logger.debug('Subway route clicked (vector tile)', routeData);

    // Try to get detailed line information from line code
    let message = '';

    if (routeData.lineCode) {
      // Import getRailLineByCode dynamically or use it if already imported
      // For now, use the available data
      const lineName = routeData.name || `L${routeData.lineCode}`;
      message = `Linha: ${lineName}`;
    } else if (routeData.name) {
      message = `Linha: ${routeData.name}`;
    } else if (routeData.lineNumber) {
      message = `Linha: L${routeData.lineNumber}`;
    } else {
      message = `Linha ID: ${routeData.id}`;
    }

    // Show snackbar with route info (similar to bus routes)
    this.snackBar.open(message, 'Fechar', { duration: 3000 });
  }

  private handleBusStopTileClick(feature: FeatureLike): void {
    const stopData = this.vectorTileService.extractBusStopData(feature);

    if (!stopData) {
      this.logger.warn('Could not extract bus stop data from vector tile');
      return;
    }

    this.showRoutesForStop(stopData.stopId);
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
    this.showBikeStationDetails(station.stationId);
  }

  /**
   * Open subway station dialog with data from vector tile feature
   *
   * Adapts GPKG merged station data format to the dialog's expected format:
   * - GPKG format: { id, name, agencies[], lines[], isMerged }
   * - Dialog format: { id, stopId, name, agencies[], routeShortNames[], isSubwayStation }
   *
   * Note: Station names from GPKG are in ALL CAPS (e.g., "PINHEIROS").
   * The dialog's displayName getter will apply title case formatting.
   */
  private openSubwayStationDialog(stationData: {
    id: string;
    name: string;
    agencies: string[];
    lines: string[];
    isMerged: boolean;
  }): void {
    // Adapt GPKG merged station data to BusStopGraphQL-compatible object for the dialog
    const stopId = String(stationData.id);

    const dialogData: SubwayStationDialogData = {
      stop: {
        id: stopId,
        stopId: stopId,
        name: stationData.name, // Keep original GPKG format; dialog will format it
        latitude: 0, // Not needed for display
        longitude: 0, // Not needed for display
        isSubwayStation: true,
        agencies: stationData.agencies,
        routeShortNames: stationData.lines,
      },
    };

    const dialogRef = this.dialog.open(SubwayStationDialogComponent, {
      data: dialogData,
      width: '500px',
      maxWidth: '90vw',
    });

    dialogRef.afterClosed().subscribe(() => {
      this.displayService.updateMapDisplay();
    });
  }

  private showBikeStationDetails(stationId: string): void {
    this.bikeStationsService.ensureStationDetails(stationId);

    const station =
      this.bikeStationsService.getStation(stationId) ??
      this.mapState
        .bikeStations()
        .find((item) => item.stationId === stationId);

    if (!station) {
      this.logger.warn('Bike station not found in state', { stationId });
      return;
    }

    this.activeBikeStationId = station.stationId;

    if (
      this.bikeStationDialogRef &&
      this.bikeStationDialogRef.getState() === MatDialogState.OPEN
    ) {
      this.bikeStationDialogRef.componentInstance?.updateStation(station);
      return;
    }

    this.bikeStationDialogRef = this.dialog.open<
      BikeStationDialogComponent,
      BikeStationDialogData,
      BikeStationDialogResult | undefined
    >(BikeStationDialogComponent, {
      width: '480px',
      maxWidth: '96vw',
      data: { station },
      autoFocus: false,
    });

    this.bikeStationDialogRef.afterClosed().subscribe((result) => {
      this.bikeStationDialogRef = null;
      this.activeBikeStationId = null;

      if (result?.action === 'select' && result.stationId) {
        this.addBikeStationToSelection(result.stationId);
      } else {
        // Only clear selection highlight if not pinning (to avoid wiping persisted selections)
        this.displayService.updateMapDisplay();
      }
    });
  }

  /**
   * Add a bike station to the user's selections
   */
  addBikeStationToSelection(
    stationId: string,
    shouldDisplaySnackbar = true,
  ): void {
    // Get station metadata from loaded bike stations
    const station =
      this.bikeStationsService.getStation(stationId) ??
      this.mapState
        .bikeStations()
        .find((s) => s.stationId === stationId);

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

  /**
   * Remove a bike station from the user's selections
   */
  removeBikeStationFromSelection(stationId: string): void {
    this.mapState.removeBikeStationFromSelection(stationId);
    this.displayService.updateMapDisplay();
    this.snackBar.open('Estação removida', 'Fechar', { duration: 2000 });
  }

  private showVehicleInfo(properties: Record<string, unknown>): void {
    const vehicleId = String(properties['vehicleId'] || '');
    const routeShortName = String(properties['routeShortName'] || '');

    // Simple snackbar for now - can be replaced with full dialog later
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
        this.addRouteToSelection(routeId, true);
      });
  }

  private showShapeDetails(shapeId: string): void {
    this.snackBar.open(`Shape: ${shapeId}`, 'Close', { duration: 3000 });
  }

  async showRoutesForStop(stopId: string): Promise<void> {
    this.logger.debug('Showing routes for stop', { stopId });
    try {
      const stop = await this.geographyService.getBusStop(stopId).toPromise();
      this.logger.debug(
        'Stop data fetched',
        stop
          ? {
              id: stop.id,
              stopId: stop.stopId,
              name: stop.name,
              agencies: stop.agencies,
              routeShortNames: stop.routeShortNames,
            }
          : { data: 'null' },
      );

      if (stop) {
        // Use isSubwayStation from the stop data directly, not from pre-loaded map state
        // because subway stations are now rendered via Vector Tiles and the subwayStations
        // array might be empty or incomplete
        if (stop.isSubwayStation) {
          // Open subway station dialog with the stop data
          const dialogData: SubwayStationDialogData = {
            stop: stop,
          };

          const dialogRef = this.dialog.open(SubwayStationDialogComponent, {
            data: dialogData,
            width: '500px',
            maxWidth: '90vw',
          });

          dialogRef.afterClosed().subscribe(() => {
            // Just refresh display, don't clear selection layer
            this.displayService.updateMapDisplay();
          });
        } else {
          // Open bus stop dialog
          const routes = await this.geographyService
            .getRoutesForStop(stopId)
            .toPromise();

          this.logger.debug('Current state', {
            selectedRoutes: Array.from(this.mapState.selectedRoutes().keys()),
            routesForStop: routes?.map((r) => ({
              id: r.id,
              routeId: r.routeId,
              shortName: r.shortName,
            })),
          });

          const dialogData: BusStopDialogData = {
            stop: stop,
            routes: routes || [],
            selectedRoutes: this.mapState.selectedRouteIds(),
          };

          const dialogRef = this.dialog.open(BusStopDialogComponent, {
            data: dialogData,
            width: '600px',
            maxWidth: '90vw',
          });

          dialogRef.afterClosed().subscribe((result) => {
            if (result?.action === 'add') {
              this.addStopToSelection(result.stopId);
            } else if (result?.action === 'selectRoute') {
              this.logger.debug('Adding route from stop dialog', {
                routeId: result.routeId,
              });
              this.addRouteToSelection(result.routeId, true);
            } else {
              // Just refresh display if no action taken
              this.displayService.updateMapDisplay();
            }
          });
        }
      } else {
        this.logger.warn('No stop data found', { stopId });
        this.snackBar.open('Stop not found', 'Close', { duration: 3000 });
      }
    } catch (error) {
      this.logger.error('Error loading stop details', error);
      this.snackBar.open('Error loading stop details', 'Close', {
        duration: 3000,
      });
    }
  }

  // Nearby mode methods

  /**
   * Activates nearby mode - sets display mode and triggers geolocation
   */
  activateNearbyMode(): void {
    this.logger.debug('Activating nearby mode');
    this.mapState.displayMode.set('nearby');
    this.displayService.clearExploreLocation();
    this.showNearbyStops();

    // Show user location layer on map (starts tracking if needed)
    this.userLocationLayer.show().then((success) => {
      if (success) {
        this.logger.debug('User location layer visible');
      }
    });
  }

  /**
   * Deactivates nearby mode - clears nearby features and switches to selected mode.
   * Preserves features that were manually selected/pinned by the user.
   */
  deactivateNearbyMode(): void {
    this.logger.debug('Deactivating nearby mode');

    // Switch mode first
    this.mapState.displayMode.set('selected');

    // Hide user location layer (but keep tracking for centering)
    this.userLocationLayer.hide();
    this.displayService.clearExploreLocation();

    // Clear nearby center since we're leaving nearby mode
    this.mapState.nearbyCenter.set(null);

    // Clear nearby features from map layers
    this.displayService.clearNearbyFeatures();

    // Reset displayed data (nearby stops) and reload only selected items
    // This preserves user selections while removing auto-loaded nearby items
    this.dataLoader.refreshDisplayedData();
  }

  /**
   * @deprecated Use activateNearbyMode() or deactivateNearbyMode() instead
   */
  toggleNearbyMode(): void {
    if (this.mapState.displayMode() === 'nearby') {
      this.deactivateNearbyMode();
    } else {
      this.activateNearbyMode();
    }
  }

  private async showNearbyStops(): Promise<void> {
    // Check if geolocation is supported
    if (!this.geolocationService.isSupported()) {
      this.logger.warn('Geolocation not supported');
      this.snackBar.open('Localização não disponível', 'Fechar', {
        duration: 3000,
      });
      this.fallbackToDefaultLocation();
      return;
    }

    // Check if permission is denied
    if (this.geolocationService.permission() === 'denied') {
      this.snackBar.open(
        'Acesso à localização negado. Permita nas configurações do navegador.',
        'Fechar',
        { duration: 4000 },
      );
      this.fallbackToDefaultLocation();
      return;
    }

    // Show loading message
    this.snackBar.open('Obtendo sua localização...', 'Fechar', {
      duration: 2000,
    });

    // Request location using the shared service
    const location = await this.geolocationService.requestLocation();

    if (location) {
      this.logger.debug('Geolocation success', location);
      this.dataLoader.loadNearbyStops(location.latitude, location.longitude);
      this.displayService.centerOn([location.longitude, location.latitude], 14);
      this.snackBar.open('Mostrando paradas próximas', 'Fechar', {
        duration: 2000,
      });
    } else {
      const permission = this.geolocationService.permission();
      let errorMessage =
        'Falha ao obter localização. Usando localização padrão.';

      if (permission === 'denied') {
        errorMessage =
          'Acesso à localização negado. Usando localização padrão.';
      }

      this.snackBar.open(errorMessage, 'Fechar', { duration: 4000 });
      this.fallbackToDefaultLocation();
    }
  }

  private fallbackToDefaultLocation(): void {
    this.logger.info('Using default location: São Paulo center');
    this.dataLoader.loadNearbyStops(
      SAO_PAULO_CITY_CENTER.latitude,
      SAO_PAULO_CITY_CENTER.longitude,
    );
    this.displayService.centerOn(SAO_PAULO_CITY_CENTER_COORDINATES, 14);
  }

  private startExploreLocationSelection(): void {
    const snackRef = this.snackBar.open(
      'Toque no mapa para escolher um local',
      'Cancelar',
    );

    snackRef.onAction().subscribe(() => {
      this.mapService.cancelPointSelection();
    });

    this.mapService.startPointSelection(({ lat, lon }) => {
      snackRef.dismiss();
      this.setExploreLocation(lat, lon, 'Local escolhido');
    });
  }

  private setExploreLocation(lat: number, lon: number, label: string): void {
    this.logger.debug('Setting explore location', { lat, lon, label });
    this.userLocationLayer.hide();
    this.displayService.clearExploreLocation();
    this.mapState.displayMode.set('nearby');
    this.displayService.showExploreLocation(lat, lon, label);
    this.dataLoader.loadNearbyStops(lat, lon);
    this.displayService.centerOn([lon, lat], 14);
    this.snackBar.open('Mostrando paradas próximas ao local', 'Fechar', {
      duration: 2500,
    });
  }

  private getClusterMembers(feature: Feature): Feature[] | null {
    const members = feature.get('features');
    if (!Array.isArray(members)) {
      return null;
    }

    return members as Feature[];
  }
}
