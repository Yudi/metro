import type { LoggerService } from '@metro/shared/api';
import { MapLayerService, LayerType } from './layers/map-layer.service';
import { FeatureCreationSource } from './map.types';

/** Marks route display features that remain visible because they are selected. */
export function updatePreservedFeaturesCreationSource(
  layerService: MapLayerService,
  logger: LoggerService,
  layerType: LayerType,
  selectedIds: Set<string>,
): void {
  const features = layerService.getFeaturesFromLayer(layerType);
  for (const feature of features) {
    const featureId = feature.getId()?.toString();
    const currentSource = feature.getProperties()['creationSource'];
    if (
      featureId &&
      selectedIds.has(featureId) &&
      currentSource === FeatureCreationSource.ROUTE_DISPLAY
    ) {
      feature.getProperties()['creationSource'] =
        FeatureCreationSource.SELECTION;
      logger.debug('Updated feature creation source', {
        featureId,
        from: currentSource,
        to: FeatureCreationSource.SELECTION,
      });
    }
  }
}
