import { CityContextService } from '../../../cities/city-context.service';
import {
  Component,
  OnDestroy,
  inject,
  effect,
  untracked,
  ChangeDetectionStrategy,
  DestroyRef,
  isDevMode,
  signal,
  computed,
  afterNextRender,
  Injector,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MatProgressBarModule } from '@angular/material/progress-bar';

import { MapService, MapOptions } from './map.service';
import { MapStateService } from './map-state.service';
import { MapDisplayService } from './map-display.service';
import { MapInteractionService } from './map-interaction.service';
import { MapSearchInteractionService } from './map-search-interaction.service';
import { LayerSettingsDialogComponent } from './layer-settings-dialog/layer-settings-dialog.component';
import { LoggerService, RailGraphqlService } from '@metro/shared/api';
import { RealtimeVehicleLayerService } from '../../realtime/realtime-vehicle-layer.service';
import { CptmVehicleLayerService } from '../../realtime/cptm-vehicle-layer.service';
import { BikeStationsService } from '../../geography/bike-stations.service';
import { VectorTileLayerType } from './vector-tiles/vector-tile-layer.service';
import { MapHeaderComponent } from './map-header/map-header.component';
import { MapStatusBarComponent } from './map-status-bar/map-status-bar.component';
import { MapPanelComponent } from './map-panel/map-panel.component';
import { MapPanelService } from './map-panel/map-panel.service';
import { MapSelectionsPanelComponent } from './map-selections-panel/map-selections-panel.component';
import { MapFooterComponent } from './map-footer/map-footer.component';
import { GeolocationService } from '@metro/shared/geolocation';
import { ActivatedRoute } from '@angular/router';
import { UserLocationLayerService } from './user-location-layer.service';
import { MapRouteStateService } from './map-route-state.service';

