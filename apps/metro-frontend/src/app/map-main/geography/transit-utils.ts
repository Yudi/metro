import { getContrastColor } from '@metro/shared/utils';
import type { BusRouteGraphQL, BusStopGraphQL } from './geography-graphql.service';
import type { BusShapeWithRoute } from '../components/map/map.types';

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

function normalizeHexColor(color: string | undefined): string | undefined {
  const normalized = color?.trim().replace(/^#/, '');
  if (!normalized) return undefined;
  if (/^[\da-f]{3}$/i.test(normalized)) {
    return `#${normalized
      .split('')
      .map((digit) => `${digit}${digit}`)
      .join('')}`;
  }
  return /^[\da-f]{6}$/i.test(normalized) ? `#${normalized}` : undefined;
}

/** Get a route's valid hex color, or a valid fallback for feeds without one. */
export function getRouteColor(
  route: Pick<BusRouteGraphQL, 'color'>,
  fallback = '1976d2',
): string {
  return (
    normalizeHexColor(route.color) ??
    normalizeHexColor(fallback) ??
    '#1976d2'
  );
}

/** Use the feed text color when valid, otherwise choose readable contrast. */
export function getRouteTextColor(
  route: Pick<BusRouteGraphQL, 'color' | 'textColor'>,
  fallback = '1976d2',
): string {
  return (
    normalizeHexColor(route.textColor) ??
    getContrastColor(getRouteColor(route, fallback))
  );
}

/**
 * Get route display name
 */
export function getRouteDisplayName(route: BusRouteGraphQL): string {
  return route.shortName
    ? `${route.shortName} - ${route.longName}`
    : route.longName || route.routeId;
}
