import { CityContextService } from '../../../cities/city-context.service';
import { Service, inject } from '@angular/core';
import { Feature } from 'ol';
import { MapService } from './map.service';
import { MapCameraService, MapFocusRequest } from './map-camera.service';
import { LayerType } from './layers/map-layer.service';
import { MapStateService } from './map-state.service';
import { FeatureCreationSource } from './map.types';
import { FeatureFactoryService } from './feature-factory.service';
import { LoggerService } from '@metro/shared/api';
import { isSubwayShape } from '../../geography/transit-utils';
import { MapSelectionDisplayService } from './map-selection-display.service';
import { getBusRouteIdentity } from '@metro/shared/utils';

@Service()
export class MapDisplayService {
  readonly cityContext = inject(CityContextService);
  private mapService = inject(MapService);
  private readonly camera = inject(MapCameraService);
  private mapState = inject(MapStateService);
  private featureFactory = inject(FeatureFactoryService);
  private logger = inject(LoggerService);
  private readonly selectionDisplayService = inject(MapSelectionDisplayService);

  /** Refresh loaded route shapes and selected feature overlays. */
  updateMapDisplay(): void {
    this.logger.debug('updateMapDisplay() called', {
      subwayStations: this.mapState.subwayStations().length,
      displayedShapes: this.mapState.displayedShapes().length,
      displayedStops: this.mapState.displayedStops().length,
      displayedRoutes: this.mapState.displayedRoutes().length,
      selectedRoutes: Array.from(this.mapState.selectedRoutes()),
    });

    // Use modular approach - only update what's actually changed
    this.updateSubwayStations();
    this.updateSubwayRoutes();
    this.updateBusRoutes();
    this.selectionDisplayService.updateSelectedFeatures();
  }

  /**
   * Update subway routes layer with shapes sourced from the subway system
   */
  private updateSubwayRoutes(): void {
    const layerService = this.mapService.getLayerService();

    const subwayShapes = this.mapState
      .displayedShapes()
      .filter((shape) => isSubwayShape(shape));

    const existingFeatures = layerService.getFeaturesFromLayer(
      LayerType.RAIL_ROUTES,
    );

    const targetIds = new Set(subwayShapes.map((shape) => shape.id));
    const existingFeatureMap = new Map(
      existingFeatures
        .map((feature) => {
          const featureId = feature.getId()?.toString();
          return featureId ? ([featureId, feature] as const) : null;
        })
        .filter((entry): entry is readonly [string, Feature] => !!entry),
    );

    let removedCount = 0;
    existingFeatures.forEach((feature) => {
      const featureId = feature.getId()?.toString();
      const creationSource = feature.getProperties()['creationSource'];

      if (!featureId) {
        return;
      }

      const isManagedBySubwayLayer =
        creationSource === FeatureCreationSource.SUBWAY_SYSTEM ||
        creationSource === undefined;

      if (isManagedBySubwayLayer && !targetIds.has(featureId)) {
        layerService.removeFeature(LayerType.RAIL_ROUTES, feature);
        existingFeatureMap.delete(featureId);
        removedCount++;
      }
    });

    let addedCount = 0;
    let updatedCount = 0;

    subwayShapes.forEach((shape) => {
      const existingFeature = existingFeatureMap.get(shape.id);

      if (existingFeature) {
        const currentProps = existingFeature.getProperties();
        const updatedProps: Record<string, unknown> = {
          ...currentProps,
          creationSource: FeatureCreationSource.SUBWAY_SYSTEM,
          isSubwayRoute: true,
        };

        if (shape.routeInfo) {
          updatedProps['color'] = shape.routeInfo.color;
          updatedProps['textColor'] = shape.routeInfo.textColor;
          updatedProps['routeId'] = shape.routeInfo.routeId;
          updatedProps['shortName'] = shape.routeInfo.shortName;
          updatedProps['longName'] = shape.routeInfo.longName;
        }

        existingFeature.setProperties(updatedProps);
        updatedCount++;
        return;
      }

      const feature = this.featureFactory.createShapeFeature(
        shape,
        FeatureCreationSource.SUBWAY_SYSTEM,
      );
      layerService.addFeature(LayerType.RAIL_ROUTES, feature);
      addedCount++;
    });

    if (addedCount > 0 || removedCount > 0 || updatedCount > 0) {
      this.logger.info('Updated SUBWAY_ROUTES layer', {
        totalShapes: subwayShapes.length,
        added: addedCount,
        removed: removedCount,
        updated: updatedCount,
      });
    } else {
      this.logger.debug('Subway routes layer unchanged', {
        totalShapes: subwayShapes.length,
      });
    }
  }

