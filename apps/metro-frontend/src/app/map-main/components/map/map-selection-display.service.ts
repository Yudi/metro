import { Service, inject } from '@angular/core';
import { Feature } from 'ol';
import { MapService } from './map.service';
import { LayerType } from './layers/map-layer.service';
import { FeatureFactoryService } from './feature-factory.service';
import { LoggerService } from '@metro/shared/api';
import { FeatureCreationSource } from './map.types';
import { MapStateService } from './map-state.service';

/** Keeps selected map features in their dedicated layer. */
@Service()
export class MapSelectionDisplayService {
  private readonly mapService = inject(MapService);
  private readonly mapState = inject(MapStateService);
  private readonly featureFactory = inject(FeatureFactoryService);
  private readonly logger = inject(LoggerService);

  updateSelectedFeatures(): void {
    const layerService = this.mapService.getLayerService();
    const selectedRouteIds = new Set(this.mapState.selectedRoutes().keys());
    const selectedStopIds = new Set(this.mapState.selectedStops().keys());
    const selectedBikeStationIds = new Set(
      this.mapState.selectedBikeStations().keys(),
    );
    const currentSelectionFeatures = layerService.getFeaturesFromLayer(
      LayerType.SELECTION,
    );
    const targetSelectionIds = new Set([
      ...selectedRouteIds,
      ...selectedStopIds,
      ...selectedBikeStationIds,
      ...this.mapState
        .displayedShapes()
        .filter(
          (shape) =>
            shape.routeInfo && selectedRouteIds.has(shape.routeInfo.routeId),
        )
        .map((shape) => shape.id),
    ]);

    const featuresToRemove = currentSelectionFeatures.filter((feature) => {
      const featureId = feature.getId()?.toString();
      const routeId = feature.getProperties()['routeId'] as string | undefined;
      const stopId = feature.getProperties()['stopId'] as string | undefined;
      const stationId = feature.getProperties()['stationId'] as
        | string
        | undefined;
      const creationSource = feature.getProperties()['creationSource'] as
        | FeatureCreationSource
        | undefined;

      if (creationSource === FeatureCreationSource.EXPLORE) return false;
      if (featureId && targetSelectionIds.has(featureId)) return false;
      if (routeId && selectedRouteIds.has(routeId)) return false;
      if (stopId && selectedStopIds.has(stopId)) return false;
      if (stationId && selectedBikeStationIds.has(stationId)) return false;
      return true;
    });

    featuresToRemove.forEach((feature) => {
      layerService.removeFeature(LayerType.SELECTION, feature);
      this.logger.debug('Removed deselected feature from SELECTION layer', {
        featureId: feature.getId(),
      });
    });

    if (
      selectedRouteIds.size === 0 &&
      selectedStopIds.size === 0 &&
      selectedBikeStationIds.size === 0
    ) {
      this.logger.debug('No selections remaining');
      return;
    }

    this.logger.debug('Updating selection layer');

    this.mapState.displayedShapes().forEach((shape) => {
      if (shape.routeInfo && selectedRouteIds.has(shape.routeInfo.routeId)) {
        const feature = this.featureFactory.createShapeFeature(
          shape,
          FeatureCreationSource.SELECTION,
        );
        const alreadyExists = currentSelectionFeatures.some(
          (existing) =>
            existing.getId() === feature.getId() ||
            this.featuresAreEqual(existing, feature),
        );
        if (!alreadyExists) {
          layerService.addFeature(LayerType.SELECTION, feature);
          this.logger.debug(
            `Added selected shape ${shape.id} to SELECTION layer`,
          );
        }
      }
    });

    this.mapState.displayedStops().forEach((stop) => {
      if (selectedStopIds.has(stop.stopId)) {
        const feature = this.featureFactory.createStopFeature(
          stop,
          FeatureCreationSource.SELECTION,
        );
        const alreadyExists = currentSelectionFeatures.some(
          (existing) =>
            existing.getId() === feature.getId() ||
            this.featuresAreEqual(existing, feature),
        );
        if (!alreadyExists) {
          layerService.addFeature(LayerType.SELECTION, feature);
          this.logger.debug(
            `Added selected stop ${stop.stopId} to SELECTION layer`,
          );
        }
      }
    });

    this.mapState.bikeStations().forEach((station) => {
      if (selectedBikeStationIds.has(station.stationId)) {
        const feature = this.featureFactory.createBikeStationFeature(
          station,
          true,
          FeatureCreationSource.SELECTION,
        );
        const alreadyExists = currentSelectionFeatures.some(
          (existing) => existing.getId() === feature.getId(),
        );
        if (!alreadyExists) {
          layerService.addFeature(LayerType.SELECTION, feature);
          this.logger.debug(
            `Added selected bike station ${station.stationId} to SELECTION layer`,
          );
        }
      }
    });
  }

  addToSelectionLayer(feature: Feature): void {
    const layerService = this.mapService.getLayerService();
    feature.setProperties({
      ...feature.getProperties(),
      creationSource: FeatureCreationSource.SELECTION,
    });

    const subwayRouteFeatures = layerService.getFeaturesFromLayer(
      LayerType.RAIL_ROUTES,
    );
    const matchingFeature = subwayRouteFeatures.find(
      (existing) =>
        existing.getId() === feature.getId() ||
        this.featuresAreEqual(existing, feature),
    );

    if (matchingFeature) {
      matchingFeature.setProperties({
        ...matchingFeature.getProperties(),
        creationSource: FeatureCreationSource.SELECTION,
      });
      layerService.moveFeature(
        matchingFeature,
        LayerType.RAIL_ROUTES,
        LayerType.SELECTION,
      );
    } else {
      layerService.addFeature(LayerType.SELECTION, feature);
    }
  }

  removeFromSelectionLayer(feature: Feature): void {
    const layerService = this.mapService.getLayerService();
    if (feature.getProperties()['isSubwayRoute']) {
      layerService.moveFeature(
        feature,
        LayerType.SELECTION,
        LayerType.RAIL_ROUTES,
      );
    } else {
      layerService.removeFeature(LayerType.SELECTION, feature);
    }
  }

  clearSelectionLayer(): void {
    this.mapService.getLayerService().clearLayer(LayerType.SELECTION);
  }

  private featuresAreEqual(first: Feature, second: Feature): boolean {
    const firstId = first.getProperties()['id'];
    const secondId = second.getProperties()['id'];
    return firstId && secondId && firstId === secondId;
  }
}