@Component({
  selector: 'app-map',
  imports: [
    MatProgressBarModule,
    MapHeaderComponent,
    MapStatusBarComponent,
    MapPanelComponent,
    MapSelectionsPanelComponent,
    MapFooterComponent,
  ],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent implements OnDestroy {
  readonly cityContext = inject(CityContextService);

  private readonly logger = inject(LoggerService);
  private mapService = inject(MapService);
  private mapState = inject(MapStateService);
  private displayService = inject(MapDisplayService);
  private interactionService = inject(MapInteractionService);
  private readonly searchInteraction = inject(MapSearchInteractionService);
  private readonly injector = inject(Injector);
  private readonly primaryControls = viewChild<MapHeaderComponent>('primaryControls');
  readonly searchControl = this.searchInteraction.searchControl;
  readonly searchOpen = this.searchInteraction.searchOpen;
  readonly searchError = this.searchInteraction.searchError;
  readonly mapPanel = inject(MapPanelService);
  readonly sheetHeight = signal(0);
  readonly sheetExpandedProgress = signal(0);
  readonly sheetDragging = signal(false);
  readonly layersOpen = computed(
    () => this.mapPanel.panel()?.component === LayerSettingsDialogComponent,
  );
  private vehicleLayerService = inject(RealtimeVehicleLayerService);
  private cptmVehicleLayerService = inject(CptmVehicleLayerService);
  private bikeStationsService = inject(BikeStationsService);
  private geolocationService = inject(GeolocationService);
  private userLocationLayer = inject(UserLocationLayerService);
  private route = inject(ActivatedRoute);
  private railService = inject(RailGraphqlService);
  private routeStateService = inject(MapRouteStateService);
  private readonly destroyRef = inject(DestroyRef);
  private destroyed = false;

  // Expose state for template access
  readonly isLoading = this.mapState.isLoading;
  readonly selectedRoutes = this.mapState.selectedRoutes;
  readonly selectedStops = this.mapState.selectedStops;
  readonly selectedBikeStations = this.mapState.selectedBikeStations;
  readonly displayedRoutes = this.mapState.displayedRoutes;
  readonly displayedStops = this.mapState.displayedStops;
  readonly hasSelections = this.mapState.hasSelections;
  readonly hasDisplayedData = this.mapState.hasDisplayedData;
  readonly totalDisplayedStops = this.mapState.totalDisplayedStops;
  readonly totalDisplayedRoutes = this.mapState.totalDisplayedRoutes;

  readonly userLocationVisible = this.userLocationLayer.isVisible;

  // Geolocation state
  readonly locationPermission = this.geolocationService.permission;
  readonly isLocationDisabled = this.geolocationService.isDisabled;
  readonly isRequestingLocation = this.geolocationService.isRequesting;

  // Map state
  readonly selectedFeature = this.mapService.selectedFeature;
  readonly features = this.mapService.features;
  readonly zoomLevel = this.mapService.zoomLevel;

  readonly isDevMode = isDevMode();

  constructor() {
    this.routeStateService.beginSession();
    afterNextRender(() => this.initializeMap());
    this.railService
      .fetchSpecialServices()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.applyCurrentRouteState();
      });
    this.displayService.connect(this.destroyRef);

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
      } else {
        this.interactionService.cancelPendingFeatureDetails();
      }
    });

    effect(() => {
      const stations = this.bikeStationsService.stations();
      this.mapState.setBikeStations(stations);
    });

    effect(() => {
      if (!this.mapService.getMap()) return;
      const favorites = this.routeStateService.favorites();
      this.bikeStationsService.stations();
      this.railService.specialServices();

      untracked(() => this.routeStateService.applyFavorites(favorites));
    });

    // Watch bike layer visibility and activate/disconnect service accordingly
    effect(() => {
      const vectorTileService = this.mapService.getVectorTileLayerService();
      const isBikeLayerVisible = vectorTileService.isLayerVisible(VectorTileLayerType.BIKE_STATIONS);

      untracked(() => {
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
      const revision = this.bikeStationsService.fetchedAt();
      untracked(() => {
        this.mapService.getVectorTileLayerService().refreshBikeStations(revision);
      });
    });

    effect(() => {
      this.bikeStationsService.refreshTick();
      const selectedStations = this.mapState.selectedBikeStations();
      untracked(() => {
        for (const stationId of selectedStations.keys()) {
          this.bikeStationsService.ensureStationDetails(stationId);
        }
      });
    });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyCurrentRouteState());
  }

  private applyCurrentRouteState(): void {
    if (this.destroyed || !this.mapService.getMap()) return;
    this.routeStateService.applyRouteState(this.route.snapshot.queryParamMap);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.searchInteraction.cancelSearch();
    this.interactionService.cancelPendingWork();
    this.mapPanel.clear();
    this.routeStateService.endSession();
    this.userLocationLayer.stopTracking();
    this.userLocationLayer.removeFromMap();
    this.mapService.destroy();
  }

  private initializeMap(): void {
    if (this.destroyed) return;
    const additionalLayers = [
      this.vehicleLayerService.getLayer(),
      this.cptmVehicleLayerService.getLayer(),
    ].filter((layer): layer is NonNullable<typeof layer> => layer !== null && layer !== undefined);
    const options: MapOptions = {
      center: this.cityContext.center(),
      zoom: this.cityContext.city().map.zoom,
      showControls: true,
      additionalLayers,
    };
    const map = this.mapService.initializeMap('ol-map-tab', options);
    this.userLocationLayer.addToMap(map);
    this.applyCurrentRouteState();
    const params = this.route.snapshot.queryParamMap;
    const focusRoute = params.get('focusRoute');
    if (focusRoute) {
      this.interactionService.focusRouteOnMap(focusRoute, params.has('railRoutes'));
    }
    this.routeStateService.markPersistenceReady();
  }

  // Map navigation controls
  fitToAllFeatures(): void {
    this.displayService.fitToAllFeatures();
  }

  centerOnCity(): void {
    this.displayService.centerOnCity();
  }

  toggleUserLocation(): void {
    this.mapPanel.compactOnMobile();
    void this.interactionService.toggleUserLocation();
  }

  // Get selection counts for UI display
  getSelectionCounts() {
    return this.mapState.getSelectionCounts();
  }

  // Delegate methods to interaction service
  openSearchModal(): void {
    void this.searchInteraction.openSearchModal(() => {
      afterNextRender(() => this.primaryControls()?.focusSearch(), {
        injector: this.injector,
      });
    });
  }

  openAddressSearch(): void {
    this.interactionService.openAddressSearch();
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

  addOppositeDirectionToSelection(routeId: string): void {
    void this.interactionService.addOppositeDirectionToSelection(routeId);
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
    if (this.layersOpen()) {
      this.mapPanel.close();
      return;
    }
    this.mapPanel.openComponent({
      component: LayerSettingsDialogComponent,
      data: undefined,
      title: 'Camadas do mapa',
      summary: '',
      initialSnap: 'expanded',
    });
  }
}
