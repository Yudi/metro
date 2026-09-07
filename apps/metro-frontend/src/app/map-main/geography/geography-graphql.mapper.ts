import type { MapFeature } from '../components/map/map-service.types';
import type {
  BusRouteGraphQL,
  BusShapeGraphQL,
  BusStopGraphQL,
} from './geography-graphql.types';

export function convertToBusStop(graphqlStop: BusStopGraphQL): MapFeature {
  return {
    id: graphqlStop.id,
    geometry: {
      type: 'Point',
      coordinates: [[graphqlStop.longitude, graphqlStop.latitude]],
    },
    properties: {
      stopId: graphqlStop.stopId,
      name: graphqlStop.name,
      description: graphqlStop.description,
      latitude: graphqlStop.latitude,
      longitude: graphqlStop.longitude,
      sourceAgency: graphqlStop.sourceAgency,
      sourceId: graphqlStop.sourceId,
      platformCode: graphqlStop.platformCode,
      mergedStopIds: graphqlStop.mergedStopIds,
    },
  };
}

export function convertToBusRoute(graphqlRoute: BusRouteGraphQL): MapFeature {
  return {
    id: graphqlRoute.id,
    geometry: {
      type: 'LineString',
      coordinates: graphqlRoute.geometry?.coordinates || [],
    },
    properties: {
      routeId: graphqlRoute.routeId,
      shortName: graphqlRoute.shortName,
      longName: graphqlRoute.longName,
      routeType: graphqlRoute.routeType,
      color: graphqlRoute.color,
      textColor: graphqlRoute.textColor,
      sourceAgency: graphqlRoute.sourceAgency,
      sourceId: graphqlRoute.sourceId,
      supportsRealtime: graphqlRoute.supportsRealtime,
      fares: graphqlRoute.fares,
    },
  };
}

export function convertToBusShape(graphqlShape: BusShapeGraphQL): MapFeature {
  return {
    id: graphqlShape.id,
    geometry: {
      type: 'LineString',
      coordinates: graphqlShape.geometry.coordinates,
    },
    properties: {
      shapeId: graphqlShape.shapeId,
    },
  };
}
