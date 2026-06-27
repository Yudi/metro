import { Injectable, Signal, signal, inject, PLATFORM_ID } from '@angular/core';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import { fromLonLat, toLonLat } from 'ol/proj';
import { createEmpty, extend, isEmpty } from 'ol/extent';
import {
  Style,
  Fill,
  Stroke,
  Circle as CircleStyle,
} from 'ol/style';
import { Feature } from 'ol';
import { FeatureLike } from 'ol/Feature';
import { Point, LineString, Polygon, Circle } from 'ol/geom';
import Overlay from 'ol/Overlay';
import { XYZ } from 'ol/source';
import { StationNameService } from './station-name.service';
import { MapLayerService, LayerType } from './map-layer.service';
import { VectorTileLayerService } from './vector-tile-layer.service';
import { TransitAgency } from '@metro/shared/utils';
import { LoggerService } from '@metro/shared/api';
import { isPlatformBrowser } from '@angular/common';
import {
  createInlineAgencyIconStyles,
  createInlineStationLabelStyle,
} from '../utils/map-style.utils';

export interface MapFeature {
  id?: string;
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon' | 'Circle';
    coordinates: number[][];
    radius?: number; // for circles
  };
  properties: Record<string, unknown>;
}

export interface MapOptions {
  center?: [number, number]; // longitude, latitude
  zoom?: number;
  showControls?: boolean;
  additionalLayers?: import('ol/layer/Base').default[]; // Allow passing additional layers
}

export interface MapPointSelection {
  lat: number;
  lon: number;
}

@Injectable({
  providedIn: 'root',
})
export class MapService {
  private stationNameService = inject(StationNameService);
  private layerService = inject(MapLayerService);
  private vectorTileLayerService = inject(VectorTileLayerService);
  private logger = inject(LoggerService);
  private platformId = inject(PLATFORM_ID);

  private map = signal<Map | null>(null);

  // Base tile layer (light/dark) and client-only color-scheme listener
  private baseTileLayer: TileLayer | null = null;
  private colorSchemeMql: MediaQueryList | null = null;
  private colorSchemeListener:
    | ((ev: MediaQueryListEvent | MediaQueryList) => void)
    | null = null;

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

    let isDarkMode = false;
    let colorSchemeMql: MediaQueryList | null = null;

    if (isPlatformBrowser(this.platformId)) {
      colorSchemeMql = window.matchMedia('(prefers-color-scheme: dark)');
      isDarkMode = colorSchemeMql.matches;
    }

    const baseTileUrl = isDarkMode
      ? 'https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
      : 'https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';

    // Create base tile layer (CartoDB light/dark)
    const tileLayer = new TileLayer({
      source: new XYZ({
        url: baseTileUrl,
        attributions: '© OpenStreetMap contributors, © CartoDB',
      }),
    });

    // Keep a reference so we can swap tiles at runtime when OS theme changes
    this.baseTileLayer = tileLayer;

