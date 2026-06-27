import {
  BusRouteGraphQL,
  BusStopGraphQL,
} from '../services/geography-graphql.service';
import { BusShapeWithRoute } from '../components/map/map.types';

/**
 * Centralized utility functions for transit data operations
 * Reduces code duplication and improves maintainability
 */

/**
 * Check if a route is a subway/metro route based on route ID patterns
 */
export function isSubwayRoute(route: BusRouteGraphQL): boolean {
  return route.routeId.startsWith('METRÔ') || route.routeId.startsWith('CPTM');
}

/**
 * Check if a shape represents a subway route
 */
export function isSubwayShape(shape: BusShapeWithRoute): boolean {
  return shape.routeInfo ? isSubwayRoute(shape.routeInfo) : false;
}

/**
 * Check if a stop is a subway station
 */
export function isSubwayStation(stop: BusStopGraphQL): boolean {
  return stop.isSubwayStation === true;
}

/**
 * Get route color with fallback
 */
export function getRouteColor(
  route: BusRouteGraphQL,
  fallback = '1976d2'
): string {
  return route.color && route.color !== '' ? route.color : fallback;
}

/**
 * Get route display name
 */
export function getRouteDisplayName(route: BusRouteGraphQL): string {
  return route.shortName
    ? `${route.shortName} - ${route.longName}`
    : route.longName || route.routeId;
}

/**
 * Filter subway stations from a list of stops
 */
export function filterSubwayStations(
  stops: BusStopGraphQL[]
): BusStopGraphQL[] {
  return stops.filter((stop) => isSubwayStation(stop));
}

/**
 * Filter non-subway stops from a list
 */
export function filterRegularStops(stops: BusStopGraphQL[]): BusStopGraphQL[] {
  return stops.filter((stop) => !isSubwayStation(stop));
}

/**
 * Create a Set from stop IDs for fast lookups
 */
export function createStopIdSet(stops: BusStopGraphQL[]): Set<string> {
  return new Set(stops.map((stop) => stop.id));
}

/**
 * Remove duplicate stops by ID
 */
export function deduplicateStops(stops: BusStopGraphQL[]): BusStopGraphQL[] {
  const seen = new Set<string>();
  return stops.filter((stop) => {
    if (seen.has(stop.id)) {
      return false;
    }
    seen.add(stop.id);
    return true;
  });
}

/**
 * Remove duplicate routes by ID
 */
export function deduplicateRoutes(
  routes: BusRouteGraphQL[]
): BusRouteGraphQL[] {
  const seen = new Set<string>();
  return routes.filter((route) => {
    if (seen.has(route.id)) {
      return false;
    }
    seen.add(route.id);
    return true;
  });
}
