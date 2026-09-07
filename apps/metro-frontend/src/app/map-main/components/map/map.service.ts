import { Service, Signal, signal, inject } from '@angular/core';
import { Map, View } from 'ol';
import { fromLonLat, toLonLat } from 'ol/proj';
import { createEmpty, extend, isEmpty } from 'ol/extent';
import { Feature } from 'ol';
import { FeatureLike } from 'ol/Feature';
import Overlay from 'ol/Overlay';
import { MapLayerService, LayerType } from './layers/map-layer.service';
import { VectorTileLayerService } from './vector-tiles/vector-tile-layer.service';
import { LoggerService } from '@metro/shared/api';
import type {
  MapFeature,
  MapOptions,
  MapPointSelection,
} from './map-service.types';
import { featureToMapFeature } from './map-feature.utils';
import { MapBaseTileService } from './layers/map-base-tile.service';

export type {
  MapFeature,
  MapOptions,
  MapPointSelection,
} from './map-service.types';

@Service()
export class MapService {
  private layerService = inject(MapLayerService);
  private vectorTileLayerService = inject(VectorTileLayerService);
  private logger = inject(LoggerService);
  private baseTileService = inject(MapBaseTileService);

  private map = signal<Map | null>(null);

  // Observable signals for component state (kept for future use)"
  readonly isDrawing = signal<boolean>(false);
  readonly isModifying = signal<boolean>(false);
  readonly selectedFeature = signal<FeatureLike | null>(null);
  readonly features = signal<Feature[]>([]);
  readonly zoomLevel = signal<number | null>(null);
  readonly center = signal<[number, number] | null>(null);
  readonly isSelectingPoint = signal(false);

  private pointSelectionCallback:
    | ((selection: MapPointSelection) => void)
    | null = null;

  // Expose layer service for components
  getLayerService(): MapLayerService {
    return this.layerService;
  }

  // Expose vector tile layer service for components
  getVectorTileLayerService(): VectorTileLayerService {
    return this.vectorTileLayerService;
  }

