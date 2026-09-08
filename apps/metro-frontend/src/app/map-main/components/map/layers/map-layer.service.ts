import { Service, signal, computed, inject } from '@angular/core';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import ClusterSource from 'ol/source/Cluster';
import { Feature } from 'ol';
import { Map as OLMap } from 'ol';
import { FeatureCreationSource } from '../map.types';
import { LoggerService } from '@metro/shared/api';
import { MapLayerStyleService } from './map-layer-style.service';
import { LayerType, type LayerConfig } from './map-layer.types';
import { createMapLayerConfigs } from './map-layer.config';

export { LayerType } from './map-layer.types';
export type { LayerConfig } from './map-layer.types';

/**
 * Service to manage multiple OpenLayers vector layers with toggle functionality
 * Ensures data preservation when layers are hidden/shown
 */
@Service()
export class MapLayerService {
  private logger = inject(LoggerService);
  private readonly styleService = inject(MapLayerStyleService);

  private readonly clusterSources = new Map<LayerType, ClusterSource>();

  // Layer visibility state
  // Note: SUBWAY_STATIONS and SUBWAY_ROUTES are now managed by VectorTileLayerService
  private layerVisibility = signal<Map<LayerType, boolean>>(
    new Map<LayerType, boolean>([
      [LayerType.SELECTION, true], // Always visible, not toggleable
      [LayerType.BUS_ROUTES, true], // Visible by default
      [LayerType.BUS_STOPS, true], // Visible by default
      [LayerType.BIKE, false], // Hidden by default
    ]),
  );

  // Vector sources for each layer (data is preserved here)
  // Note: SUBWAY_STATIONS and SUBWAY_ROUTES are now managed by VectorTileLayerService
  private sources = new Map<LayerType, VectorSource>([
    [LayerType.SELECTION, new VectorSource()],
    [LayerType.BUS_ROUTES, new VectorSource()],
    [LayerType.BUS_STOPS, new VectorSource()],
    [LayerType.BIKE, new VectorSource()],
  ]);

  // Vector layers
  private layers = new Map<LayerType, VectorLayer<VectorSource>>();

  // Current zoom level for styling
  private currentZoomLevel = signal<number | null>(null);

  readonly layerConfigs = signal<LayerConfig[]>(createMapLayerConfigs());

  // Computed toggleable layers for UI
  readonly toggleableLayers = computed(() =>
    this.layerConfigs().filter((config) => config.toggleable),
  );

  constructor() {
    this.initializeLayers();
  }

  /**
   * Initialize all vector layers with their styles
   * Note: SUBWAY_STATIONS and SUBWAY_ROUTES are now managed by VectorTileLayerService
   */
  private initializeLayers(): void {
    // Selection layer - highlighted/selected features (below stops so stops are visible)
    this.layers.set(
      LayerType.SELECTION,
      new VectorLayer({
        source: this.sources.get(LayerType.SELECTION),
        style: (feature) => this.styleService.createSelectionStyle(feature),
        zIndex: 25, // Below stops so stops appear on top of selected routes
      }),
    );

    // Bus routes layer (bus route shapes only - no stops)
    this.layers.set(
      LayerType.BUS_ROUTES,
      new VectorLayer({
        source: this.sources.get(LayerType.BUS_ROUTES),
        style: (feature) => this.styleService.createBusRouteStyle(feature),
        zIndex: 20, // Low - route shapes only
      }),
    );

    // Bus stops layer (separate from route shapes for proper z-ordering)
    this.layers.set(
      LayerType.BUS_STOPS,
      new VectorLayer({
        source: this.sources.get(LayerType.BUS_STOPS),
        style: () => this.styleService.createBusStopStyle(),
        zIndex: 45, // Above bike stations, below subway stations
      }),
    );

    const bikeSource = this.sources.get(LayerType.BIKE);
    if (bikeSource) {
      const bikeClusterSource = new ClusterSource({
        distance: this.styleService.getClusterDistanceForZoom(
          this.currentZoomLevel(),
        ),
        source: bikeSource,
      });
      this.clusterSources.set(LayerType.BIKE, bikeClusterSource);

      this.layers.set(
        LayerType.BIKE,
        new VectorLayer({
          source: bikeClusterSource,
          style: (feature) => this.styleService.createBikeStyle(feature),
          zIndex: 30, // Above route shapes, below stops
          visible: false,
        }),
      );
    }
  }

