import { Injectable, inject, signal } from '@angular/core';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import MVT from 'ol/format/MVT';
import { Style, Fill, Stroke, Text, Circle as CircleStyle } from 'ol/style';
import Icon from 'ol/style/Icon';
import { FeatureLike } from 'ol/Feature';
import { Map as OLMap } from 'ol';
import { StationNameService } from './station-name.service';
import {
  getCanonicalRailStationName,
  getLineCodesFromColorNames,
  getRailLineByCode,
  TransitAgency,
} from '@metro/shared/utils';
import { LoggerService } from '@metro/shared/api';
import { environment } from '../../../environments/environment';
import {
  createCenteredAgencyIconStyles,
  createCenteredStationLabelStyle,
} from '../utils/map-style.utils';
import {
  createInitialLayerVisibility,
  createVectorTileLayerConfigs,
  VectorTileLayerConfig,
  VectorTileLayerType,
} from './vector-tile-layer.config';

export { VectorTileLayerType } from './vector-tile-layer.config';

export interface BusStopTileFilter {
  routeIds: string[];
  stopIds: string[];
  nearby: {
    lat: number;
    lon: number;
    radiusMeters: number;
  } | null;
}

export interface BikeStationTileData {
  stationId: string;
  latitude: number;
  longitude: number;
  capacity: number | null;
  effectiveCapacity: number;
  numBikesAvailable: number;
  electricBikesAvailable: number;
}

export interface BikeStationClusterTileData {
  latitude: number;
  longitude: number;
  capacity: number | null;
  effectiveCapacity: number;
  numBikesAvailable: number;
  electricBikesAvailable: number;
  stationCount: number;
}

/**
 * Service to manage OpenLayers Vector Tile layers
 *
 * Uses MVT (Mapbox Vector Tiles) format for efficient rendering of static
 * geographic data like subway stations and routes. Tiles are fetched from
 * the backend MVT endpoint and rendered client-side.
 *
 * Benefits over GeoJSON:
 * - Tiles loaded on-demand per viewport (less memory usage)
 * - Data clipped to tile bounds (faster rendering)
 * - Aggressive caching support
 * - No N+1 GraphQL queries
 */
@Injectable({
  providedIn: 'root',
})
export class VectorTileLayerService {
  private readonly stationNameService = inject(StationNameService);
  private readonly logger = inject(LoggerService);

  private readonly baseUrl = environment.production ? '' : '';

  // Layer visibility state
  private readonly layerVisibility = signal<Map<VectorTileLayerType, boolean>>(
    createInitialLayerVisibility(),
  );

  // Vector tile sources
  private readonly sources = new Map<VectorTileLayerType, VectorTileSource>();

  // Vector tile layers
  private readonly layers = new Map<VectorTileLayerType, VectorTileLayer>();

  // Current zoom level for styling
  private currentZoomLevel = signal<number | null>(null);

  private busRouteIds: string[] = [];
  private busStopFilter: BusStopTileFilter = {
    routeIds: [],
    stopIds: [],
    nearby: null,
  };

  // Layer configurations
  readonly layerConfigs = signal<VectorTileLayerConfig[]>(
    createVectorTileLayerConfigs(environment.apiUrl),
  );

  constructor() {
    this.initializeLayers();
  }

  /**
   * Initialize all vector tile layers
   */
  private initializeLayers(): void {
    for (const config of this.layerConfigs()) {
      this.createLayer(config);
    }
  }

  /**
   * Create a vector tile layer from config
   */
  private createLayer(config: VectorTileLayerConfig): void {
    const source = new VectorTileSource({
      format: new MVT({
        // Keep feature IDs for interaction
        idProperty: 'id',
      }),
      tileUrlFunction: (tileCoord) => this.buildTileUrl(config, tileCoord),
      // Tile size matches what PostGIS generates
      tileSize: 512,
    });

    this.sources.set(config.id, source);

    const layer = new VectorTileLayer({
      source,
      style: (feature) => this.getStyleForLayer(config.id, feature),
      zIndex: config.zIndex,
      visible: config.visible,
      // Render mode for better performance with many features
      renderMode: 'hybrid',
      // Preload surrounding tiles for smoother panning
      preload: 1,
    });

    this.layers.set(config.id, layer);
  }