  /**
   * Initializes the OpenLayers map
   */
  initializeMap(target: string, options: MapOptions = {}): Map {
    // If a map already exists, destroy it first to avoid creating multiple
    // ol.Map instances bound to the same DOM target (this was causing two
    // maps to be rendered when initializeMap was invoked more than once).
    const existing = this.map();
    if (existing) {
      const currentTarget = existing.getTarget();
      const targetMatches =
        (typeof currentTarget === 'string' && currentTarget === target) ||
        currentTarget === document.getElementById(target);

      this.logger.warn(
        targetMatches
          ? 'initializeMap called for the same target while a map instance already exists — destroying previous instance to avoid duplicate rendering'
          : 'initializeMap called but an existing map instance was present — destroying previous instance',
      );

      // Clean up the previous map to ensure only one map is attached to the DOM
      this.destroy();
    }

    const {
      center = [-74.006, 40.7128], // Default to NYC
      zoom = 12,
      showControls = true,
      additionalLayers = [],
    } = options;

    const tileLayer = this.baseTileService.createLayer();

    // Create map with view
    const map = new Map({
      target,
      layers: [tileLayer],
      view: new View({
        center: fromLonLat(center),
        zoom,
      }),
      controls: showControls ? undefined : [],
    });

    // Add managed layers from layer service
    this.layerService.addLayersToMap(map);

    // Add vector tile layers (subway stations and routes via MVT)
    this.vectorTileLayerService.addLayersToMap(map);

    // Add any additional layers (e.g., real-time vehicle layer)
    if (additionalLayers.length > 0) {
      this.logger.info(
        `Adding ${additionalLayers.length} additional layers to map`,
      );
      additionalLayers.forEach((layer, index) => {
        map.addLayer(layer);
        this.logger.debug(`Added additional layer ${index}`);
      });
    }

    // Initialize zoom level signal
    this.zoomLevel.set(map.getView().getZoom() || null);
    this.center.set(
      toLonLat(map.getView().getCenter() ?? [0, 0]) as [number, number],
    );

    // Listen for zoom changes and refresh layers to update labels
    map.getView().on('change:resolution', () => {
      const newZoom = map.getView().getZoom() || null;
      this.zoomLevel.set(newZoom);

      // Update zoom in layer service
      this.layerService.setZoomLevel(newZoom);
      // Update zoom in vector tile layer service
      this.vectorTileLayerService.setZoomLevel(newZoom);
    });

    map.getView().on('change:center', () => {
      this.updateCenterSignal();
    });

    // Add direct click handler for feature selection
    map.on('singleclick', (event) => {
      this.logger.debug('Map clicked', { coordinate: event.coordinate });

      if (this.pointSelectionCallback) {
        const [lon, lat] = toLonLat(event.coordinate);
        const callback = this.pointSelectionCallback;
        this.pointSelectionCallback = null;
        this.isSelectingPoint.set(false);
        this.selectedFeature.set(null);
        callback({ lat, lon });
        return;
      }

      // Get features at the clicked pixel (includes both regular and vector tile features)
      const features = map.getFeaturesAtPixel(event.pixel);
      this.logger.debug('Features at click', { count: features?.length || 0 });

      if (features && features.length > 0) {
        // First feature can be Feature or RenderFeature (from vector tiles)
        const feature = features[0] as FeatureLike;

        // Debug: log feature info
        this.logger.debug('Feature clicked', {
          id: feature.getId?.() ?? 'no-id',
          properties: feature.getProperties(),
          geometryType: feature.getGeometry()?.getType(),
          isVectorTile:
            this.vectorTileLayerService.isVectorTileFeature(feature),
        });

        // Print layer visibility status
        this.logger.debug('Layer visibility', {
          selection: this.layerService.isLayerVisible(LayerType.SELECTION),
          railStations: this.layerService.isLayerVisible(
            LayerType.RAIL_STATIONS,
          ),
          railRoutes: this.layerService.isLayerVisible(LayerType.RAIL_ROUTES),
          busRoutes: this.layerService.isLayerVisible(LayerType.BUS_ROUTES),
          busStops: this.layerService.isLayerVisible(LayerType.BUS_STOPS),
          bike: this.layerService.isLayerVisible(LayerType.BIKE),
        });

        // Debug: Print ALL layers on the map (including unmanaged ones)
        const map = this.map();
        if (map) {
          const allLayers = map.getLayers().getArray();
          this.logger.debug(
            'All layers on map',
            allLayers.map((layer, index) => ({
              index,
              type: layer.constructor.name,
              visible: layer.getVisible(),
              zIndex: layer.getZIndex(),
              source: layer.get('source')?.constructor?.name,
              featureCount:
                layer.get('source')?.getFeatures?.()?.length || 'N/A',
            })),
          );

          // Check which layer contains the clicked feature
          const clickedFeatureId = feature.getId();
          allLayers.forEach((layer, index) => {
            const source = layer.get('source');
            if (source && source.getFeatures) {
              const layerFeatures = source.getFeatures();
              const foundInThisLayer = layerFeatures.find(
                (f: Feature) => f.getId() === clickedFeatureId || f === feature,
              );
              if (foundInThisLayer) {
                this.logger.debug('Feature found in layer', {
                  layerIndex: index,
                  layerType: layer.constructor.name,
                  visible: layer.getVisible(),
                  zIndex: layer.getZIndex(),
                  sourceType: source.constructor.name,
                });
              }
            }
          });
        }

        // Print all layer contents for debugging
        this.layerService.debugPrintLayerContents();

        // Always trigger selection, even if it's the same feature
        // First clear the selection, then set it again to ensure the effect runs
        this.selectedFeature.set(null);
        // Use setTimeout to ensure the signal change is processed
        setTimeout(() => {
          this.selectedFeature.set(feature);
        }, 0);
      } else {
        this.logger.debug('No features found at click, clearing selection');
        this.selectedFeature.set(null);
      }
    });

    // Add pointer move handler for hover feedback
    map.on('pointermove', (event) => {
      const pixel = map.getEventPixel(event.originalEvent);
      const hit = map.hasFeatureAtPixel(pixel);

      // Change cursor to pointer when hovering over features
      const target = map.getTarget();
      const targetElement =
        typeof target === 'string' ? document.getElementById(target) : target;

      if (targetElement instanceof HTMLElement) {
        targetElement.style.cursor = this.isSelectingPoint()
          ? 'crosshair'
          : hit
            ? 'pointer'
            : '';
      }
    });

    this.map.set(map);
    this.logger.info('Map initialized with interactions and click handler');

    return map;
  }