  /**
   * Add all layers to the map
   */
  addLayersToMap(map: OLMap): void {
    this.layers.forEach((layer) => {
      map.addLayer(layer);
    });
  }

  /**
   * Get a specific layer
   */
  getLayer(layerType: LayerType): VectorLayer<VectorSource> | undefined {
    return this.layers.get(layerType);
  }

  /**
   * Get a specific source
   */
  getSource(layerType: LayerType): VectorSource | undefined {
    return this.sources.get(layerType);
  }

  /**
   * Toggle layer visibility
   * Handles layer dependencies (e.g., subway routes require subway stations)
   */
  toggleLayer(layerType: LayerType): void {
    const layer = this.layers.get(layerType);
    if (!layer) return;

    const config = this.layerConfigs().find((c) => c.id === layerType);
    if (!config || !config.toggleable) return;

    const newVisibility = !layer.getVisible();

    // Handle layer dependencies
    if (layerType === LayerType.RAIL_ROUTES && newVisibility) {
      // When enabling rail routes, also enable rail stations
      this.setLayerVisibility(LayerType.RAIL_STATIONS, true);
    } else if (layerType === LayerType.RAIL_STATIONS && !newVisibility) {
      // When disabling rail stations, also disable rail routes
      this.setLayerVisibility(LayerType.RAIL_ROUTES, false);
    }

    // Set the toggled layer visibility
    layer.setVisible(newVisibility);

    // Update visibility state
    const newMap = new Map(this.layerVisibility());
    newMap.set(layerType, newVisibility);
    this.layerVisibility.set(newMap);

    // Update config
    config.visible = newVisibility;
    this.layerConfigs.set([...this.layerConfigs()]);
  }

  /**
   * Set layer visibility explicitly
   */
  setLayerVisibility(layerType: LayerType, visible: boolean): void {
    const layer = this.layers.get(layerType);
    if (!layer) return;

    layer.setVisible(visible);

    // Update visibility state
    const newMap = new Map(this.layerVisibility());
    newMap.set(layerType, visible);
    this.layerVisibility.set(newMap);

    // Update config
    const config = this.layerConfigs().find((c) => c.id === layerType);
    if (config) {
      config.visible = visible;
      this.layerConfigs.set([...this.layerConfigs()]);
    }
  }

  /**
   * Get layer visibility status
   */
  isLayerVisible(layerType: LayerType): boolean {
    return this.layerVisibility().get(layerType) ?? false;
  }

  /**
   * Add feature to a specific layer
   */
  addFeature(layerType: LayerType, feature: Feature): void {
    const source = this.sources.get(layerType);
    if (source) {
      source.addFeature(feature);
    }
  }

  /**
   * Remove feature from a specific layer
   */
  removeFeature(layerType: LayerType, feature: Feature): void {
    const source = this.sources.get(layerType);
    if (source) {
      source.removeFeature(feature);
    }
  }

  /**
   * Clear all features from a specific layer
   */
  clearLayer(layerType: LayerType): void {
    const source = this.sources.get(layerType);
    if (source) {
      const beforeCount = source.getFeatures().length;
      source.clear();
      this.logger.debug('Cleared layer', {
        layerType,
        featuresRemoved: beforeCount,
      });
    }
  }

  /**
   * Clear all features from all layers
   */
  clearAllLayers(): void {
    this.sources.forEach((source) => source.clear());
  }

  /**
   * Get all features from a specific layer
   */
  getFeaturesFromLayer(layerType: LayerType): Feature[] {
    const source = this.sources.get(layerType);
    return source ? source.getFeatures() : [];
  }

  /**
   * Move feature from one layer to another (e.g., from subway routes to selection)
   */
  moveFeature(
    feature: Feature,
    fromLayer: LayerType,
    toLayer: LayerType,
  ): void {
    this.removeFeature(fromLayer, feature);
    this.addFeature(toLayer, feature);
  }

  /**
   * Find which layers contain a specific feature
   * Useful for debugging
   */
  findFeatureLayer(feature: Feature): LayerType[] {
    const foundLayers: LayerType[] = [];
    const featureId = feature.getId();

    this.sources.forEach((source, layerType) => {
      const features = source.getFeatures();
      const found = features.find(
        (f) =>
          f.getId() === featureId ||
          f === feature ||
          (f.getProperties()['id'] === feature.getProperties()['id'] &&
            feature.getProperties()['id']),
      );

      if (found) {
        foundLayers.push(layerType);
      }
    });

    return foundLayers;
  }