  /**
   * Get style function for a layer type
   */
  private getStyleForLayer(
    layerType: VectorTileLayerType,
    feature: FeatureLike,
  ): Style | Style[] {
    switch (layerType) {
      case VectorTileLayerType.RAIL_STATIONS:
        return this.createRailStationStyle(feature);
      case VectorTileLayerType.RAIL_ROUTES:
        return this.createRailRouteStyle(feature);
      case VectorTileLayerType.BUS_ROUTES:
        return this.createBusRouteStyle(feature);
      case VectorTileLayerType.BUS_STOPS:
        return this.createBusStopStyle();
      case VectorTileLayerType.BIKE_STATIONS:
        return this.createBikeStationStyle(feature);
      default:
        return new Style();
    }
  }

  private buildTileUrl(
    config: VectorTileLayerConfig,
    tileCoord: number[] | null,
  ): string | undefined {
    if (!tileCoord || tileCoord.length < 3) {
      return undefined;
    }

    const [z, x, y] = tileCoord;
    const params = new URLSearchParams();

    if (config.id === VectorTileLayerType.BUS_ROUTES) {
      if (this.busRouteIds.length === 0) {
        return undefined;
      }
      params.set('routeIds', this.busRouteIds.join(','));
    }

    if (config.id === VectorTileLayerType.BUS_STOPS) {
      const { routeIds, stopIds, nearby } = this.busStopFilter;
      if (routeIds.length === 0 && stopIds.length === 0 && !nearby) {
        return undefined;
      }

      if (routeIds.length > 0) {
        params.set('routeIds', routeIds.join(','));
      }
      if (stopIds.length > 0) {
        params.set('stopIds', stopIds.join(','));
      }
      if (nearby) {
        params.set('lat', String(nearby.lat));
        params.set('lon', String(nearby.lon));
        params.set('radiusMeters', String(nearby.radiusMeters));
      }
    }

    const path = `${this.baseUrl}${config.tileUrl}`
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
    const query = params.toString();

    return query ? `${path}?${query}` : path;
  }

  /**
   * Create style for rail stations
   */
  private createRailStationStyle(feature: FeatureLike): Style | Style[] {
    const currentZoom = this.currentZoomLevel() || 0;
    const showLabels = currentZoom >= 14;

    // Get agencies from merged station data (agencies array from merged_rail_stations)
    const agenciesRaw = feature.get('agencies');
    let agencies: TransitAgency[] = [];

    // Handle agencies - could be array or JSON string
    if (Array.isArray(agenciesRaw)) {
      // Map string agency names to TransitAgency enum values
      // agencies array contains strings like 'metro', 'viaquatro', 'viamobilidade', 'cptm'
      agencies = agenciesRaw
        .map((agencyStr: string) => {
          // The agencies come as lowercase strings that match TransitAgency enum values
          const agencyEnum = agencyStr as TransitAgency;
          if (Object.values(TransitAgency).includes(agencyEnum)) {
            return agencyEnum;
          }
          return null;
        })
        .filter((a): a is TransitAgency => a !== null);
    } else if (typeof agenciesRaw === 'string') {
      // Parse JSON string from MVT (array_to_json conversion)
      try {
        const parsed = JSON.parse(agenciesRaw);
        if (Array.isArray(parsed)) {
          agencies = parsed
            .map((agencyStr: string) => {
              const agencyEnum = agencyStr as TransitAgency;
              if (Object.values(TransitAgency).includes(agencyEnum)) {
                return agencyEnum;
              }
              return null;
            })
            .filter((a): a is TransitAgency => a !== null);
        }
      } catch (error) {
        this.logger.warn('Failed to parse agencies JSON:', agenciesRaw, error);
      }
    }

    const styles = createCenteredAgencyIconStyles(agencies);

    // Add label at zoom level 14+
    if (showLabels) {
      const name = feature.get('name') as string;
      if (name) {
        const displayName = this.stationNameService.formatStationName(
          name,
          true, // isSubwayStation
        );

        styles.push(createCenteredStationLabelStyle(displayName));
      }
    }

    return styles;
  }