  /**
   * Update subway stations layer (stable - only changes when new stations are loaded)
   */
  private updateSubwayStations(): void {
    const layerService = this.mapService.getLayerService();

    // Check if subway stations need updating (avoid unnecessary clears)
    const currentFeatures = layerService.getFeaturesFromLayer(
      LayerType.RAIL_STATIONS,
    );
    const targetStations = this.mapState.subwayStations();

    // Only update if count differs (simple optimization)
    if (currentFeatures.length !== targetStations.length) {
      this.logger.debug('Updating subway stations layer');
      layerService.clearLayer(LayerType.RAIL_STATIONS);

      // Use factory for feature creation
      const features = this.featureFactory.createStopFeatures(
        targetStations,
        FeatureCreationSource.SUBWAY_SYSTEM,
      );

      features.forEach((feature) => {
        layerService.addFeature(LayerType.RAIL_STATIONS, feature);
      });

      this.logger.info(`Updated ${targetStations.length} subway stations`);
    } else {
      this.logger.debug('Subway stations unchanged, skipping update');
    }
  }

  private updateBusRoutes(): void {
    const layerService = this.mapService.getLayerService();
    const selectedRouteIds = this.mapState.selectedRouteIds();
    layerService.clearLayer(LayerType.BUS_ROUTES);

    // Add bus route shapes (non-subway routes from displayed shapes)
    // Exclude SPTrans rail data as it now comes from GPKG vector tiles
    let regularShapeCount = 0;
    const routesDerivedFromStops = this.mapState.routesDerivedFromStops();
    this.mapState.displayedShapes().forEach((shape) => {
      if (!isSubwayShape(shape)) {
        // Exclude SPTrans rail data explicitly
        if (
          shape.routeInfo &&
          (shape.routeInfo.routeId.startsWith('METRÔ') ||
            shape.routeInfo.routeId.startsWith('CPTM'))
        ) {
          return; // Skip SPTrans rail routes
        }

        // Use SELECTION source for shapes from explicitly selected routes or routes derived from stop selections
        const isExplicitlySelected =
          shape.routeInfo &&
          selectedRouteIds.has(getBusRouteIdentity(shape.routeInfo));
        const isFromStopSelection =
          shape.routeInfo &&
          routesDerivedFromStops.has(getBusRouteIdentity(shape.routeInfo));
        const creationSource =
          isExplicitlySelected || isFromStopSelection
            ? FeatureCreationSource.SELECTION
            : FeatureCreationSource.ROUTE_DISPLAY;

        const feature = this.featureFactory.createShapeFeature(
          shape,
          creationSource,
        );
        layerService.addFeature(LayerType.BUS_ROUTES, feature);
        regularShapeCount++;
      }
    });

    this.logger.debug('Updated bus route overlays', { shapes: regularShapeCount });
  }

  /** Add a feature to the dedicated selection layer. */
  addToSelectionLayer(feature: Feature): void {
    this.selectionDisplayService.addToSelectionLayer(feature);
  }

  /** Return a selected feature to its category layer or remove it. */
  removeFromSelectionLayer(feature: Feature): void {
    this.selectionDisplayService.removeFromSelectionLayer(feature);
  }

  /** Clear the dedicated selection layer. */
  clearSelectionLayer(): void {
    this.selectionDisplayService.clearSelectionLayer();
  }

  // Map navigation controls
  fitToAllFeatures(): void {
    this.mapService.fitToFeatures();
  }

  centerOnCity(): void {
    this.camera.showOverview(this.cityContext.center(), this.cityContext.city().map.zoom);
  }

  centerOn(coordinates: [number, number], zoom: number): void {
    this.camera.focusPoint(coordinates, zoom);
  }

  createFocusRequest(): MapFocusRequest {
    return this.camera.createFocusRequest();
  }

  fitToCoordinates(
    coordinates: readonly (readonly [number, number])[],
  ): void {
    this.mapService.fitToCoordinates(coordinates);
  }

  clearSelection(): void {
    this.camera.cancel();
    this.mapService.clearSelection();
  }

  showAddressLocation(lat: number, lon: number, name?: string): void {
    const layerService = this.mapService.getLayerService();
    layerService.removeFeaturesByCreationSource(
      LayerType.SELECTION,
      FeatureCreationSource.ADDRESS_SEARCH,
    );

    const feature = this.featureFactory.createAddressLocationFeature(
      lat,
      lon,
      name,
    );
    layerService.addFeature(LayerType.SELECTION, feature);
  }

  clearAddressLocation(): void {
    this.mapService
      .getLayerService()
      .removeFeaturesByCreationSourceFromAllLayers(
        FeatureCreationSource.ADDRESS_SEARCH,
      );
  }

  /**
   * Clear features created by a specific source from all layers
   */
  clearFeaturesBySource(source: FeatureCreationSource): void {
    const layerService = this.mapService.getLayerService();
    layerService.removeFeaturesByCreationSourceFromAllLayers(source);
  }
}
