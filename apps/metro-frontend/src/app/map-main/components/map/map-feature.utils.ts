import { Feature } from 'ol';
import { Point, LineString, Polygon, Circle } from 'ol/geom';
import { toLonLat } from 'ol/proj';
import type { MapFeature } from './map-service.types';

export function featureToMapFeature(feature: Feature): MapFeature {
  const geometry = feature.getGeometry();
  let mapGeometry: MapFeature['geometry'];

  if (geometry instanceof Point) {
    mapGeometry = {
      type: 'Point',
      coordinates: [toLonLat(geometry.getCoordinates())],
    };
  } else if (geometry instanceof LineString) {
    mapGeometry = {
      type: 'LineString',
      coordinates: geometry.getCoordinates().map((coord) => toLonLat(coord)),
    };
  } else if (geometry instanceof Polygon) {
    mapGeometry = {
      type: 'Polygon',
      coordinates: geometry.getCoordinates()[0].map((coord) => toLonLat(coord)),
    };
  } else if (geometry instanceof Circle) {
    mapGeometry = {
      type: 'Circle',
      coordinates: [toLonLat(geometry.getCenter())],
      radius: geometry.getRadius(),
    };
  } else {
    throw new Error('Unsupported geometry type');
  }

  return {
    id: feature.getId()?.toString(),
    geometry: mapGeometry,
    properties: feature.getProperties(),
  };
}
