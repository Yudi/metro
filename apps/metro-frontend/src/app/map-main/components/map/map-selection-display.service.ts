import { Service, computed, inject } from '@angular/core';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import type { BusStopGraphQL } from '../../geography/geography-graphql.service';
import { createBikeStationFeatureProperties } from './layers/bike-feature-properties.utils';
import { MapService } from './map.service';
import { LayerType } from './layers/map-layer.service';
import { FeatureFactoryService } from './feature-factory.service';
import { FeatureCreationSource, SelectedStop } from './map.types';
import { MapStateService } from './map-state.service';

/** Keeps selected map features in their dedicated layer. */
@Service()
export class MapSelectionDisplayService {
  private readonly mapService = inject(MapService);
  private readonly mapState = inject(MapStateService);
  private readonly featureFactory = inject(FeatureFactoryService);
  private readonly stopsById = computed(() => new Map(
    this.mapState.displayedStops().map((stop) => [stop.stopId, stop]),
  ));
  private readonly bikesById = computed(() => new Map(
    this.mapState.bikeStations().map((station) => [station.stationId, station]),
  ));
  private readonly stopSnapshots = new WeakMap<Feature, BusStopGraphQL | SelectedStop>();

  updateSelectedFeatures(): void {
    const layerService = this.mapService.getLayerService();
    const selectedStops = this.mapState.selectedStops();
    const selectedBikes = this.mapState.selectedBikeStations();
    const stopFeatures = new Map<string, Feature>();
    const bikeFeatures = new Map<string, Feature>();

    for (const feature of layerService.getFeaturesFromLayer(LayerType.SELECTION)) {
      if (feature.get('creationSource') === FeatureCreationSource.ADDRESS_SEARCH) continue;
      const stopId = feature.get('stopId') as string | undefined;
      const stationId = feature.get('stationId') as string | undefined;
      if (stopId && selectedStops.has(stopId)) {
        stopFeatures.set(stopId, feature);
      } else if (stationId && selectedBikes.has(stationId)) {
        bikeFeatures.set(stationId, feature);
      } else {
        layerService.removeFeature(LayerType.SELECTION, feature);
      }
    }

    if (selectedStops.size) {
      const stops = this.stopsById();
      for (const [id, selection] of selectedStops) {
        const snapshot = stops.get(id) ?? selection;
        const existing = stopFeatures.get(id);
        if (existing && this.stopSnapshots.get(existing) === snapshot) continue;
        const stop: BusStopGraphQL = stops.get(id) ?? {
          ...selection, stopId: id, isSubwayStation: selection.isSubwayStation ?? false,
        };
        if (existing) {
          this.featureFactory.updateStopFeature(existing, stop);
          this.stopSnapshots.set(existing, snapshot);
        } else {
          const feature = this.featureFactory.createStopFeature(stop, FeatureCreationSource.SELECTION);
          this.stopSnapshots.set(feature, snapshot);
          layerService.addFeature(LayerType.SELECTION, feature);
        }
      }
    }

    if (selectedBikes.size) {
      const bikes = this.bikesById();
      for (const id of selectedBikes.keys()) {
        const station = bikes.get(id);
        if (!station) continue;
        const existing = bikeFeatures.get(id);
        if (!existing) {
          layerService.addFeature(LayerType.SELECTION, this.featureFactory.createBikeStationFeature(
            station, true, FeatureCreationSource.SELECTION,
          ));
          continue;
        }
        if (existing.get('stationData') === station) continue;
        const styleChanged = existing.get('bikesAvailable') !== station.numBikesAvailable ||
          existing.get('effectiveCapacity') !== station.effectiveCapacity ||
          existing.get('hasElectricBikesAvailable') !== station.hasElectricBikesAvailable;
        // Detail timestamps and availability metadata do not invalidate the render batch.
        existing.setProperties(createBikeStationFeatureProperties(
          station, true, FeatureCreationSource.SELECTION,
        ), true);
        if (styleChanged) existing.changed();
        const geometry = existing.getGeometry();
        if (geometry instanceof Point) {
          const coordinates = fromLonLat([station.longitude, station.latitude]);
          const previous = geometry.getCoordinates();
          if (previous[0] !== coordinates[0] || previous[1] !== coordinates[1]) {
            geometry.setCoordinates(coordinates);
          }
        }
      }
    }
  }
}
