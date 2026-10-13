import { Service, Signal, signal, inject } from '@angular/core';
import { Map, View } from 'ol';
import { fromLonLat, toLonLat } from 'ol/proj';
import { createEmpty, extend, isEmpty } from 'ol/extent';
import { Feature } from 'ol';
import { FeatureLike } from 'ol/Feature';
import { defaults as defaultControls } from 'ol/control/defaults';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';
import { MapLayerService, LayerType } from './layers/map-layer.service';
import { VectorTileLayerService } from './vector-tiles/vector-tile-layer.service';
import { LoggerService } from '@metro/shared/api';
import type {
  MapFeature,
  MapOptions,
} from './map-service.types';
import { featureToMapFeature } from './map-feature.utils';
import { MapBaseTileService } from './layers/map-base-tile.service';
import { getProjectedCoordinateExtent } from './map-coordinate-extent.utils';
import { MapCameraService } from './map-camera.service';

export type {
  MapFeature,
  MapOptions,
} from './map-service.types';

@Service()
export class MapService {
  private layerService = inject(MapLayerService);
  private vectorTileLayerService = inject(VectorTileLayerService);
  private logger = inject(LoggerService);
  private baseTileService = inject(MapBaseTileService);
  private readonly camera = inject(MapCameraService);

  private map = signal<Map | null>(null);
  private selectionTimer: ReturnType<typeof setTimeout> | null = null;
  private hoverFrame: number | null = null;

  readonly selectedFeature = signal<FeatureLike | null>(null);
  readonly features = signal<Feature[]>([]);
  readonly zoomLevel = signal<number | null>(null);
  readonly center = signal<[number, number] | null>(null);

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
          ? 'initializeMap called for the same target while a map instance already exists - destroying previous instance to avoid duplicate rendering'
          : 'initializeMap called but an existing map instance was present - destroying previous instance',
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
      interactions: defaultInteractions({ onFocusOnly: false }),
      controls: showControls
        ? defaultControls({
            attributionOptions: { collapsible: false },
            zoomOptions: {
              zoomInTipLabel: 'Ampliar mapa',
              zoomOutTipLabel: 'Reduzir mapa',
            },
            rotateOptions: { tipLabel: 'Restaurar orientação do mapa' },
          })
        : [],
    });

    const updateZoomLevel = () => {
      const currentZoom = map.getView().getZoom() ?? null;
      this.zoomLevel.set(currentZoom);
      this.layerService.setZoomLevel(currentZoom);
      this.vectorTileLayerService.setZoomLevel(currentZoom);
    };

    // Synchronize styling before attaching layers, including on map recreation.
    updateZoomLevel();

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

    this.center.set(
      toLonLat(map.getView().getCenter() ?? [0, 0]) as [number, number],
    );

    // Keep animation frames free of layer invalidation and persistence effects.
    // OpenLayers renders the moving view itself; publish only the settled camera.
    map.on('movestart', () => {
      this.cancelHoverCheck();
      this.vectorTileLayerService.setMapMoving(true);
    });
    map.on('moveend', () => {
      updateZoomLevel();
      this.updateCenterSignal();
      this.vectorTileLayerService.setMapMoving(false);
    });

    // Add direct click handler for feature selection
    map.on('singleclick', (event) => {
      this.logger.debug('Map clicked', { coordinate: event.coordinate });

      // Get features at the clicked pixel (includes both regular and vector tile features)
      const features = map.getFeaturesAtPixel(event.pixel);
      this.logger.debug('Features at click', { count: features?.length || 0 });

      if (features && features.length > 0) {
        // First feature can be Feature or RenderFeature (from vector tiles)
        const feature = features[0] as FeatureLike;

        // Always trigger selection, even if it's the same feature
        // First clear the selection, then set it again to ensure the effect runs
        this.selectedFeature.set(null);
        // Use setTimeout to ensure the signal change is processed
        if (this.selectionTimer) clearTimeout(this.selectionTimer);
        this.selectionTimer = setTimeout(() => {
          this.selectionTimer = null;
          if (this.map() === map) this.selectedFeature.set(feature);
        }, 0);
      } else {
        if (this.selectionTimer) clearTimeout(this.selectionTimer);
        this.selectionTimer = null;
        this.logger.debug('No features found at click, clearing selection');
        this.selectedFeature.set(null);
      }
    });

    // Coalesce pointer events and hit-test only the latest position per frame.
    let hoverPixel: number[] = [];
    map.on('pointermove', (event) => {
      const view = map.getView();
      if (event.dragging || view.getAnimating() || view.getInteracting()) {
        this.cancelHoverCheck();
        return;
      }
      hoverPixel = event.pixel;
      if (this.hoverFrame !== null) return;

      this.hoverFrame = requestAnimationFrame(() => {
        this.hoverFrame = null;
        if (this.map() !== map || view.getAnimating() || view.getInteracting()) return;
        const cursor = map.hasFeatureAtPixel(hoverPixel) ? 'pointer' : '';
        const target = map.getTargetElement();
        if (target && target.style.cursor !== cursor) target.style.cursor = cursor;
      });
    });

    this.map.set(map);
    this.camera.attach(map);
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
      this.camera.fitExtent(extent);
    }
  }

  /**
   * Center map on specific coordinates
   */
  centerOn(coordinates: [number, number], zoom?: number): void {
    const view = this.map()?.getView();
    if (view) {
      this.camera.cancel();
      view.setCenter(fromLonLat(coordinates));
      this.center.set(coordinates);
      if (zoom !== undefined) {
        view.setZoom(zoom);
      }
    }
  }

  /** Focus a tapped point after its information panel has rendered. */
  focusFeature(feature: FeatureLike): void {
    const geometry = feature.getGeometry();
    if (geometry?.getType() !== 'Point') return;
    const extent = geometry.getExtent();
    const coordinates = toLonLat([extent[0], extent[1]]) as [number, number];
    const minimumZoom = feature.get('vehicleId') ? 0 : 16;
    this.camera.focusPoint(coordinates, minimumZoom);
  }

  /** Fit a set of geographic points, such as the physical stops in a terminal. */
  fitToCoordinates(
    coordinates: readonly (readonly [number, number])[],
  ): void {
    const map = this.map();
    const extent = getProjectedCoordinateExtent(coordinates);
    if (!map || !extent) return;

    this.camera.fitExtent(extent, 16);
  }

  private updateCenterSignal(): void {
    const center = this.map()?.getView().getCenter();
    if (!center) {
      this.center.set(null);
      return;
    }

    this.center.set(toLonLat(center) as [number, number]);
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

    // A cluster click requests expansion, but its members must still fit.
    const currentZoom = map.getView().getZoom() ?? minZoom;
    this.camera.fitExtent(extent, Math.min(18, Math.max(minZoom, currentZoom + 2)), 18);
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
    if (this.selectionTimer) clearTimeout(this.selectionTimer);
    this.selectionTimer = null;
    this.logger.debug('Clearing selection layer');
    this.layerService.clearLayer(LayerType.SELECTION);
    this.selectedFeature.set(null);
  }

  /**
   * Destroy the map and clean up resources
   */
  destroy(): void {
    this.cancelHoverCheck();
    if (this.selectionTimer) clearTimeout(this.selectionTimer);
    this.selectionTimer = null;
    const map = this.map();
    this.camera.detach();
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
    this.vectorTileLayerService.setMapMoving(false);
  }

  private cancelHoverCheck(): void {
    if (this.hoverFrame === null) return;
    cancelAnimationFrame(this.hoverFrame);
    this.hoverFrame = null;
  }
}
