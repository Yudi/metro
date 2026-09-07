import { OLHOVIVO_POLL_INTERVAL_MS } from '@metro/shared/utils';
import type {
  BusStopGraphQL,
  MockRealtimeServiceOptions,
  StopArrivalUpdate,
  VehiclePositionUpdate,
} from './bus-data.types';

// Mock Service Factories

/**
 * Creates a mock RealtimeWebsocketService for Storybook stories.
 */
export function createMockRealtimeService(opts: MockRealtimeServiceOptions) {
  const { fetchKind, arrivals } = opts;

  // Create arrivals map based on fetchKind
  const arrivalsMap = new Map<string, StopArrivalUpdate>();
  if (fetchKind === 'arrivals' && arrivals) {
    arrivals.forEach((v, k) => arrivalsMap.set(k, v));
  }

  return {
    connected: () => fetchKind !== 'error',
    lastUpdateTimestamp: () => (fetchKind === 'arrivals' ? Date.now() : null),
    vehiclePositions: () => new Map<string, VehiclePositionUpdate>(),
    stopArrivals: () => arrivalsMap,
    subscribeToStop: (stopId: string) => {
      console.debug('[mock] subscribeToStop', stopId);
    },
    unsubscribeFromStop: (stopId: string) => {
      console.debug('[mock] unsubscribeFromStop', stopId);
    },
    subscribeToRoute: (routeId: string) => {
      console.debug('[mock] subscribeToRoute', routeId);
    },
    unsubscribeFromRoute: (routeId: string) => {
      console.debug('[mock] unsubscribeFromRoute', routeId);
    },
    POLL_INTERVAL_MS: OLHOVIVO_POLL_INTERVAL_MS,
  };
}

/**
 * Creates a mock MapStateService for Storybook stories.
 */
export function createMockMapStateService(
  subwayStations: BusStopGraphQL[] = [],
) {
  return {
    subwayStations: () => subwayStations,
    selectedRoutes: () => [],
    selectedStops: () => [],
    displayMode: () => 'selected' as const,
  };
}

/**
 * Creates a mock StationNameService for Storybook stories.
 */
export function createMockStationNameService() {
  return {
    normalizeStationName: (name: string, isSubway: boolean) => {
      if (isSubway) {
        // Remove common subway suffixes for cleaner display
        return name.replace(/\s+(Metrô|Metro|Station|Estação)$/i, '').trim();
      }
      return name;
    },
  };
}

/**
 * Creates a mock LoggerService for Storybook stories.
 */
export function createMockLoggerService() {
  return {
    debug: (...args: unknown[]) => console.debug('[story]', ...args),
    info: (...args: unknown[]) => console.info('[story]', ...args),
    warn: (...args: unknown[]) => console.warn('[story]', ...args),
    error: (...args: unknown[]) => console.error('[story]', ...args),
  };
}