  /**
   * Convert OpenLayers feature to MapFeature format
   */
  featureToMapFeature(feature: Feature): MapFeature {
    return featureToMapFeature(feature);
  }

  /**
   * Fit the map view to show all features across all layers
   */
  fitToFeatures(): void {
    const map = this.map();
    if (!map) return;

    // Get all features from all layers
    const allFeatures = this.layerService.getAllFeatures();
    if (allFeatures.length === 0) return;

    // Create extent from all features
    const extent = createEmpty();
    allFeatures.forEach((feature) => {
      const geom = feature.getGeometry();
      if (geom) {
        extend(extent, geom.getExtent());
      }
    });

    // Fit map to extent
    if (!isEmpty(extent)) {
      map.getView().fit(extent, {
        padding: [20, 20, 20, 20],
        maxZoom: 16,
      });
    }
  }

  /**
   * Center map on specific coordinates
   */
  centerOn(coordinates: [number, number], zoom?: number): void {
    const view = this.map()?.getView();
    if (view) {
      view.setCenter(fromLonLat(coordinates));
      this.center.set(coordinates);
      if (zoom !== undefined) {
        view.setZoom(zoom);
      }
    }
  }

  private updateCenterSignal(): void {
    const center = this.map()?.getView().getCenter();
    if (!center) {
      this.center.set(null);
      return;
    }

    this.center.set(toLonLat(center) as [number, number]);
  }

  startPointSelection(callback: (selection: MapPointSelection) => void): void {
    this.pointSelectionCallback = callback;
    this.isSelectingPoint.set(true);
    this.selectedFeature.set(null);
  }

  cancelPointSelection(): void {
    this.pointSelectionCallback = null;
    this.isSelectingPoint.set(false);
  }

  zoomToFeatures(features: Feature[], minZoom = 15): void {
    const map = this.map();
    if (!map || features.length === 0) {
      return;
    }

    const extent = createEmpty();
    features.forEach((feature) => {
      const geometry = feature.getGeometry();
      if (geometry) {
        extend(extent, geometry.getExtent());
      }
    });

    if (isEmpty(extent)) {
      return;
    }

    const view = map.getView();
    view.fit(extent, {
      padding: [40, 40, 40, 40],
      maxZoom: Math.max(minZoom, view.getZoom() ?? minZoom),
      duration: 250,
    });

    if ((view.getZoom() ?? 0) < minZoom) {
      view.setZoom(minZoom);
    }
  }

  /**
   * Create popup overlay
   */
  createPopup(element: HTMLElement, coordinates: [number, number]): Overlay {
    const overlay = new Overlay({
      element,
      positioning: 'bottom-center',
      stopEvent: false,
      offset: [0, -10],
    });

    overlay.setPosition(fromLonLat(coordinates));
    this.map()?.addOverlay(overlay);

    return overlay;
  }

  /**
   * Get current map instance
   */
  getMap(): Map | null {
    return this.map();
  }

  /**
   * Get all features from all layers
   */
  getAllFeatures(): Feature[] {
    return this.layerService.getAllFeatures();
  }

  /**
   * Get current zoom level signal
   */
  getZoomLevel(): Signal<number | null> {
    return this.zoomLevel;
  }

  /**
   * Clear feature selection (clears the selection layer)
   */
  clearSelection(): void {
    this.logger.debug('Clearing selection layer');
    this.layerService.clearLayer(LayerType.SELECTION);
    this.selectedFeature.set(null);
  }

  /**
   * Update features signal from all layers
   */
  private updateFeaturesSignal(): void {
    this.features.set(this.layerService.getAllFeatures());
  }

  /**
   * Destroy the map and clean up resources
   */
  destroy(): void {
    const map = this.map();
    if (map) {
      map.setTarget(undefined);
      this.map.set(null);
    }

    this.baseTileService.destroy();

    // Clear all layers
    Object.values(LayerType).forEach((layerType) => {
      this.layerService.clearLayer(layerType);
    });
    this.features.set([]);
    this.selectedFeature.set(null);
    this.cancelPointSelection();
    this.isDrawing.set(false);
    this.isModifying.set(false);
  }
}
