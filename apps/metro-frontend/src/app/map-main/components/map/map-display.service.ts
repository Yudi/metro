import { Service, inject } from '@angular/core';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { MapService } from './map.service';
import { LayerType } from './layers/map-layer.service';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import { MapStateService } from './map-state.service';
import { FeatureCreationSource } from './map.types';
import { FeatureFactoryService } from './feature-factory.service';
import { LoggerService } from '@metro/shared/api';
import { isSubwayShape } from '../../geography/transit-utils';
import { fromLonLat } from 'ol/proj';
import { SAO_PAULO_CITY_CENTER_COORDINATES } from '@metro/shared/utils';
import { createBikeStationFeatureProperties } from './layers/bike-feature-properties.utils';
import { MapSelectionDisplayService } from './map-selection-display.service';
import { updatePreservedFeaturesCreationSource } from './map-feature-source.utils';

@Service()
export class MapDisplayService {
  private mapService = inject(MapService);
  private geographyService = inject(GeographyGraphQLService);
  private mapState = inject(MapStateService);
  private featureFactory = inject(FeatureFactoryService);
  private logger = inject(LoggerService);
  private readonly selectionDisplayService = inject(MapSelectionDisplayService);

  /**
   * Update map display with layered approach
   * - Subway stations go to subway-stations layer
   * - Subway routes go to subway-routes layer (if not selected)
   * - Selected items go to selection layer
   * - Regular stops/routes use legacy system
   */
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
    this.updateBikeStations();
    this.updateSubwayRoutes();
    this.updateBusRoutesAndStops();
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

  /**
   * Update bike stations layer with cached bike share data
   */
  private updateBikeStations(): void {
    const layerService = this.mapService.getLayerService();
    const bikeStations = this.mapState.bikeStations();

    if (bikeStations.length === 0) {
      if (layerService.getFeaturesFromLayer(LayerType.BIKE).length > 0) {
        layerService.clearLayer(LayerType.BIKE);
      }
      return;
    }

    const existingFeatures = layerService.getFeaturesFromLayer(LayerType.BIKE);
    const existingMap = new Map(
      existingFeatures
        .map((feature) => {
          const id = feature.getId()?.toString();
          return id ? ([id, feature] as const) : null;
        })
        .filter((entry): entry is readonly [string, Feature] => !!entry),
    );

    let added = 0;
    let updated = 0;
    const seen = new Set<string>();
    const selectedBikeStations = this.mapState.selectedBikeStations();

    bikeStations.forEach((station) => {
      const featureId = station.stationId;
      seen.add(featureId);
      const existing = existingMap.get(featureId);
      const isSelected = selectedBikeStations.has(station.stationId);

      if (existing) {
        const props = existing.getProperties();
        existing.setProperties({
          ...props,
          ...createBikeStationFeatureProperties(station, isSelected),
        });

        const geometry = existing.getGeometry();
        if (geometry instanceof Point) {
          const current = geometry.getCoordinates();
          const target = fromLonLat([station.longitude, station.latitude]);
          if (current[0] !== target[0] || current[1] !== target[1]) {
            geometry.setCoordinates(target);
          }
        }

        updated++;
      } else {
        const feature = this.featureFactory.createBikeStationFeature(
          station,
          isSelected,
        );
        layerService.addFeature(LayerType.BIKE, feature);
        added++;
      }
    });

    const removedFeatures = existingFeatures.filter((feature) => {
      const id = feature.getId()?.toString();
      return id ? !seen.has(id) : true;
    });

    removedFeatures.forEach((feature) => {
      layerService.removeFeature(LayerType.BIKE, feature);
    });

    const removed = removedFeatures.length;

    if (added || removed || updated) {
      this.logger.info('Updated BIKE layer', {
        stations: bikeStations.length,
        added,
        removed,
        updated,
      });
    }
  }

