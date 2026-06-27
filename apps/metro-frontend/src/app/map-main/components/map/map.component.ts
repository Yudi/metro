import {
  AfterViewInit,
  Component,
  OnDestroy,
  ViewChild,
  ElementRef,
  inject,
  effect,
  untracked,
  ChangeDetectionStrategy,
  isDevMode,
  signal,
} from '@angular/core';

import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { MapService, MapOptions } from '../../services/map.service';
import { MapStateService } from './map-state.service';
import { MapDataLoaderService } from './map-data-loader.service';
import { MapDisplayService } from './map-display.service';
import { MapInteractionService } from './map-interaction.service';
import { LayerSettingsDialogComponent } from './layer-settings-dialog/layer-settings-dialog.component';
import { FavoritesService, LoggerService, RailGraphqlService } from '@metro/shared/api';
import { RealtimeWebsocketService } from '../../services/realtime-websocket.service';
import { RealtimeVehicleLayerService } from '../../services/realtime-vehicle-layer.service';
import { CptmVehicleLayerService } from '../../services/cptm-vehicle-layer.service';
import { BikeStationsService } from '../../services/bike-stations.service';
import { LayerType } from '../../services/map-layer.service';
import { VectorTileLayerType } from '../../services/vector-tile-layer.service';
import { MapHeaderComponent } from './map-header/map-header.component';
import { MapStatusBarComponent } from './map-status-bar/map-status-bar.component';
import { MapFabMenuComponent } from './map-fab-menu/map-fab-menu.component';
import { MapSelectionsPanelComponent } from './map-selections-panel/map-selections-panel.component';
import { MapFooterComponent } from './map-footer/map-footer.component';
import { GeolocationService } from '@metro/shared/geolocation';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { UserLocationLayerService } from '../../services/user-location-layer.service';
import {
  FavoriteList,
  getRailLineByCode,
  getRailLineById,
  SAO_PAULO_CITY_CENTER_COORDINATES,
} from '@metro/shared/utils';
import {
  MAP_VIEW_STATE_RESTORE_PARAM,
  MapViewStateStorageService,
  SavedMapViewState,
} from '../../services/map-view-state-storage.service';

