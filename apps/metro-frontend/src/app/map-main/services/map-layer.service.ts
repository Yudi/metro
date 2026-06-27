import { Injectable, signal, computed, inject } from '@angular/core';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import ClusterSource from 'ol/source/Cluster';
import { Feature } from 'ol';
import { FeatureLike } from 'ol/Feature';
import { Map as OLMap } from 'ol';
import { Style, Fill, Stroke, Circle as CircleStyle, Text } from 'ol/style';
import Icon from 'ol/style/Icon';
import { StationNameService } from './station-name.service';
import { FeatureCreationSource } from '../components/map/map.types';
import { LoggerService } from '@metro/shared/api';
import { TransitAgency } from '@metro/shared/utils';
import {
  createCenteredAgencyIconStyles,
  createCenteredStationLabelStyle,
  createSelectedPointStyle,
} from '../utils/map-style.utils';

export interface LayerConfig {
  id: string;
  name: string;
  visible: boolean;
  toggleable: boolean; // Can user toggle this layer on/off
  zIndex: number;
}

export enum LayerType {
  SELECTION = 'selection', // Highest priority - selected features
  RAIL_STATIONS = 'rail-stations', // Rail stations from GeoSampa (Metro + CPTM)
  RAIL_ROUTES = 'rail-routes', // Rail routes from GeoSampa (Metro + CPTM)
  BUS_ROUTES = 'bus-routes', // Bus route shapes only
  BUS_STOPS = 'bus-stops', // Bus stops (separate from route shapes)
  BIKE = 'bike', // Bike stations layer
}

/**
 * Service to manage multiple OpenLayers vector layers with toggle functionality
 * Ensures data preservation when layers are hidden/shown
 */
@Injectable({
  providedIn: 'root',
})
export class MapLayerService {
  private stationNameService = inject(StationNameService);
  private logger = inject(LoggerService);

  private readonly bikeIcon = new Icon({
    src: '/app/icons/bike.svg',
    scale: 0.55,
    anchor: [0.5, 0.5],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
  });

  private readonly bikeSelectedIcon = new Icon({
    src: '/app/icons/bike-selected.svg',
    scale: 0.55,
    anchor: [0.5, 0.5],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
  });

  private readonly bikeElectricIcon = new Icon({
    src: '/app/icons/bike-electric.svg',
    scale: 0.55,
    anchor: [0.5, 0.5],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
  });

  private readonly bikeElectricSelectedIcon = new Icon({
    src: '/app/icons/bike-electric-selected.svg',
    scale: 0.55,
    anchor: [0.5, 0.5],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
  });

  private readonly explorePinIcon = new Icon({
    src: '/app/shared/icons/pin.svg',
    scale: 0.05,
    anchor: [0.5, 1],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
  });

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