  /**
   * Update bus routes and stops layers (mode-dependent content)
   */
  private updateBusRoutesAndStops(): void {
    const layerService = this.mapService.getLayerService();

    this.logger.debug('Updating bus routes and stops');

    // Get currently selected route and stop IDs to preserve them
    const selectedRouteIds = this.mapState.selectedRouteIds();
    const selectedStopIds = this.mapState.selectedStopIds();
    const allSelectedIds = new Set([...selectedRouteIds, ...selectedStopIds]);

    // Clear features based on display mode
    if (this.mapState.displayMode() === 'nearby') {
      // Clear NEARBY features - these will be re-added from current displayedStops
      layerService.removeFeaturesByCreationSource(
        LayerType.BUS_ROUTES,
        FeatureCreationSource.NEARBY,
      );
      layerService.removeFeaturesByCreationSource(
        LayerType.BUS_STOPS,
        FeatureCreationSource.NEARBY,
      );
      // Clear ROUTE_DISPLAY features, BUT preserve selected ones
      layerService.removeFeaturesByCreationSourceExceptSelected(
        LayerType.BUS_ROUTES,
        FeatureCreationSource.ROUTE_DISPLAY,
        allSelectedIds,
      );
      layerService.removeFeaturesByCreationSourceExceptSelected(
        LayerType.BUS_STOPS,
        FeatureCreationSource.ROUTE_DISPLAY,
        allSelectedIds,
      );
      // Also clear SELECTION features that are no longer selected
      layerService.removeFeaturesByCreationSourceExceptSelected(
        LayerType.BUS_ROUTES,
        FeatureCreationSource.SELECTION,
        allSelectedIds,
      );
      layerService.removeFeaturesByCreationSourceExceptSelected(
        LayerType.BUS_STOPS,
        FeatureCreationSource.SELECTION,
        allSelectedIds,
      );
      // Update preserved features to have SELECTION as creation source
      updatePreservedFeaturesCreationSource(
        layerService,
        this.logger,
        LayerType.BUS_ROUTES,
        allSelectedIds,
      );
      updatePreservedFeaturesCreationSource(
        layerService,
        this.logger,
        LayerType.BUS_STOPS,
        allSelectedIds,
      );
    } else {
      // In selected mode: clear NEARBY, ROUTE_DISPLAY, and SELECTION features
      // This ensures removed routes/stops are properly cleared from the map
      layerService.removeFeaturesByCreationSource(
        LayerType.BUS_ROUTES,
        FeatureCreationSource.NEARBY,
      );
      layerService.removeFeaturesByCreationSource(
        LayerType.BUS_ROUTES,
        FeatureCreationSource.ROUTE_DISPLAY,
      );
      layerService.removeFeaturesByCreationSource(
        LayerType.BUS_ROUTES,
        FeatureCreationSource.SELECTION,
      );
      layerService.removeFeaturesByCreationSource(
        LayerType.BUS_STOPS,
        FeatureCreationSource.NEARBY,
      );
      layerService.removeFeaturesByCreationSource(
        LayerType.BUS_STOPS,
        FeatureCreationSource.ROUTE_DISPLAY,
      );
      layerService.removeFeaturesByCreationSource(
        LayerType.BUS_STOPS,
        FeatureCreationSource.SELECTION,
      );
    }

    // Add bus route shapes (non-subway routes from displayed shapes)
    // Exclude SPTrans rail data as it now comes from GPKG vector tiles
    let regularShapeCount = 0;
    const routesDerivedFromStops = this.mapState.routesDerivedFromStops();
    const defaultCreationSource =
      this.mapState.displayMode() === 'nearby'
        ? FeatureCreationSource.NEARBY
        : FeatureCreationSource.ROUTE_DISPLAY;

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
          shape.routeInfo && selectedRouteIds.has(shape.routeInfo.routeId);
        const isFromStopSelection =
          shape.routeInfo &&
          routesDerivedFromStops.has(shape.routeInfo.routeId);
        const creationSource =
          isExplicitlySelected || isFromStopSelection
            ? FeatureCreationSource.SELECTION
            : defaultCreationSource;

        const feature = this.featureFactory.createShapeFeature(
          shape,
          creationSource,
        );
        layerService.addFeature(LayerType.BUS_ROUTES, feature);
        regularShapeCount++;
      }
    });

    // Add bus stops to BUS_STOPS layer (non-subway stops from displayed stops)
    // Exclude SPTrans rail stations as they now come from GPKG vector tiles
    let busStopCount = 0;
    this.mapState.displayedStops().forEach((stop) => {
      // Exclude rail stations using multiple checks
      if (!stop.isSubwayStation && !this.isRailStopFromSPTrans(stop)) {
        const feature = this.featureFactory.createStopFeature(
          stop,
          defaultCreationSource,
        );
        layerService.addFeature(LayerType.BUS_STOPS, feature);
        busStopCount++;
      }
    });

    this.logger.info(
      `Updated BUS layers: ${regularShapeCount} shapes in BUS_ROUTES, ${busStopCount} stops in BUS_STOPS`,
    );
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

  /**
   * Check if a stop is a rail station (SPTrans data - should be excluded)
   * Rail stations from SPTrans GTFS have stop_id <= 19045
   */
  private isRailStopFromSPTrans(stop: {
    stopId: string;
    isSubwayStation?: boolean;
  }): boolean {
    if (stop.isSubwayStation) return true;
    const stopIdNum = parseInt(stop.stopId, 10);
    return !isNaN(stopIdNum) && stopIdNum <= 19045;
  }

  // Map navigation controls
  fitToAllFeatures(): void {
    this.mapService.fitToFeatures();
  }

  centerOnSaoPaulo(): void {
    this.mapService.centerOn(SAO_PAULO_CITY_CENTER_COORDINATES, 11);
  }

  centerOn(coordinates: [number, number], zoom: number): void {
    this.mapService.centerOn(coordinates, zoom);
  }

  clearSelection(): void {
    this.mapService.clearSelection();
  }

  /**
   * Clear features created by nearby mode from all layers
   */
  clearNearbyFeatures(): void {
    const layerService = this.mapService.getLayerService();
    layerService.removeFeaturesByCreationSourceFromAllLayers(
      FeatureCreationSource.NEARBY,
    );
  }

  showExploreLocation(lat: number, lon: number, name?: string): void {
    const layerService = this.mapService.getLayerService();
    layerService.removeFeaturesByCreationSource(
      LayerType.SELECTION,
      FeatureCreationSource.EXPLORE,
    );

    const feature = this.featureFactory.createExploreLocationFeature(
      lat,
      lon,
      name,
    );
    layerService.addFeature(LayerType.SELECTION, feature);
  }

  clearExploreLocation(): void {
    this.mapService
      .getLayerService()
      .removeFeaturesByCreationSourceFromAllLayers(
        FeatureCreationSource.EXPLORE,
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