  /**
   * Debug: Print all layer contents
   */
  debugPrintLayerContents(): void {
    this.logger.debug('Current layer contents:');
    this.sources.forEach((source, layerType) => {
      const features = source.getFeatures();
      const visible = this.isLayerVisible(layerType);
      this.logger.debug(`Layer ${layerType}`, {
        visible,
        featureCount: features.length,
        features: features.map((f) => ({
          id: f.getId(),
          properties: f.getProperties(),
        })),
      });
    });
  }

  /**
   * Get total feature count across all layers
   */
  getTotalFeatureCount(): { [key: string]: number } {
    const counts: { [key: string]: number } = {};
    this.sources.forEach((source, layerType) => {
      counts[layerType] = source.getFeatures().length;
    });
    return counts;
  }

  /**
   * Get all features from all layers
   */
  getAllFeatures(): Feature[] {
    const allFeatures: Feature[] = [];
    this.sources.forEach((source) => {
      allFeatures.push(...source.getFeatures());
    });
    return allFeatures;
  }

  /**
   * Remove features by creation source from a specific layer
   */
  removeFeaturesByCreationSource(
    layerType: LayerType,
    creationSource: FeatureCreationSource,
  ): void {
    const source = this.sources.get(layerType);
    if (!source) return;

    const features = source.getFeatures();
    const featuresToRemove = features.filter(
      (feature) => feature.getProperties()['creationSource'] === creationSource,
    );

    featuresToRemove.forEach((feature) => {
      source.removeFeature(feature);
    });

    this.logger.debug('Removed features by creation source', {
      count: featuresToRemove.length,
      creationSource,
      layerType,
    });
  }

  /**
   * Remove features by creation source from a specific layer, but preserve selected ones
   */
  removeFeaturesByCreationSourceExceptSelected(
    layerType: LayerType,
    creationSource: FeatureCreationSource,
    selectedIds: Set<string>,
  ): void {
    const source = this.sources.get(layerType);
    if (!source) return;

    const features = source.getFeatures();
    const featuresToRemove = features.filter((feature) => {
      const hasMatchingSource =
        feature.getProperties()['creationSource'] === creationSource;
      const featureId = feature.getId()?.toString();
      const isSelected = featureId && selectedIds.has(featureId);

      // Remove if it has the matching source BUT is not selected
      return hasMatchingSource && !isSelected;
    });

    featuresToRemove.forEach((feature) => {
      source.removeFeature(feature);
    });

    const preservedCount =
      features.length -
      featuresToRemove.length -
      features.filter(
        (f) => f.getProperties()['creationSource'] !== creationSource,
      ).length;

    this.logger.debug('Removed features except selected', {
      removed: featuresToRemove.length,
      creationSource,
      layerType,
      preserved: preservedCount,
    });
  }

  /**
   * Remove features by creation source from all layers
   */
  removeFeaturesByCreationSourceFromAllLayers(
    creationSource: FeatureCreationSource,
  ): void {
    let totalRemoved = 0;
    this.sources.forEach((source, layerType) => {
      const features = source.getFeatures();
      const featuresToRemove = features.filter(
        (feature) =>
          feature.getProperties()['creationSource'] === creationSource,
      );

      featuresToRemove.forEach((feature) => {
        source.removeFeature(feature);
      });

      if (featuresToRemove.length > 0) {
        this.logger.debug('Removed features from layer', {
          count: featuresToRemove.length,
          creationSource,
          layerType,
        });
        totalRemoved += featuresToRemove.length;
      }
    });

    this.logger.debug('Total features removed across all layers', {
      total: totalRemoved,
      creationSource,
    });
  }

  /**
   * Update zoom level for styling
   */
  setZoomLevel(zoom: number | null): void {
    this.currentZoomLevel.set(zoom);
    const bikeClusterSource = this.clusterSources.get(LayerType.BIKE);
    if (bikeClusterSource) {
      const targetDistance = this.styleService.getClusterDistanceForZoom(zoom);
      if (bikeClusterSource.getDistance() !== targetDistance) {
        bikeClusterSource.setDistance(targetDistance);
      }
    }
    // Trigger layer refresh to update labels
    this.layers.forEach((layer) => layer.changed());
  }

  /**
   * Get all layers array (for adding to map)
   */
  getAllLayers(): VectorLayer<VectorSource>[] {
    return Array.from(this.layers.values());
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.sources.forEach((source) => source.clear());
    this.layers.clear();
  }
}
