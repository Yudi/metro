import { Injectable } from '@angular/core';
import { Feature } from 'ol';
import { Point, LineString } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { BusStopGraphQL } from '../services/geography-graphql.service';
import {
  BusShapeWithRoute,
  FeatureCreationSource,
  BikeStation,
} from '../components/map/map.types';
import { isSubwayRoute } from './transit-utils';
import { createBikeStationFeatureProperties } from './bike-feature-properties.utils';

/**
 * Factory service for creating OpenLayers features from GraphQL data
 * Centralizes feature creation logic to ensure consistency
 */
@Injectable({
  providedIn: 'root',
})
export class FeatureFactoryService {
  /**
   * Create OpenLayers Feature from a stop
   */
  createStopFeature(
    stop: BusStopGraphQL,
    creationSource: FeatureCreationSource = FeatureCreationSource.ROUTE_DISPLAY
  ): Feature {
    const geometry = new Point(fromLonLat([stop.longitude, stop.latitude]));
    const feature = new Feature({ geometry });

    feature.setProperties({
      id: stop.id,
      stopId: stop.stopId,
      name: stop.name,
      isSubwayStation: stop.isSubwayStation,
      agencies: stop.agencies || [],
      type: 'stop',
      creationSource,
    });

    feature.setId(stop.id);
    return feature;
  }

  /**
   * Create OpenLayers Feature from a route shape
   */
  createShapeFeature(
    shape: BusShapeWithRoute,
    creationSource: FeatureCreationSource = FeatureCreationSource.ROUTE_DISPLAY
  ): Feature {
    const coordinates = shape.geometry.coordinates.map((coord: number[]) =>
      fromLonLat([coord[0], coord[1]])
    );
    const geometry = new LineString(coordinates);
    const feature = new Feature({ geometry });

    const properties: Record<string, unknown> = {
      id: shape.id,
      shapeId: shape.shapeId,
      type: 'shape',
      creationSource,
    };

    if (shape.routeInfo) {
      properties['color'] = shape.routeInfo.color;
      properties['textColor'] = shape.routeInfo.textColor;
      properties['routeId'] = shape.routeInfo.routeId;
      properties['shortName'] = shape.routeInfo.shortName;
      properties['longName'] = shape.routeInfo.longName;
      properties['isSubwayRoute'] = isSubwayRoute(shape.routeInfo);
    }

    feature.setProperties(properties);
    feature.setId(shape.id);
    return feature;
  }

  /**
   * Batch create stop features
   */
  createStopFeatures(
    stops: BusStopGraphQL[],
    creationSource: FeatureCreationSource = FeatureCreationSource.ROUTE_DISPLAY
  ): Feature[] {
    return stops.map((stop) => this.createStopFeature(stop, creationSource));
  }

  /**
   * Batch create shape features
   */
  createShapeFeatures(
    shapes: BusShapeWithRoute[],
    creationSource: FeatureCreationSource = FeatureCreationSource.ROUTE_DISPLAY
  ): Feature[] {
    return shapes.map((shape) =>
      this.createShapeFeature(shape, creationSource)
    );
  }

  createBikeStationFeature(
    station: BikeStation,
    isSelected = false,
    creationSource: FeatureCreationSource = FeatureCreationSource.BIKE
  ): Feature {
    const geometry = new Point(
      fromLonLat([station.longitude, station.latitude])
    );
    const feature = new Feature({ geometry });

    feature.setProperties(
      createBikeStationFeatureProperties(station, isSelected, creationSource),
    );

    feature.setId(station.stationId);
    return feature;
  }

  createExploreLocationFeature(
    lat: number,
    lon: number,
    name = 'Local explorado',
  ): Feature {
    const geometry = new Point(fromLonLat([lon, lat]));
    const feature = new Feature({ geometry });

    feature.setProperties({
      id: 'explore-location',
      name,
      latitude: lat,
      longitude: lon,
      type: 'explore_location',
      creationSource: FeatureCreationSource.EXPLORE,
    });

    feature.setId('explore-location');
    return feature;
  }
}