    // Add a client-only listener to respond to OS theme changes (prefers-color-scheme)
    if (colorSchemeMql && isPlatformBrowser(this.platformId)) {
      this.colorSchemeMql = colorSchemeMql;
      this.colorSchemeListener = (
        event: MediaQueryListEvent | MediaQueryList,
      ) => {
        const matches =
          'matches' in event
            ? event.matches
            : (event as MediaQueryList).matches;
        const url = matches
          ? 'https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
          : 'https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
        this.baseTileLayer?.setSource(
          new XYZ({
            url,
            attributions: '© OpenStreetMap contributors, © CartoDB',
          }),
        );
        this.logger.info(
          `Switched base tiles to ${matches ? 'dark' : 'light'} mode`,
        );
      };

      if (typeof colorSchemeMql.addEventListener === 'function') {
        colorSchemeMql.addEventListener(
          'change',
          this.colorSchemeListener as EventListener,
        );
      } else {
        const legacy = colorSchemeMql as unknown as {
          addListener?: (l: (mql: MediaQueryList) => void) => void;
        };
        if (typeof legacy.addListener === 'function') {
          legacy.addListener(
            this.colorSchemeListener as (mql: MediaQueryList) => void,
          );
        }
      }
    }

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
    this.center.set(toLonLat(map.getView().getCenter() ?? [0, 0]) as [
      number,
      number,
    ]);

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
   * Creates default style for features
   */
  private createDefaultStyle(): Style {
    return new Style({
      fill: new Fill({
        color: 'rgba(66, 165, 245, 0.3)',
      }),
      stroke: new Stroke({
        color: '#1976d2',
        width: 2,
      }),
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({
          color: '#1976d2',
        }),
        stroke: new Stroke({
          color: '#ffffff',
          width: 2,
        }),
      }),
    });
  }

  /**
   * Creates feature-specific style based on properties
   */
  private createFeatureStyle(feature: FeatureLike): Style | Style[] {
    const properties = feature.getProperties();
    const geometryType = feature.getGeometry()?.getType();

    // Use route color if available
    const routeColor = properties['color'];
    const defaultColor = '#1976d2';
    const strokeColor =
      routeColor && routeColor !== '' ? `#${routeColor}` : defaultColor;

    if (geometryType === 'Point') {
      // Check if this is a subway station based on the feature property
      const isSubwayStation = properties['isSubwayStation'] === true;
      const currentZoom = this.zoomLevel() || 0;
      const showLabels = currentZoom >= 14;

      if (isSubwayStation) {
        // Subway station style with agency icon(s)
        const agencies = (properties['agencies'] || []) as TransitAgency[];
        const styles = createInlineAgencyIconStyles(agencies);

        // Add label at zoom level 14+
        if (showLabels && properties['name']) {
          const displayName = this.stationNameService.formatStationName(
            properties['name'] as string,
            isSubwayStation,
          );
          // Calculate offset based on number of icons (14px per icon + 6px gap)
          const labelOffset =
            agencies.length > 0 ? agencies.length * 14 + 6 : 20;

          styles.push(createInlineStationLabelStyle(displayName, labelOffset));
        }

        return styles;
      } else {
        // Regular bus stop style
        return new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({
              color: strokeColor,
            }),
            stroke: new Stroke({
              color: '#ffffff',
              width: 2,
            }),
          }),
        });
      }
    } else {
      // Route/Shape style (LineString)
      return new Style({
        stroke: new Stroke({
          color: strokeColor,
          width: 3,
        }),
        fill: new Fill({
          color: `${strokeColor}33`, // Add transparency
        }),
      });
    }
  }

  /**
   * Creates selected feature style
   */
  private createSelectedStyle(): Style {
    return new Style({
      fill: new Fill({
        color: 'rgba(255, 152, 0, 0.3)',
      }),
      stroke: new Stroke({
        color: '#ff9800',
        width: 3,
      }),
      image: new CircleStyle({
        radius: 10,
        fill: new Fill({
          color: '#ff9800',
        }),
        stroke: new Stroke({
          color: '#ffffff',
          width: 2,
        }),
      }),
    });
  }

  /**
   * Convert OpenLayers feature to MapFeature format
   */
  featureToMapFeature(feature: Feature): MapFeature {
    const geometry = feature.getGeometry();
    let mapGeometry;

    if (geometry instanceof Point) {
      mapGeometry = {
        type: 'Point' as const,
        coordinates: [toLonLat(geometry.getCoordinates())],
      };
    } else if (geometry instanceof LineString) {
      mapGeometry = {
        type: 'LineString' as const,
        coordinates: geometry.getCoordinates().map((coord) => toLonLat(coord)),
      };
    } else if (geometry instanceof Polygon) {
      // Flatten the polygon coordinates to a 2D array for consistency
      const rings = geometry.getCoordinates();
      mapGeometry = {
        type: 'Polygon' as const,
        coordinates: rings[0].map((coord) => toLonLat(coord)), // Take only the outer ring for simplicity
      };
    } else if (geometry instanceof Circle) {
      mapGeometry = {
        type: 'Circle' as const,
        coordinates: [toLonLat(geometry.getCenter())],
        radius: geometry.getRadius(),
      };
    } else {
      throw new Error('Unsupported geometry type');
    }

    return {
      id: feature.getId()?.toString(),
      geometry: mapGeometry,
      properties: feature.getProperties(),
    };
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

    // Remove prefers-color-scheme listener (client-only)
    if (
      this.colorSchemeMql &&
      this.colorSchemeListener &&
      isPlatformBrowser(this.platformId)
    ) {
      if (typeof this.colorSchemeMql.removeEventListener === 'function') {
        this.colorSchemeMql.removeEventListener(
          'change',
          this.colorSchemeListener as EventListener,
        );
      } else {
        const legacyRem = this.colorSchemeMql as unknown as {
          removeListener?: (l: (mql: MediaQueryList) => void) => void;
        };
        if (typeof legacyRem.removeListener === 'function') {
          legacyRem.removeListener(
            this.colorSchemeListener as (mql: MediaQueryList) => void,
          );
        }
      }
      this.colorSchemeMql = null;
      this.colorSchemeListener = null;
    }

    // Clear all layers
    Object.values(LayerType).forEach((layerType) => {
      this.layerService.clearLayer(layerType);
    });
    this.features.set([]);
    this.selectedFeature.set(null);
    this.cancelPointSelection();
    this.isDrawing.set(false);
    this.isModifying.set(false);

    // Release base tile layer reference
    this.baseTileLayer = null;
  }
}
