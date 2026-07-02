import { Injectable, inject } from '@angular/core';
import { FeatureLike } from 'ol/Feature';
import { VectorTileFeatureDetectorService } from './vector-tile-feature-detector.service';
import { VectorTileFeatureExtractorService } from './vector-tile-feature-extractor.service';
import {
  BikeStationClusterTileData,
  BikeStationTileData,
  BusRouteTileData,
  BusStopTileData,
  RailRouteTileData,
  RailStationTileData,
} from './vector-tile-feature.types';
import { VectorTileLayerType } from './vector-tile-layer.config';

export type {
  BikeStationClusterTileData,
  BikeStationTileData,
  BusRouteTileData,
  BusStopTileData,
  RailRouteTileData,
  RailStationTileData,
} from './vector-tile-feature.types';

@Injectable({
  providedIn: 'root',
})
export class VectorTileFeatureDataService {
  private readonly detector = inject(VectorTileFeatureDetectorService);
  private readonly extractor = inject(VectorTileFeatureExtractorService);

  isVectorTileFeature(feature: FeatureLike): boolean {
    return this.detector.isVectorTileFeature(feature);
  }

  getFeatureLayerType(feature: FeatureLike): VectorTileLayerType | null {
    return this.detector.getFeatureLayerType(feature);
  }

  extractRailStationData(feature: FeatureLike): RailStationTileData | null {
    return this.extractor.extractRailStationData(feature);
  }

  extractRailRouteData(feature: FeatureLike): RailRouteTileData | null {
    return this.extractor.extractRailRouteData(feature);
  }

  extractBusStopData(feature: FeatureLike): BusStopTileData | null {
    return this.extractor.extractBusStopData(feature);
  }

  extractBusRouteData(feature: FeatureLike): BusRouteTileData | null {
    return this.extractor.extractBusRouteData(feature);
  }

  extractBikeStationData(feature: FeatureLike): BikeStationTileData | null {
    return this.extractor.extractBikeStationData(feature);
  }

  extractBikeStationClusterData(
    feature: FeatureLike,
  ): BikeStationClusterTileData | null {
    return this.extractor.extractBikeStationClusterData(feature);
  }

  isBikeStationCluster(feature: FeatureLike): boolean {
    return this.detector.isBikeStationCluster(feature);
  }
}