  /**
   * Create style for rail routes (GeoSampa data)
   */
  private createRailRouteStyle(feature: FeatureLike): Style {
    const lineCode = Number(
      feature.get('line_code') ?? feature.get('line_number'),
    );
    const colorHex =
      (Number.isFinite(lineCode)
        ? getRailLineByCode(lineCode)?.colorHex
        : undefined) ?? (feature.get('color_hex') as string | undefined);
    const defaultColor = '#1976d2';
    const strokeColor = colorHex || defaultColor;

    return new Style({
      stroke: new Stroke({
        color: strokeColor,
        width: 3,
      }),
    });
  }

  private createBusRouteStyle(feature: FeatureLike): Style {
    const color = String(feature.get('route_color') || '1976d2').replace(
      '#',
      '',
    );

    return new Style({
      stroke: new Stroke({
        color: `#${color}`,
        width: 3,
      }),
    });
  }

  private createBusStopStyle(): Style {
    return new Style({
      image: new Icon({
        src: '/app/icons/bus-stop.svg',
        scale: 0.55,
        anchor: [0.5, 0.5],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    });
  }

  private createBikeStationStyle(feature: FeatureLike): Style[] {
    const currentZoom = this.currentZoomLevel() || 0;
    const bikesAvailable = Number(feature.get('num_bikes_available') ?? 0);
    const electricBikesAvailable = Number(
      feature.get('electric_bikes_available') ?? 0,
    );
    const effectiveCapacity = Number(feature.get('effective_capacity') ?? 0);
    const label =
      effectiveCapacity > 0
        ? `${bikesAvailable}/${effectiveCapacity}`
        : String(bikesAvailable);

    if (this.isBikeStationCluster(feature)) {
      const stationCount = Number(feature.get('station_count') ?? 1);
      const radius = Math.min(24, 12 + Math.sqrt(stationCount) * 3.5);

      return [
        new Style({
          image: new CircleStyle({
            radius,
            fill: new Fill({ color: '#2e7d32' }),
            stroke: new Stroke({
              color: electricBikesAvailable > 0 ? '#fdd835' : '#ffffff',
              width: electricBikesAvailable > 0 ? 3 : 2,
            }),
          }),
          text: new Text({
            text: label,
            font: '700 11px "Inter", "Roboto", sans-serif',
            fill: new Fill({ color: '#ffffff' }),
            stroke: new Stroke({ color: '#1b5e20', width: 3 }),
            textAlign: 'center',
            textBaseline: 'middle',
          }),
        }),
      ];
    }

    const iconPath =
      electricBikesAvailable > 0
        ? '/app/icons/bike-electric.svg'
        : '/app/icons/bike.svg';

    const styles = [
      new Style({
        image: new Icon({
          src: iconPath,
          scale: 0.55,
          anchor: [0.5, 0.5],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
        }),
      }),
    ];

    if (currentZoom >= 14) {
      styles.push(
        new Style({
          text: new Text({
            text: label,
            font: '600 11px "Inter", "Roboto", sans-serif',
            fill: new Fill({ color: '#1565c0' }),
            stroke: new Stroke({ color: '#ffffff', width: 3.5 }),
            offsetY: 14,
            textAlign: 'center',
            textBaseline: 'top',
          }),
        }),
      );
    }

    return styles;
  }

  /**
   * Add all vector tile layers to the map
   */
  addLayersToMap(map: OLMap): void {
    for (const layer of this.layers.values()) {
      map.addLayer(layer);
    }
    this.logger.debug('Vector tile layers added to map', {
      layers: Array.from(this.layers.keys()),
    });
  }

  /**
   * Remove all vector tile layers from the map
   */
  removeLayersFromMap(map: OLMap): void {
    for (const layer of this.layers.values()) {
      map.removeLayer(layer);
    }
  }

  /**
   * Get a specific layer
   */
  getLayer(layerType: VectorTileLayerType): VectorTileLayer | undefined {
    return this.layers.get(layerType);
  }

  /**
   * Toggle layer visibility
   */
  toggleLayer(layerType: VectorTileLayerType): void {
    const layer = this.layers.get(layerType);
    if (!layer) return;

    const config = this.layerConfigs().find((c) => c.id === layerType);
    if (!config || !config.toggleable) return;

    const newVisibility = !layer.getVisible();

    // Handle layer dependencies
    if (
      layerType === VectorTileLayerType.RAIL_ROUTES &&
      newVisibility === true
    ) {
      // When enabling rail routes, also enable rail stations
      this.setLayerVisibility(VectorTileLayerType.RAIL_STATIONS, true);
    } else if (
      layerType === VectorTileLayerType.RAIL_STATIONS &&
      newVisibility === false
    ) {
      // When disabling rail stations, also disable rail routes
      this.setLayerVisibility(VectorTileLayerType.RAIL_ROUTES, false);
    }

    // Set the toggled layer visibility
    layer.setVisible(newVisibility);

    this.updateLayerVisibilityState(layerType, newVisibility);

    this.logger.debug('Vector tile layer visibility toggled', {
      layerType,
      visible: newVisibility,
    });
  }

  /**
   * Set layer visibility explicitly
   */
  setLayerVisibility(layerType: VectorTileLayerType, visible: boolean): void {
    const layer = this.layers.get(layerType);
    if (!layer) return;

    layer.setVisible(visible);
    this.updateLayerVisibilityState(layerType, visible);
  }

  private updateLayerVisibilityState(
    layerType: VectorTileLayerType,
    visible: boolean,
  ): void {
    // Update visibility state
    const newMap = new Map(this.layerVisibility());
    newMap.set(layerType, visible);
    this.layerVisibility.set(newMap);

    // Update config
    const updatedConfigs = this.layerConfigs().map((c) =>
      c.id === layerType ? { ...c, visible } : c,
    );
    this.layerConfigs.set(updatedConfigs);
  }

  setBusRouteIds(routeIds: string[]): void {
    this.busRouteIds = this.normalizeIds(routeIds);
    this.refreshLayer(VectorTileLayerType.BUS_ROUTES);
  }

  setBusStopFilter(filter: BusStopTileFilter): void {
    this.busStopFilter = {
      routeIds: this.normalizeIds(filter.routeIds),
      stopIds: this.normalizeIds(filter.stopIds),
      nearby: filter.nearby,
    };
    this.refreshLayer(VectorTileLayerType.BUS_STOPS);
  }

  refreshLayer(layerType: VectorTileLayerType): void {
    this.sources.get(layerType)?.refresh();
  }

  /**
   * Get layer visibility status
   */
  isLayerVisible(layerType: VectorTileLayerType): boolean {
    return this.layerVisibility().get(layerType) ?? false;
  }

  /**
   * Update zoom level for styling
   */
  setZoomLevel(zoom: number | null): void {
    if (this.currentZoomLevel() !== zoom) {
      this.currentZoomLevel.set(zoom);
      // Trigger layer refresh to update labels
      for (const layer of this.layers.values()) {
        layer.changed();
      }
    }
  }

  /**
   * Refresh all tile layers (clears cache)
   */
  refreshLayers(): void {
    for (const source of this.sources.values()) {
      source.refresh();
    }
    this.logger.debug('Vector tile layers refreshed');
  }

  /**
   * Get all layers as array
   */
  getAllLayers(): VectorTileLayer[] {
    return Array.from(this.layers.values());
  }

  /**
   * Check if a feature is from a vector tile layer
   * Vector tile features (RenderFeature) have a different structure than regular features
   */
  isVectorTileFeature(feature: FeatureLike): boolean {
    // Vector tile features from MVT have specific characteristics:
    // 1. They come from VectorTile layers
    // 2. They have MVT-specific properties
    const properties = feature.getProperties();

    // Check if it's from a vector tile layer by checking for MVT layer name
    // MVT features have a 'layer' property set by the MVT format
    if ('layer' in properties) {
      this.logger.debug(
        'Feature has layer property (MVT feature):',
        properties['layer'],
      );
      return true;
    }

    // Fallback: check for rail-specific properties
    // Vector tile features from GeoSampa have 'agencies' array (stations) or 'inferred_agency' (routes)
    const hasRailStationProps =
      'name' in properties &&
      ('agencies' in properties || 'lines' in properties);
    const hasRailRouteProps =
      ('line_number' in properties || 'line_code' in properties) &&
      'inferred_agency' in properties;
    const hasBusRouteProps =
      'route_id' in properties && 'shape_id' in properties;
    const hasBusStopProps =
      'stop_id' in properties && 'stop_name' in properties;
    const hasBikeStationProps =
      ('station_id' in properties || 'station_count' in properties) &&
      'num_bikes_available' in properties;

    if (
      hasRailStationProps ||
      hasRailRouteProps ||
      hasBusRouteProps ||
      hasBusStopProps ||
      hasBikeStationProps
    ) {
      this.logger.debug('Feature has rail properties (MVT feature)');
      return true;
    }

    return false;
  }

  /**
   * Determine which vector tile layer a feature belongs to
   */
  getFeatureLayerType(feature: FeatureLike): VectorTileLayerType | null {
    const properties = feature.getProperties();

    this.logger.debug('getFeatureLayerType: analyzing feature', {
      propertyKeys: Object.keys(properties),
      hasLayer: 'layer' in properties,
      layerValue: properties['layer'],
    });

    // Check MVT layer name (most reliable method)
    if ('layer' in properties) {
      const layerName = properties['layer'];
      this.logger.debug('Feature has MVT layer property:', layerName);

      if (layerName === 'rail-stations') {
        return VectorTileLayerType.RAIL_STATIONS;
      } else if (layerName === 'rail-routes') {
        return VectorTileLayerType.RAIL_ROUTES;
      } else if (layerName === 'bus-routes') {
        return VectorTileLayerType.BUS_ROUTES;
      } else if (layerName === 'bus-stops') {
        return VectorTileLayerType.BUS_STOPS;
      } else if (layerName === 'bike-stations') {
        return VectorTileLayerType.BIKE_STATIONS;
      }
    }

    // Fallback: detect by properties
    // Rail station features (Point geometry) have name, agencies[], lines[], is_merged
    if (
      'name' in properties &&
      'agencies' in properties &&
      'lines' in properties
    ) {
      this.logger.debug('Detected as rail station by properties');
      return VectorTileLayerType.RAIL_STATIONS;
    }

    // Rail route features (LineString) have line_number, inferred_agency, color_hex
    if ('line_number' in properties && 'inferred_agency' in properties) {
      this.logger.debug('Detected as rail route by properties');
      return VectorTileLayerType.RAIL_ROUTES;
    }

    if ('route_id' in properties && 'shape_id' in properties) {
      return VectorTileLayerType.BUS_ROUTES;
    }

    if ('stop_id' in properties && 'stop_name' in properties) {
      return VectorTileLayerType.BUS_STOPS;
    }

    if (
      ('station_id' in properties || 'station_count' in properties) &&
      'num_bikes_available' in properties
    ) {
      return VectorTileLayerType.BIKE_STATIONS;
    }

    this.logger.warn('Could not determine feature layer type', properties);
    return null;
  }

  /**
   * Extract rail station data from a vector tile feature
   * Based on mvt_rail_stations view columns: id, name, agencies[], lines[], is_merged
   */
  extractRailStationData(feature: FeatureLike): {
    id: string;
    name: string;
    agencies: string[];
    lines: string[];
    isMerged: boolean;
  } | null {
    const properties = feature.getProperties();

    // Log everything for debugging
    this.logger.debug('extractRailStationData: raw properties', properties);
    this.logger.debug(
      'extractRailStationData: property keys',
      Object.keys(properties),
    );

    // Filter out geometry property for cleaner logging
    const propsWithoutGeom = { ...properties };
    delete propsWithoutGeom['geometry'];
    this.logger.debug(
      'extractRailStationData: properties (no geom)',
      propsWithoutGeom,
    );

    // Try to get ID from multiple sources
    let featureId: string | number | undefined = properties['id'];

    // If not in properties, try feature.getId() (ST_AsMVT sets this)
    if (!featureId && typeof feature.getId === 'function') {
      featureId = feature.getId();
      this.logger.debug(
        'extractRailStationData: got ID from feature.getId()',
        featureId,
      );
    }

    // If still no ID, generate a hash from the name (fallback)
    if (!featureId && properties['name']) {
      // Simple hash from string
      const name = String(properties['name']);
      featureId = Math.abs(
        name.split('').reduce((acc, char) => {
          return (acc << 5) - acc + char.charCodeAt(0);
        }, 0),
      );
      this.logger.debug(
        'extractRailStationData: generated ID from name hash',
        featureId,
      );
    }

    // Check for required properties
    const checks = {
      hasName: 'name' in properties,
      hasAgencies: 'agencies' in properties,
      hasLines: 'lines' in properties,
      hasIdProperty: 'id' in properties,
      hasFeatureId: !!featureId,
      nameValue: properties['name'],
      agenciesValue: properties['agencies'],
      linesValue: properties['lines'],
      idPropertyValue: properties['id'],
      featureIdValue: featureId,
    };
    this.logger.debug('extractRailStationData: property checks', checks);

    if (!('name' in properties)) {
      this.logger.warn('Feature missing name property', checks);
      return null;
    }

    // Parse arrays - they might be JSON strings from MVT
    const agencies = this.parseJsonArray(properties['agencies']);
    const lines = this.parseJsonArray(properties['lines']);

    this.logger.debug('extractRailStationData: parsed arrays:', {
      agencies,
      lines,
    });

    const lineCodes = getLineCodesFromColorNames(lines);
    const canonicalName = getCanonicalRailStationName(
      String(properties['name'] || ''),
      lineCodes,
    );

    const result = {
      id: String(featureId ?? canonicalName),
      name: canonicalName,
      agencies,
      lines,
      isMerged: Boolean(properties['is_merged']),
    };

    this.logger.debug('extractRailStationData: SUCCESS', result);
    return result;
  }

  /**
   * Extract rail route data from a vector tile feature
   * Based on mvt_rail_routes view columns: id, name, line_number, line_code, color_hex, inferred_agency
   */
  extractRailRouteData(feature: FeatureLike): {
    id: number;
    name?: string;
    lineNumber?: number;
    lineCode?: number;
    colorHex?: string;
    agency: string;
  } | null {
    const properties = feature.getProperties();

    if (!('inferred_agency' in properties)) {
      return null;
    }

    return {
      id: Number(properties['id']),
      name: properties['name'] ? String(properties['name']) : undefined,
      lineNumber: properties['line_number']
        ? Number(properties['line_number'])
        : undefined,
      lineCode: properties['line_code']
        ? Number(properties['line_code'])
        : undefined,
      colorHex: properties['color_hex']
        ? String(properties['color_hex'])
        : undefined,
      agency: String(properties['inferred_agency']),
    };
  }

  extractBusStopData(feature: FeatureLike): {
    stopId: string;
    name: string;
    latitude: number;
    longitude: number;
  } | null {
    const properties = feature.getProperties();
    const stopId = properties['stop_id'];
    const name = properties['stop_name'];

    if (!stopId || !name) {
      return null;
    }

    return {
      stopId: String(stopId),
      name: String(name),
      latitude: Number(properties['stop_lat'] ?? 0),
      longitude: Number(properties['stop_lon'] ?? 0),
    };
  }

  extractBusRouteData(feature: FeatureLike): {
    routeId: string;
    shortName: string;
    longName: string;
    color: string;
    textColor: string;
  } | null {
    const properties = feature.getProperties();
    const routeId = properties['route_id'];

    if (!routeId) {
      return null;
    }

    return {
      routeId: String(routeId),
      shortName: String(properties['route_short_name'] ?? routeId),
      longName: String(properties['route_long_name'] ?? ''),
      color: String(properties['route_color'] ?? ''),
      textColor: String(properties['route_text_color'] ?? ''),
    };
  }

  extractBikeStationData(feature: FeatureLike): BikeStationTileData | null {
    const properties = feature.getProperties();
    const stationId = properties['station_id'];

    if (!stationId || this.isBikeStationCluster(feature)) {
      return null;
    }

    return {
      stationId: String(stationId),
      latitude: Number(properties['latitude'] ?? 0),
      longitude: Number(properties['longitude'] ?? 0),
      capacity:
        properties['capacity'] === null || properties['capacity'] === undefined
          ? null
          : Number(properties['capacity']),
      effectiveCapacity: Number(properties['effective_capacity'] ?? 0),
      numBikesAvailable: Number(properties['num_bikes_available'] ?? 0),
      electricBikesAvailable: Number(
        properties['electric_bikes_available'] ?? 0,
      ),
    };
  }

  extractBikeStationClusterData(
    feature: FeatureLike,
  ): BikeStationClusterTileData | null {
    if (!this.isBikeStationCluster(feature)) {
      return null;
    }

    const properties = feature.getProperties();

    return {
      latitude: Number(properties['latitude'] ?? 0),
      longitude: Number(properties['longitude'] ?? 0),
      capacity:
        properties['capacity'] === null || properties['capacity'] === undefined
          ? null
          : Number(properties['capacity']),
      effectiveCapacity: Number(properties['effective_capacity'] ?? 0),
      numBikesAvailable: Number(properties['num_bikes_available'] ?? 0),
      electricBikesAvailable: Number(
        properties['electric_bikes_available'] ?? 0,
      ),
      stationCount: Number(properties['station_count'] ?? 0),
    };
  }

  isBikeStationCluster(feature: FeatureLike): boolean {
    const cluster = feature.get('cluster');
    const stationCount = Number(feature.get('station_count') ?? 1);

    return (
      cluster === true ||
      cluster === 1 ||
      cluster === 'true' ||
      stationCount > 1
    );
  }

  private normalizeIds(ids: string[]): string[] {
    return Array.from(
      new Set(
        ids
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
          .slice(0, 100),
      ),
    );
  }

  /**
   * Parse JSON array from MVT properties.
   * Backend converts arrays using to_jsonb()::text for MVT compatibility.
   * May receive as: JSON string, JavaScript array, or other formats.
   */
  private parseJsonArray(raw: unknown): string[] {
    this.logger.debug('parseJsonArray input:', {
      type: typeof raw,
      isArray: Array.isArray(raw),
      value: raw,
    });

    if (!raw) {
      this.logger.debug('parseJsonArray: raw is null/undefined');
      return [];
    }

    // If it's already an array, return it (MVT might decode JSON directly)
    if (Array.isArray(raw)) {
      this.logger.debug('parseJsonArray: already an array', raw);
      return raw.map(String);
    }

    // If it's a JSON string from to_jsonb()::text, parse it
    if (typeof raw === 'string') {
      // Trim whitespace
      const trimmed = raw.trim();
      this.logger.debug('parseJsonArray: string input', {
        original: raw,
        trimmed,
      });

      // Empty string or null/undefined strings
      if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
        this.logger.debug('parseJsonArray: empty or null string');
        return [];
      }

      // Check if it looks like JSON array format
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            this.logger.debug(
              'parseJsonArray: successfully parsed JSON',
              parsed,
            );
            return parsed.map(String);
          } else {
            this.logger.warn(
              'parseJsonArray: parsed JSON is not an array',
              parsed,
            );
          }
        } catch (error) {
          this.logger.error('Failed to parse JSON array:', trimmed, error);
        }
      } else {
        // Maybe it's a single value or comma-separated?
        this.logger.warn(
          'parseJsonArray: string does not look like JSON array',
          trimmed,
        );
        // Try splitting by comma as fallback
        if (trimmed.includes(',')) {
          const split = trimmed
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s);
          this.logger.debug('parseJsonArray: split by comma', split);
          return split;
        }
        // Single value
        this.logger.debug('parseJsonArray: treating as single value');
        return [trimmed];
      }
    }

    // Handle case where it might be an object (shouldn't happen but defensive)
    if (typeof raw === 'object' && raw !== null) {
      this.logger.warn('parseJsonArray: unexpected object type', raw);
      // Try to extract if it has array-like properties
      if ('length' in raw) {
        try {
          const result = Array.from(raw as ArrayLike<unknown>).map(String);
          this.logger.debug(
            'parseJsonArray: converted object to array',
            result,
          );
          return result;
        } catch (error) {
          this.logger.error('Failed to convert object to array', error);
        }
      }
      // Try to extract values if it's a plain object
      try {
        const values = Object.values(raw);
        if (values.length > 0) {
          this.logger.debug('parseJsonArray: extracted object values', values);
          return values.map(String);
        }
      } catch (error) {
        this.logger.error('Failed to extract object values', error);
      }
    }

    this.logger.warn('parseJsonArray: could not parse, returning empty array', {
      type: typeof raw,
      raw,
    });
    return [];
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.layers.clear();
    this.sources.clear();
  }
}