@Component({
  selector: 'app-map',
  imports: [
    MatDialogModule,
    MapHeaderComponent,
    MapStatusBarComponent,
    MapFabMenuComponent,
    MapSelectionsPanelComponent,
    MapFooterComponent,
  ],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('popupContainer', { static: true }) popupContainer!: ElementRef;

  private mapService = inject(MapService);
  private mapState = inject(MapStateService);
  private dataLoader = inject(MapDataLoaderService);
  private displayService = inject(MapDisplayService);
  private interactionService = inject(MapInteractionService);
  private dialog = inject(MatDialog);
  private logger = inject(LoggerService);
  private realtimeService = inject(RealtimeWebsocketService);
  private vehicleLayerService = inject(RealtimeVehicleLayerService);
  private cptmVehicleLayerService = inject(CptmVehicleLayerService);
  private bikeStationsService = inject(BikeStationsService);
  private geolocationService = inject(GeolocationService);
  private userLocationLayer = inject(UserLocationLayerService);
  private route = inject(ActivatedRoute);
  private favoritesService = inject(FavoritesService);
  private railService = inject(RailGraphqlService);
  private mapViewStateStorage = inject(MapViewStateStorageService);
  private readonly appliedFavoriteSelections = new Set<string>();
  private readonly persistenceReady = signal(false);
  private isApplyingSavedState = false;
  private appliedSavedStateForNavigation = false;
  private lastDefaultStateRequest = this.mapViewStateStorage.defaultStateRequests();

  // Expose state for template access
  readonly displayMode = this.mapState.displayMode;
  readonly isLoading = this.mapState.isLoading;
  readonly selectedRoutes = this.mapState.selectedRoutes;
  readonly selectedStops = this.mapState.selectedStops;
  readonly selectedBikeStations = this.mapState.selectedBikeStations;
  readonly displayedRoutes = this.mapState.displayedRoutes;
  readonly displayedStops = this.mapState.allDisplayedStops;
  readonly displayedShapes = this.mapState.displayedShapes;
  readonly nearbyCenter = this.mapState.nearbyCenter;
  readonly nearbyRadius = this.mapState.nearbyRadius;
  readonly hasSelections = this.mapState.hasSelections;
  readonly hasDisplayedData = this.mapState.hasDisplayedData;
  readonly totalDisplayedStops = this.mapState.totalDisplayedStops;
  readonly totalDisplayedRoutes = this.mapState.totalDisplayedRoutes;

  // Geolocation state
  readonly locationPermission = this.geolocationService.permission;
  readonly isLocationDisabled = this.geolocationService.isDisabled;
  readonly isRequestingLocation = this.geolocationService.isRequesting;

  // Map state
  readonly selectedFeature = this.mapService.selectedFeature;
  readonly features = this.mapService.features;
  readonly zoomLevel = this.mapService.zoomLevel;

  readonly isDevMode = isDevMode();

  /** Default view used when no explicit center is provided via query params */
  static readonly DEFAULT_CENTER: [number, number] = [
    ...SAO_PAULO_CITY_CENTER_COORDINATES,
  ];
  static readonly DEFAULT_ZOOM = 11;

  constructor() {
    this.railService.fetchSpecialServices().subscribe(() => {
      this.applyRouteState(this.route.snapshot.queryParamMap);
    });
    // Set up display update callbacks
    this.mapState.setUpdateDisplayCallback(() =>
      this.displayService.updateMapDisplay(),
    );
    this.dataLoader.setUpdateDisplayCallback(() =>
      this.displayService.updateMapDisplay(),
    );

    // Handle feature selection
    effect(() => {
      const feature = this.selectedFeature();
      if (feature) {
        // Use untracked to prevent signals read inside handleFeatureSelection
        // from becoming dependencies of this effect. This prevents the dialog
        // from reopening when bike station data refreshes via websocket.
        untracked(() =>
          this.interactionService.handleFeatureSelection(feature),
        );
      }
    });

    // Watch for route selections and subscribe to real-time data
    this.setupRealtimeSubscriptions();

    effect(() => {
      const stations = this.bikeStationsService.stations();
      this.mapState.setBikeStations(stations);
    });

    effect(() => {
      const favorites = this.favoritesService.favorites();
      this.bikeStationsService.stations();
      this.railService.specialServices();

      untracked(() => {
        this.autoSelectFavorites(favorites);
      });
    });

    // Watch bike layer visibility and activate/disconnect service accordingly
    effect(() => {
      const layerService = this.mapService.getLayerService();
      const vectorTileService = this.mapService.getVectorTileLayerService();
      const isBikeLayerVisible = layerService.isLayerVisible(LayerType.BIKE);

      untracked(() => {
        vectorTileService.setLayerVisibility(
          VectorTileLayerType.BIKE_STATIONS,
          isBikeLayerVisible,
        );

        if (isBikeLayerVisible) {
          this.bikeStationsService.activate().catch((error) => {
            this.logger.error(
              'Failed to activate bike stations service',
              error,
            );
          });
        } else {
          this.bikeStationsService.disconnect();
        }
      });
    });

    effect(() => {
      this.bikeStationsService.refreshTick();
      untracked(() => {
        this.mapService
          .getVectorTileLayerService()
          .refreshLayer(VectorTileLayerType.BIKE_STATIONS);
      });
    });

    this.setupDefaultStateRequestHandler();
    this.setupMapStatePersistence();

    // Apply query params present on initial navigation (e.g. ?bike=true)
    try {
      this.applyRouteState(this.route.snapshot.queryParamMap);
    } catch (err) {
      this.logger.error('Failed to apply initial query params to map', err);
    }

    // React to future changes to query params while on the page
    this.route.queryParamMap.subscribe((pm) => this.applyRouteState(pm));
  }

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  ngOnDestroy(): void {
    this.userLocationLayer.stopTracking();
    this.userLocationLayer.removeFromMap();
    this.mapService.destroy();
  }

  private initializeMap(): void {
    const vehicleLayer = this.vehicleLayerService.getLayer();
    const cptmVehicleLayer = this.cptmVehicleLayerService.getLayer();

    // Build list of additional layers
    const additionalLayers: import('ol/layer/Base').default[] = [];
    if (vehicleLayer) additionalLayers.push(vehicleLayer);
    if (cptmVehicleLayer) additionalLayers.push(cptmVehicleLayer);

    const options: MapOptions = {
      center: MapComponent.DEFAULT_CENTER, // São Paulo coordinates
      zoom: MapComponent.DEFAULT_ZOOM,
      showControls: true,
      additionalLayers,
    };

    // Initialize map with vehicle layer included
    setTimeout(() => {
      this.mapService.initializeMap('ol-map-tab', options);

      // Re-apply query params now that the map exists (centers / zooms)
      try {
        this.applyRouteState(this.route.snapshot.queryParamMap);
      } catch (err) {
        this.logger.error('Failed to apply query params after map init', err);
      }

      // Add user location layer to map
      const map = this.mapService.getMap();
      if (map) {
        this.userLocationLayer.addToMap(map);
      }

      // Verify vehicle layer was added
      if (vehicleLayer) {
        const map = this.mapService.getMap();
        if (map) {
          const layers = map.getLayers().getArray();
          const found = layers.includes(vehicleLayer);
          this.logger.info('Vehicle layer integration check:', {
            vehicleLayerFound: found,
            totalLayers: layers.length,
            vehicleLayerZIndex: vehicleLayer.getZIndex(),
            vehicleLayerVisible: vehicleLayer.getVisible(),
          });
        }
      }

      // Load initial data after map is ready
      setTimeout(() => {
        this.loadInitialData();
        this.persistenceReady.set(true);
      }, 100);
    }, 1000);
  }

  private loadInitialData(): void {
    // Note: Subway stations and routes are now rendered via Vector Tiles (MVT)
    // No need to load them via GraphQL
    this.logger.info(
      'Map initialization complete - subway data served via Vector Tiles',
    );
  }

  private setupDefaultStateRequestHandler(): void {
    effect(() => {
      const requestCount = this.mapViewStateStorage.defaultStateRequests();
      if (requestCount === this.lastDefaultStateRequest) {
        return;
      }

      this.lastDefaultStateRequest = requestCount;
      untracked(() => {
        this.applyDefaultMapState();
      });
    });
  }

  private setupMapStatePersistence(): void {
    effect((onCleanup) => {
      const state = this.captureMapViewState();
      if (!this.persistenceReady() || this.isApplyingSavedState || !state) {
        return;
      }

      const timeoutId = setTimeout(() => {
        this.mapViewStateStorage.saveLastState(state);
      }, 350);

      onCleanup(() => clearTimeout(timeoutId));
    });
  }

  private captureMapViewState(): SavedMapViewState | null {
    const center = this.mapService.center();
    const zoom = this.mapService.zoomLevel();
    const layerService = this.mapService.getLayerService();
    const vectorTileService = this.mapService.getVectorTileLayerService();

    if (!center || zoom === null) {
      return null;
    }

    return {
      center,
      zoom,
      displayMode: this.mapState.displayMode(),
      nearbyCenter: this.mapState.nearbyCenter(),
      nearbyRadius: this.mapState.nearbyRadius(),
      layers: {
        [LayerType.BIKE]: layerService.isLayerVisible(LayerType.BIKE),
      },
      vectorLayers: {
        [VectorTileLayerType.RAIL_STATIONS]:
          vectorTileService.isLayerVisible(VectorTileLayerType.RAIL_STATIONS),
        [VectorTileLayerType.RAIL_ROUTES]: vectorTileService.isLayerVisible(
          VectorTileLayerType.RAIL_ROUTES,
        ),
      },
      selections: {
        routeIds: Array.from(this.mapState.selectedRoutes().keys()),
        stopIds: Array.from(this.mapState.selectedStops().keys()),
        bikeStationIds: Array.from(this.mapState.selectedBikeStations().keys()),
      },
    };
  }

  private applyRouteState(params: ParamMap | Record<string, unknown>): void {
    if (this.shouldRestoreSavedState(params)) {
      void this.restoreLastMapState();
      return;
    }

    this.applyQueryParams(params);
  }

  private shouldRestoreSavedState(
    params: ParamMap | Record<string, unknown>,
  ): boolean {
    const value = this.getParamValue(params, MAP_VIEW_STATE_RESTORE_PARAM);
    return value === '1' || value === 'true';
  }

  private async restoreLastMapState(): Promise<void> {
    if (!this.mapService.getMap()) {
      return;
    }

    if (this.appliedSavedStateForNavigation) {
      return;
    }

    this.appliedSavedStateForNavigation = true;
    const savedState = await this.mapViewStateStorage.readLastState();
    if (!savedState) {
      this.applyDefaultMapState();
      return;
    }

    await this.applySavedMapState(savedState);
  }

  private async applySavedMapState(state: SavedMapViewState): Promise<void> {
    this.isApplyingSavedState = true;

    try {
      this.interactionService.clearAllSelections(false);

      const layerService = this.mapService.getLayerService();
      const vectorTileService = this.mapService.getVectorTileLayerService();

      layerService.setLayerVisibility(
        LayerType.BIKE,
        state.layers[LayerType.BIKE] ?? false,
      );
      vectorTileService.setLayerVisibility(
        VectorTileLayerType.RAIL_STATIONS,
        state.vectorLayers[VectorTileLayerType.RAIL_STATIONS] ?? true,
      );
      vectorTileService.setLayerVisibility(
        VectorTileLayerType.RAIL_ROUTES,
        state.vectorLayers[VectorTileLayerType.RAIL_ROUTES] ?? false,
      );

      if (state.layers[LayerType.BIKE]) {
        await this.bikeStationsService.activate();
        this.mapState.setBikeStations(this.bikeStationsService.stations());
      }

      for (const routeId of state.selections.routeIds) {
        await this.restoreRouteSelection(routeId);
      }

      for (const stopId of state.selections.stopIds) {
        await this.interactionService.addStopToSelection(stopId, false);
      }

      for (const stationId of state.selections.bikeStationIds) {
        this.interactionService.addBikeStationToSelection(stationId, false);
      }

      this.mapState.nearbyRadius.set(state.nearbyRadius);
      this.mapState.nearbyCenter.set(state.nearbyCenter);
      this.mapState.displayMode.set(state.displayMode);

      if (state.displayMode === 'nearby' && state.nearbyCenter) {
        this.dataLoader.loadNearbyStops(
          state.nearbyCenter.lat,
          state.nearbyCenter.lon,
        );
      } else {
        this.dataLoader.syncVectorTileFilters();
      }

      this.mapService.centerOn(state.center, state.zoom);
      this.displayService.updateMapDisplay();
    } catch (error) {
      this.logger.error('Failed to restore saved map state', error);
    } finally {
      this.isApplyingSavedState = false;
    }

  }

  private async restoreRouteSelection(routeId: string): Promise<void> {
    const specialService = this.railService
      .specialServices()
      .find((service) => service.code === routeId);
    if (specialService) {
      this.interactionService.addSpecialRailLineToSelection(
        specialService,
        false,
      );
      return;
    }

    if (getRailLineById(routeId)) {
      this.interactionService.addRailLineToSelection(routeId, false);
      return;
    }

    await this.interactionService.addRouteToSelection(routeId, false);
  }

  private applyDefaultMapState(): void {
    this.isApplyingSavedState = true;

    try {
      this.interactionService.clearAllSelections(false);
      this.mapState.displayMode.set('selected');
      this.mapState.nearbyCenter.set(null);
      this.mapState.nearbyRadius.set(1000);
      this.displayService.clearExploreLocation();
      this.displayService.clearNearbyFeatures();
      this.mapService
        .getLayerService()
        .setLayerVisibility(LayerType.BIKE, false);
      this.mapService
        .getVectorTileLayerService()
        .setLayerVisibility(VectorTileLayerType.RAIL_STATIONS, true);
      this.mapService
        .getVectorTileLayerService()
        .setLayerVisibility(VectorTileLayerType.RAIL_ROUTES, false);
      this.mapService.centerOn(
        MapComponent.DEFAULT_CENTER,
        MapComponent.DEFAULT_ZOOM,
      );
      this.dataLoader.syncVectorTileFilters();
      this.displayService.updateMapDisplay();
    } finally {
      this.isApplyingSavedState = false;
    }

    const state = this.captureMapViewState();
    if (this.persistenceReady() && state) {
      this.mapViewStateStorage.saveLastState(state);
    }
  }

  private getParamValue(
    params: ParamMap | Record<string, unknown>,
    key: string,
  ): string | null {
    if (
      !!params &&
      typeof (params as ParamMap).has === 'function' &&
      typeof (params as ParamMap).get === 'function'
    ) {
      return (params as ParamMap).get(key);
    }

    const value = (params as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }

  private autoSelectFavorites(favorites: FavoriteList): void {
    for (const routeId of favorites.busRoute) {
      this.applyFavoriteSelection(`busRoute:${routeId}`, () => {
        void this.interactionService.addRouteToSelection(routeId, false);
      });
    }

    for (const stationId of favorites.bikeStation) {
      this.applyFavoriteSelection(`bikeStation:${stationId}`, () => {
        this.mapService
          .getLayerService()
          .setLayerVisibility(LayerType.BIKE, true);
        this.interactionService.addBikeStationToSelection(stationId, false);
      });
    }

    for (const lineCode of favorites.railLine) {
      const specialService = this.railService
        .specialServices()
        .find((service) => service.code === lineCode);
      if (specialService) {
        this.applyFavoriteSelection(`railLine:${lineCode}`, () => {
          this.interactionService.addSpecialRailLineToSelection(
            specialService,
            false,
          );
        });
        continue;
      }

      const lineId = this.getRailFavoriteLineId(lineCode);
      if (!lineId) {
        continue;
      }

      this.applyFavoriteSelection(`railLine:${lineId}`, () => {
        this.interactionService.addRailLineToSelection(lineId, false);
      });
    }

    if (favorites.railStation.length > 0) {
      this.mapService
        .getVectorTileLayerService()
        .setLayerVisibility(VectorTileLayerType.RAIL_STATIONS, true);
    }
  }

  private applyFavoriteSelection(key: string, select: () => void): void {
    if (this.appliedFavoriteSelections.has(key)) {
      return;
    }

    this.appliedFavoriteSelections.add(key);
    select();
  }

  private getRailFavoriteLineId(value: string): string | null {
    const numericCode = Number(value);
    if (Number.isFinite(numericCode)) {
      return getRailLineByCode(numericCode)?.lineId ?? null;
    }

    return value;
  }

  /**
   * Apply query parameters to toggle specific map layers.
   * Supported params:
   *  - bike=true|1|yes
   *  - busStops=true|1|yes
   *  - busRoutes=true|1|yes
   *  - subwayStations=true|1|yes
   *  - subwayRoutes=true|1|yes
   *
   * Only params that are present are applied (no-op otherwise).
   */
  private applyQueryParams(params: ParamMap | Record<string, unknown>): void {
    /**
     * Type-guard to distinguish ParamMap from a plain record.
     * Ensures TS understands that `has`/`get` exist and are callable.
     */
    const isParamMap = (p: ParamMap | Record<string, unknown>): p is ParamMap =>
      !!p &&
      typeof (p as ParamMap).has === 'function' &&
      typeof (p as ParamMap).get === 'function';

    const paramHas = (k: string) =>
      isParamMap(params)
        ? params.has(k)
        : Object.prototype.hasOwnProperty.call(params, k);

    const paramGet = (k: string): string | null =>
      isParamMap(params)
        ? (params.get(k) as string | null)
        : ((params[k] as string | null) ?? null);

    const parseBoolean = (v: string | null) => {
      if (v === null) return null;
      const s = String(v).toLowerCase().trim();
      return ['1', 'true', 'yes', 'on'].includes(s);
    };

    const layerSvc = this.mapService.getLayerService();
    const vtSvc = this.mapService.getVectorTileLayerService();

    const specialLineCode = paramGet('railLine');
    if (specialLineCode) {
      const specialService = this.railService
        .specialServices()
        .find((service) => service.code === specialLineCode);
      if (specialService) {
        this.applyFavoriteSelection(`queryRailLine:${specialLineCode}`, () => {
          this.interactionService.addSpecialRailLineToSelection(
            specialService,
            false,
          );
        });
      }
    }

    const mappings: Array<{
      param: string;
      kind: 'layer' | 'vector' | 'feature';
      id?: string;
    }> = [
      { param: 'bike', kind: 'layer', id: LayerType.BIKE },
      {
        param: 'subwayStations',
        kind: 'vector',
        id: VectorTileLayerType.RAIL_STATIONS,
      },
      {
        param: 'subwayRoutes',
        kind: 'vector',
        id: VectorTileLayerType.RAIL_ROUTES,
      },
      {
        param: 'busStops',
        kind: 'feature',
      },
      {
        param: 'busRoutes',
        kind: 'feature',
      },
      {
        param: 'railStations',
        kind: 'feature',
      },
    ];

    for (const m of mappings) {
      // only apply when param is present
      if (!paramHas(m.param)) {
        continue;
      }
      const raw = paramGet(m.param);
      const enabled = parseBoolean(raw);

      if (enabled === null && m.kind !== 'feature') {
        continue;
      }

      switch (m.kind) {
        case 'feature': {
          const parseIds = (key: string) =>
            (paramGet(key) ?? '')
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean);

          const routes = parseIds('busRoutes');
          const stops = parseIds('busStops');
          const stations = parseIds('railStations');

          routes.forEach((r) => this.addRouteToSelection(r, false));
          stops.forEach((s) => this.interactionService.addStopToSelection(s));
          stations.forEach((s) =>
            this.interactionService.addStopToSelection(s),
          );

          break;
        }
        case 'vector':
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          vtSvc.setLayerVisibility(m.id as VectorTileLayerType, enabled!);
          this.logger.debug('Applied query param layer (vector)', {
            param: m.param,
            enabled,
          });
          break;
        case 'layer':
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          layerSvc.setLayerVisibility(m.id as LayerType, enabled!);
          this.logger.debug('Applied query param layer', {
            param: m.param,
            enabled,
          });
      }
    }

    // --- center / zoom handling ---
    const getNum = (keys: string[]) => {
      for (const k of keys) {
        if (paramHas(k)) {
          const raw = paramGet(k);
          if (raw == null) return null;
          const n = Number(raw);
          if (!Number.isFinite(n)) return null;
          return n;
        }
      }
      return null;
    };

    const lat = getNum(['lat', 'latitude']);
    const lon = getNum(['lon', 'lng', 'longitude']);
    const zoom = getNum(['zoom', 'z']);

    const isValidLat = (v: number | null) => v !== null && v >= -90 && v <= 90;
    const isValidLon = (v: number | null) =>
      v !== null && v >= -180 && v <= 180;
    const isValidZoom = (v: number | null) => v !== null && v >= 0 && v <= 28;

    if (isValidLat(lat) && isValidLon(lon)) {
      // If no zoom is provided, keep current zoom level
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const useZoom = isValidZoom(zoom) ? zoom! : undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.mapService.centerOn([lon!, lat!], useZoom);
        this.logger.debug('Applied query param center/zoom', {
          lat,
          lon,
          zoom: useZoom,
        });
      } catch (err) {
        this.logger.error('Failed to apply center/zoom from query params', err);
      }
    } else if (isValidZoom(zoom) && (lat === null || lon === null)) {
      // If only zoom is provided, apply it with default center
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.mapService.centerOn(MapComponent.DEFAULT_CENTER, zoom!);
        this.logger.debug('Applied query param zoom with default center', {
          zoom,
        });
      } catch (err) {
        this.logger.error('Failed to apply zoom from query params', err);
      }
    } else if (lat !== null || lon !== null || zoom !== null) {
      this.logger.warn('Ignoring invalid center/zoom query params', {
        lat,
        lon,
        zoom,
      });
    }
  }

  private setupRealtimeSubscriptions(): void {
    // Real-time subscriptions are now handled by MapInteractionService
    // when routes are added/removed from selection.
    // This effect is kept for backwards compatibility with routes
    // that were loaded through other means (e.g., from stop selection).
    effect(() => {
      const routes = this.displayedRoutes();
      const derivedFromStops = this.mapState.routesDerivedFromStops();
      const selectedRouteIds = this.mapState.selectedRouteIds();

      // Subscribe to real-time data only for routes that are:
      // 1. Explicitly selected (handled in interaction service, but re-checking here for robustness)
      // 2. Not derived from stop selections
      // 3. Not subway/metro routes
      for (const route of routes) {
        // Skip routes that were derived from stop selections
        if (derivedFromStops.has(route.routeId)) {
          continue;
        }

        // Only subscribe if this route is explicitly selected
        if (!selectedRouteIds.has(route.routeId)) {
          continue;
        }

        if (
          route.shortName &&
          !route.shortName.startsWith('METRÔ') &&
          !route.shortName.startsWith('CPTM')
        ) {
          this.realtimeService.subscribeToRoute(route.shortName);
        }
      }
    });
  }

  // Map navigation controls
  fitToAllFeatures(): void {
    this.displayService.fitToAllFeatures();
  }

  centerOnSaoPaulo(): void {
    this.displayService.centerOnSaoPaulo();
  }

  async centerOnUserLocation(): Promise<void> {
    await this.userLocationLayer.centerOnUser();
  }

  // Handle display mode changes from header
  onDisplayModeChange(newMode: 'selected' | 'nearby'): void {
    const currentMode = this.displayMode();
    if (newMode === currentMode) {
      return;
    }

    if (newMode === 'nearby') {
      // Switching to nearby mode - this will set the mode and trigger geolocation
      this.interactionService.activateNearbyMode();
    } else {
      // Switching to selected mode - this will clear nearby features
      this.interactionService.deactivateNearbyMode();
    }
  }

  // Get selection counts for UI display
  getSelectionCounts() {
    return this.mapState.getSelectionCounts();
  }

  // Delegate methods to interaction service
  openSearchModal(): void {
    this.interactionService.openSearchModal();
  }

  openExploreModal(): void {
    this.interactionService.openExploreModal();
  }

  addRouteToSelection(routeId: string, shouldDisplaySnackbar: boolean): void {
    this.interactionService.addRouteToSelection(routeId, shouldDisplaySnackbar);
  }

  addStopToSelection(stopId: string): void {
    this.interactionService.addStopToSelection(stopId);
  }

  removeRouteFromSelection(routeId: string): void {
    this.interactionService.removeRouteFromSelection(routeId);
  }

  removeStopFromSelection(stopId: string): void {
    this.interactionService.removeStopFromSelection(stopId);
  }

  removeBikeStationFromSelection(stationId: string): void {
    this.interactionService.removeBikeStationFromSelection(stationId);
  }

  clearAllSelections(): void {
    this.interactionService.clearAllSelections();
  }

  onStopClicked(stopId: string): void {
    this.interactionService.showRoutesForStop(stopId);
  }

  onFeatureInfoClick(): void {
    const feature = this.selectedFeature();
    if (feature) {
      this.interactionService.handleFeatureSelection(feature);
    }
  }

  // Open layer settings dialog
  openLayerSettings(): void {
    this.dialog.open(LayerSettingsDialogComponent, {
      width: '400px',
      maxWidth: '90vw',
      autoFocus: false,
      restoreFocus: true,
    });
  }
}
