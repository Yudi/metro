import { Service } from '@angular/core';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { BusStopGraphQL } from '../../geography/geography-graphql.service';
import {
  FeatureCreationSource,
  BikeStation,
} from './map.types';
import { createBikeStationFeatureProperties } from './layers/bike-feature-properties.utils';

/**
 * Factory service for creating OpenLayers features from GraphQL data
 * Centralizes feature creation logic to ensure consistency
 */
@Service()
export class FeatureFactoryService {
  /**
   * Create OpenLayers Feature from a stop
   */
  createStopFeature(
    stop: BusStopGraphQL,
    creationSource: FeatureCreationSource = FeatureCreationSource.ROUTE_DISPLAY,
  ): Feature {
    const geometry = new Point(fromLonLat([stop.longitude, stop.latitude]));
    const feature = new Feature({ geometry });

    feature.setProperties(this.stopProperties(stop, creationSource));
    feature.setId(stop.id);
    return feature;
  }

  /** Retain the feature and render batch when a detail snapshot changes. */
  updateStopFeature(feature: Feature, stop: BusStopGraphQL): void {
    const properties = this.stopProperties(stop, FeatureCreationSource.SELECTION);
    const changed = Object.fromEntries(Object.entries(properties).filter(([key, value]) => {
      const previous: unknown = feature.get(key);
      return Array.isArray(value) && Array.isArray(previous)
        ? value.length !== previous.length || value.some((item, index) => item !== previous[index])
        : previous !== value;
    }));
    if (Object.keys(changed).length) feature.setProperties(changed);
    const geometry = feature.getGeometry();
    if (geometry instanceof Point) {
      const coordinates = fromLonLat([stop.longitude, stop.latitude]);
      const previous = geometry.getCoordinates();
      if (previous[0] !== coordinates[0] || previous[1] !== coordinates[1]) {
        geometry.setCoordinates(coordinates);
      }
    }
  }

  private stopProperties(
    stop: BusStopGraphQL,
    creationSource: FeatureCreationSource,
  ): Record<string, unknown> {
    return {
      id: stop.id,
      stopId: stop.stopId,
      name: stop.name,
      isSubwayStation: stop.isSubwayStation,
      agencies: stop.agencies || [],
      sourceAgency: stop.sourceAgency,
      sourceId: stop.sourceId,
      platformCode: stop.platformCode,
      mergedStopIds: stop.mergedStopIds,
      type: 'stop',
      creationSource,
    };
  }

  createBikeStationFeature(
    station: BikeStation,
    isSelected = false,
    creationSource: FeatureCreationSource = FeatureCreationSource.BIKE,
  ): Feature {
    const geometry = new Point(
      fromLonLat([station.longitude, station.latitude]),
    );
    const feature = new Feature({ geometry });

    feature.setProperties(
      createBikeStationFeatureProperties(station, isSelected, creationSource),
    );

    feature.setId(station.stationId);
    return feature;
  }

  createAddressLocationFeature(
    lat: number,
    lon: number,
    name = 'Endereço encontrado',
  ): Feature {
    const geometry = new Point(fromLonLat([lon, lat]));
    const feature = new Feature({ geometry });

    feature.setProperties({
      id: 'address-location',
      name,
      latitude: lat,
      longitude: lon,
      type: 'address_location',
      creationSource: FeatureCreationSource.ADDRESS_SEARCH,
    });

    feature.setId('address-location');
    return feature;
  }
}
