import { CityContextService } from '../../../cities/city-context.service';
import { DestroyRef, Service, effect, inject, untracked } from '@angular/core';
import { MapService } from './map.service';
import { MapCameraService, MapFocusRequest } from './map-camera.service';
import { LayerType } from './layers/map-layer.service';
import { MapStateService } from './map-state.service';
import { FeatureCreationSource } from './map.types';
import { FeatureFactoryService } from './feature-factory.service';
import { MapSelectionDisplayService } from './map-selection-display.service';
import { MapDataLoaderService } from './map-data-loader.service';

@Service()
export class MapDisplayService {
  readonly cityContext = inject(CityContextService);
  private mapService = inject(MapService);
  private readonly camera = inject(MapCameraService);
  private mapState = inject(MapStateService);
  private featureFactory = inject(FeatureFactoryService);
  private readonly dataLoader = inject(MapDataLoaderService);
  private readonly selectionDisplayService = inject(MapSelectionDisplayService);

  /** Bind map rendering to this component's lifetime, batching synchronous mutations. */
  connect(destroyRef: DestroyRef): void {
    const filters = effect(() => {
      if (!this.mapService.getMap()) return;
      this.mapState.selectedRoutes();
      this.mapState.displayedRoutes();
      this.mapState.selectedStops();
      untracked(() => this.dataLoader.syncVectorTileFilters());
    }, { manualCleanup: true });
    const overlays = effect(() => {
      if (!this.mapService.getMap()) return;
      this.mapState.selectedStops();
      this.mapState.displayedStops();
      this.mapState.selectedBikeStations();
      this.mapState.bikeStations();
      untracked(() => this.updateMapDisplay());
    }, { manualCleanup: true });
    destroyRef.onDestroy(() => {
      filters.destroy();
      overlays.destroy();
    });
  }

  /** Selected points are overlays; routes and general stations belong to vector tiles. */
  updateMapDisplay(): void {
    this.selectionDisplayService.updateSelectedFeatures();
  }

  // Map navigation controls
  fitToAllFeatures(): void {
    this.mapService.fitToFeatures();
  }

  centerOnCity(): void {
    this.camera.showOverview(this.cityContext.center(), this.cityContext.city().map.zoom);
  }

  centerOn(coordinates: [number, number], zoom: number): void {
    this.camera.focusPoint(coordinates, zoom);
  }

  createFocusRequest(): MapFocusRequest {
    return this.camera.createFocusRequest();
  }

  fitToCoordinates(
    coordinates: readonly (readonly [number, number])[],
  ): void {
    this.mapService.fitToCoordinates(coordinates);
  }

  clearSelection(): void {
    this.camera.cancel();
    this.mapService.clearSelection();
  }

  showAddressLocation(lat: number, lon: number, name?: string): void {
    const layerService = this.mapService.getLayerService();
    layerService.removeFeaturesByCreationSource(
      LayerType.SELECTION,
      FeatureCreationSource.ADDRESS_SEARCH,
    );

    const feature = this.featureFactory.createAddressLocationFeature(
      lat,
      lon,
      name,
    );
    layerService.addFeature(LayerType.SELECTION, feature);
  }

  clearAddressLocation(): void {
    this.mapService
      .getLayerService()
      .removeFeaturesByCreationSourceFromAllLayers(
        FeatureCreationSource.ADDRESS_SEARCH,
      );
  }

  /**
   * Clear features created by a specific source from all layers
   */
  clearFeaturesBySource(source: FeatureCreationSource): void {
    const layerService = this.mapService.getLayerService();
    layerService.removeFeaturesByCreationSourceFromAllLayers(source);
  }
}
