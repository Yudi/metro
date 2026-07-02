import { Injectable, inject, signal } from '@angular/core';
import { LoggerService } from '@metro/shared/api';
import { Map as OLMap } from 'ol';
import MVT from 'ol/format/MVT';
import { FeatureLike } from 'ol/Feature';
import VectorTileLayer from 'ol/layer/VectorTile';
import { Style } from 'ol/style';
import VectorTileSource from 'ol/source/VectorTile';
import { environment } from '../../../environments/environment';
import {
  createInitialLayerVisibility,
  createVectorTileLayerConfigs,
  VectorTileLayerConfig,
  VectorTileLayerType,
} from './vector-tile-layer.config';
import {
  BikeStationClusterTileData,
  BikeStationTileData,
  BusRouteTileData,
  BusStopTileData,
  RailRouteTileData,
  RailStationTileData,
  VectorTileFeatureDataService,
} from './vector-tile-feature-data.service';
import { VectorTileStyleService } from './vector-tile-style.service';

export { VectorTileLayerType } from './vector-tile-layer.config';
export type {
  BikeStationClusterTileData,
  BikeStationTileData,
  BusRouteTileData,
  BusStopTileData,
  RailRouteTileData,
  RailStationTileData,
} from './vector-tile-feature-data.service';

export interface BusStopTileFilter {
  routeIds: string[];
  stopIds: string[];
  nearby: {
    lat: number;
    lon: number;
    radiusMeters: number;
  } | null;
}

/**
 * Manages OpenLayers vector tile layer lifecycle and tile URL filtering.
 * Styling and feature-data parsing live in category-specific services.
 */
@Injectable({
  providedIn: 'root',
})
export class VectorTileLayerService {
  private readonly logger = inject(LoggerService);
  private readonly featureData = inject(VectorTileFeatureDataService);
  private readonly styleService = inject(VectorTileStyleService);

  private readonly baseUrl = environment.production ? '' : '';
  private readonly layerVisibility = signal<Map<VectorTileLayerType, boolean>>(
    createInitialLayerVisibility(),
  );
  private readonly sources = new Map<VectorTileLayerType, VectorTileSource>();
  private readonly layers = new Map<VectorTileLayerType, VectorTileLayer>();
  private currentZoomLevel = signal<number | null>(null);

  private busRouteIds: string[] = [];
  private busStopFilter: BusStopTileFilter = {
    routeIds: [],
    stopIds: [],
    nearby: null,
  };

  readonly layerConfigs = signal<VectorTileLayerConfig[]>(
    createVectorTileLayerConfigs(environment.apiUrl),
  );

  constructor() {
    this.initializeLayers();
  }

  addLayersToMap(map: OLMap): void {
    for (const layer of this.layers.values()) {
      map.addLayer(layer);
    }
    this.logger.debug('Vector tile layers added to map', {
      layers: Array.from(this.layers.keys()),
    });
  }

  removeLayersFromMap(map: OLMap): void {
    for (const layer of this.layers.values()) {
      map.removeLayer(layer);
    }
  }

  getLayer(layerType: VectorTileLayerType): VectorTileLayer | undefined {
    return this.layers.get(layerType);
  }

  toggleLayer(layerType: VectorTileLayerType): void {
    const layer = this.layers.get(layerType);
    if (!layer) return;

    const config = this.layerConfigs().find((item) => item.id === layerType);
    if (!config || !config.toggleable) return;

    const newVisibility = !layer.getVisible();

    if (
      layerType === VectorTileLayerType.RAIL_ROUTES &&
      newVisibility === true
    ) {
      this.setLayerVisibility(VectorTileLayerType.RAIL_STATIONS, true);
    } else if (
      layerType === VectorTileLayerType.RAIL_STATIONS &&
      newVisibility === false
    ) {
      this.setLayerVisibility(VectorTileLayerType.RAIL_ROUTES, false);
    }

    layer.setVisible(newVisibility);
    this.updateLayerVisibilityState(layerType, newVisibility);

    this.logger.debug('Vector tile layer visibility toggled', {
      layerType,
      visible: newVisibility,
    });
  }

