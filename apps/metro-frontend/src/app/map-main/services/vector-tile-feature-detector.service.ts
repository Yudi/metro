import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@metro/shared/api';
import { FeatureLike } from 'ol/Feature';
import { VectorTileLayerType } from './vector-tile-layer.config';

@Injectable({
  providedIn: 'root',
})
export class VectorTileFeatureDetectorService {
  private readonly logger = inject(LoggerService);

  isVectorTileFeature(feature: FeatureLike): boolean {
    const properties = feature.getProperties();

    if ('layer' in properties) {
      this.logger.debug(
        'Feature has layer property (MVT feature):',
        properties['layer'],
      );
      return true;
    }

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

  getFeatureLayerType(feature: FeatureLike): VectorTileLayerType | null {
    const properties = feature.getProperties();

    this.logger.debug('getFeatureLayerType: analyzing feature', {
      propertyKeys: Object.keys(properties),
      hasLayer: 'layer' in properties,
      layerValue: properties['layer'],
    });

    if ('layer' in properties) {
      const layerType = this.getLayerTypeFromMvtName(properties['layer']);
      if (layerType) {
        this.logger.debug(
          'Feature has MVT layer property:',
          properties['layer'],
        );
        return layerType;
      }
    }

    const layerType = this.getLayerTypeFromProperties(properties);
    if (layerType) {
      return layerType;
    }

    this.logger.warn('Could not determine feature layer type', properties);
    return null;
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

  private getLayerTypeFromMvtName(
    rawLayerName: unknown,
  ): VectorTileLayerType | null {
    const layerName = String(rawLayerName);

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

    return null;
  }

  private getLayerTypeFromProperties(
    properties: Record<string, unknown>,
  ): VectorTileLayerType | null {
    if (
      'name' in properties &&
      'agencies' in properties &&
      'lines' in properties
    ) {
      this.logger.debug('Detected as rail station by properties');
      return VectorTileLayerType.RAIL_STATIONS;
    }

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

    return null;
  }
}
