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
  DestroyRef,
  isDevMode,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { MapService, MapOptions } from './map.service';
import { MapStateService } from './map-state.service';
import { MapDataLoaderService } from './map-data-loader.service';
import { MapDisplayService } from './map-display.service';
import { MapInteractionService } from './map-interaction.service';
import { LayerSettingsDialogComponent } from './layer-settings-dialog/layer-settings-dialog.component';
import { LoggerService, RailGraphqlService } from '@metro/shared/api';
import { RealtimeVehicleLayerService } from '../../realtime/realtime-vehicle-layer.service';
import { CptmVehicleLayerService } from '../../realtime/cptm-vehicle-layer.service';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { LayerType } from './layers/map-layer.service';
import { VectorTileLayerType } from './vector-tiles/vector-tile-layer.service';
import { MapHeaderComponent } from './map-header/map-header.component';
import { MapStatusBarComponent } from './map-status-bar/map-status-bar.component';
import { MapFabMenuComponent } from './map-fab-menu/map-fab-menu.component';
import { MapSelectionsPanelComponent } from './map-selections-panel/map-selections-panel.component';
import { MapFooterComponent } from './map-footer/map-footer.component';
import { GeolocationService } from '@metro/shared/geolocation';
import { ActivatedRoute } from '@angular/router';
import { UserLocationLayerService } from './user-location-layer.service';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  MapRouteStateService,
} from './map-route-state.service';

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
  private vehicleLayerService = inject(RealtimeVehicleLayerService);
  private cptmVehicleLayerService = inject(CptmVehicleLayerService);
  private bikeStationsService = inject(BikeStationsService);
  private geolocationService = inject(GeolocationService);
  private userLocationLayer = inject(UserLocationLayerService);
  private route = inject(ActivatedRoute);
  private railService = inject(RailGraphqlService);
  private routeStateService = inject(MapRouteStateService);
  private readonly destroyRef = inject(DestroyRef);
  private initializationTimer: ReturnType<typeof setTimeout> | null = null;
  private initialDataTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

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
  static readonly DEFAULT_CENTER: [number, number] = [...DEFAULT_MAP_CENTER];
  static readonly DEFAULT_ZOOM = DEFAULT_MAP_ZOOM;

  constructor() {
    this.railService
      .fetchSpecialServices()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.routeStateService.applyRouteState(
          this.route.snapshot.queryParamMap,
        );
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

    effect(() => {
      const stations = this.bikeStationsService.stations();
      this.mapState.setBikeStations(stations);
    });

    effect(() => {
      const favorites = this.routeStateService.favorites();
      this.bikeStationsService.stations();
      this.railService.specialServices();

      untracked(() => this.routeStateService.applyFavorites(favorites));
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

    // Apply query params present on initial navigation (e.g. ?bike=true)
    try {
      this.routeStateService.applyRouteState(this.route.snapshot.queryParamMap);
    } catch (err) {
      this.logger.error('Failed to apply initial query params to map', err);
    }

    // React to future changes to query params while on the page
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((pm) => this.routeStateService.applyRouteState(pm));
  }

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.initializationTimer) {
      clearTimeout(this.initializationTimer);
      this.initializationTimer = null;
    }
    if (this.initialDataTimer) {
      clearTimeout(this.initialDataTimer);
      this.initialDataTimer = null;
    }
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
    this.initializationTimer = setTimeout(() => {
      this.initializationTimer = null;
      if (this.destroyed) {
        return;
      }
      this.mapService.initializeMap('ol-map-tab', options);

      // Re-apply query params now that the map exists (centers / zooms)
      try {
        this.routeStateService.applyRouteState(
          this.route.snapshot.queryParamMap,
        );
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
      this.initialDataTimer = setTimeout(() => {
        this.initialDataTimer = null;
        if (this.destroyed) {
          return;
        }
        this.loadInitialData();
        this.routeStateService.markPersistenceReady();
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