  // Layer configurations
  // Z-index ordering (bottom to top):
  // 10-20: Route shapes (subway routes, bus routes)
  // 30: Bike stations
  // 40-50: Stops/Stations (bus stops, subway stations)
  // 60: Selection layer
  // 1000: Realtime vehicles (managed separately in RealtimeVehicleLayerService)
  // Note: SUBWAY_STATIONS and SUBWAY_ROUTES are now managed by VectorTileLayerService
  readonly layerConfigs = signal<LayerConfig[]>([
    {
      id: LayerType.SELECTION,
      name: 'Itens selecionados',
      visible: true,
      toggleable: false,
      zIndex: 25, // Below stops so stops are visible on top of selected routes
    },
    {
      id: LayerType.BUS_STOPS,
      name: 'Pontos de ônibus',
      visible: true,
      toggleable: false,
      zIndex: 45, // Above selection layer so stops appear on top
    },
    {
      id: LayerType.BUS_ROUTES,
      name: 'Rotas de ônibus',
      visible: true,
      toggleable: false,
      zIndex: 20, // Low - route shapes only
    },
    {
      id: LayerType.BIKE,
      name: 'Estações de bicicleta',
      visible: false,
      toggleable: true,
      zIndex: 30, // Above route shapes, below stops
    },
  ]);

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
        style: (feature) => this.createSelectionStyle(feature),
        zIndex: 25, // Below stops so stops appear on top of selected routes
      }),
    );

    // Bus routes layer (bus route shapes only - no stops)
    this.layers.set(
      LayerType.BUS_ROUTES,
      new VectorLayer({
        source: this.sources.get(LayerType.BUS_ROUTES),
        style: (feature) => this.createBusRouteStyle(feature),
        zIndex: 20, // Low - route shapes only
      }),
    );

    // Bus stops layer (separate from route shapes for proper z-ordering)
    this.layers.set(
      LayerType.BUS_STOPS,
      new VectorLayer({
        source: this.sources.get(LayerType.BUS_STOPS),
        style: (feature) => this.createBusStopStyle(feature),
        zIndex: 45, // Above bike stations, below subway stations
      }),
    );

    const bikeSource = this.sources.get(LayerType.BIKE);
    if (bikeSource) {
      const bikeClusterSource = new ClusterSource({
        distance: this.getClusterDistanceForZoom(this.currentZoomLevel()),
        source: bikeSource,
      });
      this.clusterSources.set(LayerType.BIKE, bikeClusterSource);

      this.layers.set(
        LayerType.BIKE,
        new VectorLayer({
          source: bikeClusterSource,
          style: (feature) => this.createBikeStyle(feature),
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
   * Find which layer(s) contain a specific feature
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
      const targetDistance = this.getClusterDistanceForZoom(zoom);
      if (bikeClusterSource.getDistance() !== targetDistance) {
        bikeClusterSource.setDistance(targetDistance);
      }
    }
    // Trigger layer refresh to update labels
    this.layers.forEach((layer) => layer.changed());
  }

  /**
   * Create style for selection layer
   */
  private createSelectionStyle(feature: FeatureLike): Style | Style[] {
    const properties = feature.getProperties();
    const geometryType = feature.getGeometry()?.getType();
    const featureType = properties['type'];

    // For route shapes
    if (geometryType === 'LineString') {
      const routeColor = properties['color'];
      const strokeColor =
        routeColor && routeColor !== '' ? `#${routeColor}` : '#ff9800';

      return new Style({
        stroke: new Stroke({
          color: strokeColor,
          width: 4, // Thicker for emphasis
        }),
      });
    }

    // For bike stations - use selected bike icon
    if (featureType === 'bike_station') {
      const bikesAvailable = Number(properties['bikesAvailable'] ?? 0);
      const effectiveCapacity = Number(properties['effectiveCapacity'] ?? 0);
      const hasElectric = Boolean(properties['hasElectricBikesAvailable']);

      const capacityLabel =
        effectiveCapacity > 0
          ? `${bikesAvailable}/${effectiveCapacity}`
          : `${bikesAvailable}`;

      // Use appropriate icon based on electric availability
      const iconToUse = hasElectric
        ? this.bikeElectricSelectedIcon
        : this.bikeSelectedIcon;

      const styles: Style[] = [
        // Selected bike icon (electric indicator is baked into the SVG)
        new Style({
          image: iconToUse,
        }),
        // Label - positioned closer to the icon
        new Style({
          text: new Text({
            text: capacityLabel,
            font: '600 11px "Inter", "Roboto", sans-serif',
            fill: new Fill({ color: '#1565c0' }),
            stroke: new Stroke({ color: '#ffffff', width: 3.5 }),
            offsetY: 14,
            textAlign: 'center',
            textBaseline: 'top',
          }),
        }),
      ];

      return styles;
    }

    if (featureType === 'explore_location') {
      return [
        new Style({
          image: this.explorePinIcon,
        }),
      ];
    }

    return createSelectedPointStyle();
  }

  /**
   * Create style for subway stations
   */
  private createSubwayStationStyle(feature: FeatureLike): Style | Style[] {
    const properties = feature.getProperties();
    const currentZoom = this.currentZoomLevel() || 0;
    const showLabels = currentZoom >= 14;

    const agencies = (properties['agencies'] || []) as TransitAgency[];
    const styles = createCenteredAgencyIconStyles(agencies);

    // Add label at zoom level 14+
    if (showLabels && properties['name']) {
      const displayName = this.stationNameService.formatStationName(
        properties['name'] as string,
        true, // isSubwayStation
      );

      styles.push(createCenteredStationLabelStyle(displayName));
    }

    return styles;
  }

  /**
   * Create style for subway routes
   */
  private createSubwayRouteStyle(feature: FeatureLike): Style {
    const properties = feature.getProperties();
    const routeColor = properties['color'];
    const defaultColor = '#1976d2';
    const strokeColor =
      routeColor && routeColor !== '' ? `#${routeColor}` : defaultColor;

    return new Style({
      stroke: new Stroke({
        color: strokeColor,
        width: 3,
      }),
    });
  }

  /**
   * Create style for bus routes (route shapes only - LineString)
   */
  private createBusRouteStyle(feature: FeatureLike): Style {
    const properties = feature.getProperties();
    const routeColor = properties['color'];
    const defaultColor = '#1976d2';
    const strokeColor =
      routeColor && routeColor !== '' ? `#${routeColor}` : defaultColor;

    return new Style({
      stroke: new Stroke({
        color: strokeColor,
        width: 2,
      }),
    });
  }

  /**
   * Create style for bus stops (Point features)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private createBusStopStyle(_feature: FeatureLike): Style {
    return new Style({
      image: new Icon({
        src: '/app/icons/bus-stop.svg',
        scale: 0.5,
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    });
  }

  /**
   * Create style for bike layer (dummy for future)
   */
  private createBikeStyle(feature: FeatureLike): Style[] {
    const clusterMembers = feature.get('features') as Feature[] | undefined;

    if (Array.isArray(clusterMembers) && clusterMembers.length > 1) {
      return this.createClusteredBikeStyle(clusterMembers);
    }

    const baseFeature: Feature | FeatureLike =
      Array.isArray(clusterMembers) && clusterMembers.length === 1
        ? clusterMembers[0]
        : feature;

    return this.createSingleBikeStyle(baseFeature as Feature);
  }

  private createSingleBikeStyle(feature: Feature): Style[] {
    const bikesAvailable = Number(feature.get('bikesAvailable') ?? 0);
    const effectiveCapacity = Number(feature.get('effectiveCapacity') ?? 0);
    const hasElectric = Boolean(feature.get('hasElectricBikesAvailable'));
    const isSelected = Boolean(feature.get('isSelected'));

    const capacityLabel =
      effectiveCapacity > 0
        ? `${bikesAvailable}/${effectiveCapacity}`
        : `${bikesAvailable}`;

    const styles: Style[] = [];

    // Add selection highlight ring behind the icon for selected stations
    if (isSelected) {
      styles.push(
        new Style({
          image: new CircleStyle({
            radius: 14,
            fill: new Fill({ color: 'rgba(33, 150, 243, 0.2)' }),
            stroke: new Stroke({ color: '#2196f3', width: 2.5 }),
          }),
        }),
      );
    }

    // Choose the appropriate icon based on electric and selection state
    let iconToUse: Icon;
    if (isSelected) {
      iconToUse = hasElectric
        ? this.bikeElectricSelectedIcon
        : this.bikeSelectedIcon;
    } else {
      iconToUse = hasElectric ? this.bikeElectricIcon : this.bikeIcon;
    }

    const iconStyle = new Style({
      image: iconToUse,
    });
    styles.push(iconStyle);

    const textStyle = new Style({
      text: new Text({
        text: capacityLabel,
        font: '600 11px "Inter", "Roboto", sans-serif',
        fill: new Fill({ color: isSelected ? '#1565c0' : '#1b5e20' }),
        stroke: new Stroke({ color: '#ffffff', width: 3.5 }),
        offsetY: 14,
        textAlign: 'center',
        textBaseline: 'top',
      }),
    });
    styles.push(textStyle);

    return styles;
  }

  private createClusteredBikeStyle(features: Feature[]): Style[] {
    const totalBikes = features.reduce(
      (sum, f) => sum + Number(f.get('bikesAvailable') ?? 0),
      0,
    );
    const totalCapacity = features.reduce(
      (sum, f) => sum + Number(f.get('effectiveCapacity') ?? 0),
      0,
    );
    const hasElectric = features.some((f) =>
      Boolean(f.get('hasElectricBikesAvailable')),
    );

    const label =
      totalCapacity > 0 ? `${totalBikes}/${totalCapacity}` : `${totalBikes}`;

    const radius = Math.min(24, 12 + Math.sqrt(features.length) * 3.5);

    // Clean, modern cluster circle with subtle shadow effect
    const circleStyle = new Style({
      image: new CircleStyle({
        radius,
        fill: new Fill({
          color: hasElectric ? '#2e7d32' : '#2e7d32',
        }),
        stroke: new Stroke({
          color: hasElectric ? '#ffd54f' : '#ffffff',
          width: hasElectric ? 3 : 2.5,
        }),
      }),
      text: new Text({
        text: label,
        font: '700 11px "Inter", "Roboto", sans-serif',
        fill: new Fill({ color: '#ffffff' }),
        stroke: new Stroke({ color: 'rgba(0,0,0,0.4)', width: 3 }),
      }),
    });

    return [circleStyle];
  }

  private getClusterDistanceForZoom(zoom: number | null): number {
    if (zoom === null) {
      return 60;
    }

    if (zoom >= 16) {
      return 0;
    }

    if (zoom >= 14) {
      return 24;
    }

    return 60;
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