  setLayerVisibility(layerType: VectorTileLayerType, visible: boolean): void {
    const layer = this.layers.get(layerType);
    if (!layer) return;

    layer.setVisible(visible);
    this.updateLayerVisibilityState(layerType, visible);
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

  isLayerVisible(layerType: VectorTileLayerType): boolean {
    return this.layerVisibility().get(layerType) ?? false;
  }

  setZoomLevel(zoom: number | null): void {
    if (this.currentZoomLevel() !== zoom) {
      this.currentZoomLevel.set(zoom);
      for (const layer of this.layers.values()) {
        layer.changed();
      }
    }
  }

  refreshLayers(): void {
    for (const source of this.sources.values()) {
      source.refresh();
    }
    this.logger.debug('Vector tile layers refreshed');
  }

  getAllLayers(): VectorTileLayer[] {
    return Array.from(this.layers.values());
  }

  isVectorTileFeature(feature: FeatureLike): boolean {
    return this.featureData.isVectorTileFeature(feature);
  }

  getFeatureLayerType(feature: FeatureLike): VectorTileLayerType | null {
    return this.featureData.getFeatureLayerType(feature);
  }

  extractRailStationData(feature: FeatureLike): RailStationTileData | null {
    return this.featureData.extractRailStationData(feature);
  }

  extractRailRouteData(feature: FeatureLike): RailRouteTileData | null {
    return this.featureData.extractRailRouteData(feature);
  }

  extractBusStopData(feature: FeatureLike): BusStopTileData | null {
    return this.featureData.extractBusStopData(feature);
  }

  extractBusRouteData(feature: FeatureLike): BusRouteTileData | null {
    return this.featureData.extractBusRouteData(feature);
  }

  extractBikeStationData(feature: FeatureLike): BikeStationTileData | null {
    return this.featureData.extractBikeStationData(feature);
  }

  extractBikeStationClusterData(
    feature: FeatureLike,
  ): BikeStationClusterTileData | null {
    return this.featureData.extractBikeStationClusterData(feature);
  }

  isBikeStationCluster(feature: FeatureLike): boolean {
    return this.featureData.isBikeStationCluster(feature);
  }

  destroy(): void {
    this.layers.clear();
    this.sources.clear();
  }

  private initializeLayers(): void {
    for (const config of this.layerConfigs()) {
      this.createLayer(config);
    }
  }

  private createLayer(config: VectorTileLayerConfig): void {
    const source = new VectorTileSource({
      format: new MVT({
        idProperty: 'id',
      }),
      tileUrlFunction: (tileCoord) => this.buildTileUrl(config, tileCoord),
      tileSize: 512,
    });

    this.sources.set(config.id, source);

    const layer = new VectorTileLayer({
      source,
      style: (feature) => this.getStyleForLayer(config.id, feature),
      zIndex: config.zIndex,
      visible: config.visible,
      renderMode: 'hybrid',
      preload: 1,
    });

    this.layers.set(config.id, layer);
  }

  private getStyleForLayer(
    layerType: VectorTileLayerType,
    feature: FeatureLike,
  ): Style | Style[] {
    return this.styleService.getStyleForLayer(
      layerType,
      feature,
      this.currentZoomLevel(),
    );
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

  private updateLayerVisibilityState(
    layerType: VectorTileLayerType,
    visible: boolean,
  ): void {
    const newMap = new Map(this.layerVisibility());
    newMap.set(layerType, visible);
    this.layerVisibility.set(newMap);

    const updatedConfigs = this.layerConfigs().map((config) =>
      config.id === layerType ? { ...config, visible } : config,
    );
    this.layerConfigs.set(updatedConfigs);
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
}
