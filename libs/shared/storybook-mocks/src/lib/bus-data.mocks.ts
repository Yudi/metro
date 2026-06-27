/**
 * Shared mock data and utilities for bus-related Storybook stories.
 * Used by StopInfoDialog, BusStopDialog, StopArrivals, and other bus components.
 */

// Types

export interface BusStopGraphQL {
  id: string;
  stopId: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  isSubwayStation: boolean;
  agencies?: string[];
  routeShortNames?: string[];
}

export interface BusRouteGraphQL {
  id: string;
  routeId: string;
  shortName: string;
  longName: string;
  routeType: number;
  color: string;
  textColor: string;
}

export interface RouteRailConnectionStationGraphQL {
  id: string;
  name: string;
  agencies: string[];
  lines: string[];
  distanceMeters: number;
  nearStopId: string;
  nearStopName: string;
  stopSequence: number;
}

export interface RouteRailConnectionDirectionGraphQL {
  directionId: number;
  headsign: string;
  stations: RouteRailConnectionStationGraphQL[];
}

export interface RouteRailConnectionGraphQL {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  directions: RouteRailConnectionDirectionGraphQL[];
}

export interface VehiclePosition {
  p: number;
  a: boolean;
  ta: string;
  py: number;
  px: number;
  t?: string;
  heading?: number | null;
}

export interface LineWithVehicles {
  c: string;
  cl: number;
  sl: number;
  lt0: string;
  lt1: string;
  qv: number;
  vs: VehiclePosition[];
}

export interface VehiclePositionUpdate {
  routeShortName: string;
  hr: string;
  l: LineWithVehicles[];
  cacheTimestamp: number;
}

export interface StopArrivalUpdate {
  stopCode: string;
  hr: string;
  p: {
    cp: number;
    np: string;
    py: number;
    px: number;
    l: LineWithVehicles[];
  };
  cacheTimestamp: number;
}

export interface BikePricingPlan {
  planId: string;
  name: string;
  currency: string;
  initialPrice: number;
  initialPriceFormatted: string;
  activationFee: number | null;
  activationFeeFormatted: string | null;
  perMinuteRate: number | null;
  perMinuteRateFormatted: string | null;
  perMinuteChargingStartsAfterMinutes: number;
  maxUsageMinutes: number | null;
}

export interface BikeVehicleAvailability {
  vehicleTypeId: string;
  name: string;
  formFactor: string;
  propulsionType: string;
  count: number;
  maxRangeMeters: number | null;
  pricingPlan: BikePricingPlan | null;
}

export interface BikeStation {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  capacity: number | null;
  effectiveCapacity: number;
  numBikesAvailable: number;
  numBikesDisabled: number;
  numDocksAvailable: number;
  numDocksDisabled: number;
  status: string;
  isInstalled: boolean;
  isRenting: boolean;
  isReturning: boolean;
  lastReported: number;
  lastReportedIso: string;
  fetchedAt: number;
  electricBikesAvailable: number;
  hasElectricBikesAvailable: boolean;
  vehicleAvailability: BikeVehicleAvailability[];
  detailsLoaded: boolean;
}

export type RealtimeFetchKind =
  | 'arrivals'
  | 'no-arrivals'
  | 'loading'
  | 'error';

export interface MockRealtimeServiceOptions {
  /** Kind of result to return from realtime service */
  fetchKind: RealtimeFetchKind;
  /** Pre-populated arrivals data (optional) */
  arrivals?: Map<string, StopArrivalUpdate>;
}

// Mock Bus Stops

/** Regular bus stop in São Paulo */
export const PINHEIROS_BUS_STOP: BusStopGraphQL = {
  id: 'stop-pinheiros-1',
  stopId: '340015325',
  name: 'Av. Brigadeiro Faria Lima, 1234',
  description: 'Próximo à estação Faria Lima',
  latitude: -23.5669,
  longitude: -46.6918,
  isSubwayStation: false,
  agencies: ['SPTRANS'],
  routeShortNames: ['477A-10', '775A-10', '177H-10'],
};

/** Bus stop with many routes */
export const CONSOLACAO_BUS_STOP: BusStopGraphQL = {
  id: 'stop-consolacao-1',
  stopId: '340012345',
  name: 'Av. Paulista, 1000',
  description: 'Em frente ao MASP',
  latitude: -23.5614,
  longitude: -46.656,
  isSubwayStation: false,
  agencies: ['SPTRANS'],
  routeShortNames: ['875A-10', '875I-10', '875P-10', '6291-10', '7181-10'],
};

/** Subway station that is also a bus stop */
export const SE_SUBWAY_STATION: BusStopGraphQL = {
  id: 'station-se-1',
  stopId: '99001',
  name: 'Sé',
  description:
    'Estação Sé do Metrô, ponto de conexão das linhas 1-Azul e 3-Vermelha',
  latitude: -23.5503,
  longitude: -46.6331,
  isSubwayStation: true,
  agencies: ['METRO'],
  routeShortNames: ['L1', 'L3'],
};

/** Bus stop with no routes (edge case) */
export const EMPTY_BUS_STOP: BusStopGraphQL = {
  id: 'stop-empty-1',
  stopId: '340099999',
  name: 'Rua Desconhecida, s/n',
  description: undefined,
  latitude: -23.55,
  longitude: -46.65,
  isSubwayStation: false,
  agencies: [],
  routeShortNames: [],
};

// Mock Bus Routes

export const ROUTE_477A: BusRouteGraphQL = {
  id: 'route-477a',
  routeId: '477A-10',
  shortName: '477A-10',
  longName: 'Metrô Santana – Pinheiros',
  routeType: 3,
  color: '0066CC',
  textColor: 'FFFFFF',
};

export const ROUTE_775A: BusRouteGraphQL = {
  id: 'route-775a',
  routeId: '775A-10',
  shortName: '775A-10',
  longName: 'Term. Pirituba – Pinheiros',
  routeType: 3,
  color: 'CC0033',
  textColor: 'FFFFFF',
};

export const ROUTE_177H: BusRouteGraphQL = {
  id: 'route-177h',
  routeId: '177H-10',
  shortName: '177H-10',
  longName: 'Metrô Butantã – Lapa',
  routeType: 3,
  color: '009933',
  textColor: 'FFFFFF',
};

export const ROUTE_875A: BusRouteGraphQL = {
  id: 'route-875a',
  routeId: '875A-10',
  shortName: '875A-10',
  longName: 'Jd. Ângela – Term. Pq. Dom Pedro II',
  routeType: 3,
  color: 'FF6600',
  textColor: 'FFFFFF',
};

export const ROUTE_875I: BusRouteGraphQL = {
  id: 'route-875i',
  routeId: '875I-10',
  shortName: '875I-10',
  longName: 'Jd. Ângela – Pq. Dom Pedro II',
  routeType: 3,
  color: 'FF6600',
  textColor: 'FFFFFF',
};

export const ALL_ROUTES: BusRouteGraphQL[] = [
  ROUTE_477A,
  ROUTE_775A,
  ROUTE_177H,
  ROUTE_875A,
  ROUTE_875I,
];

export const MOCK_ROUTE_RAIL_CONNECTIONS: RouteRailConnectionGraphQL[] = [
  {
    routeId: ROUTE_477A.routeId,
    routeShortName: ROUTE_477A.shortName,
    routeLongName: ROUTE_477A.longName,
    directions: [
      {
        directionId: 0,
        headsign: 'Pinheiros',
        stations: [
          {
            id: 'rail-pinheiros',
            name: 'Pinheiros',
            agencies: ['METRO', 'CPTM'],
            lines: ['AMARELA', 'ESMERALDA'],
            distanceMeters: 82,
            nearStopId: '340015329',
            nearStopName: 'R. Gilberto Sabino',
            stopSequence: 8,
          },
        ],
      },
    ],
  },
  {
    routeId: ROUTE_177H.routeId,
    routeShortName: ROUTE_177H.shortName,
    routeLongName: ROUTE_177H.longName,
    directions: [
      {
        directionId: 1,
        headsign: 'Lapa',
        stations: [
          {
            id: 'rail-lapa',
            name: 'Lapa',
            agencies: ['CPTM'],
            lines: ['RUBI', 'DIAMANTE'],
            distanceMeters: 109,
            nearStopId: '340019001',
            nearStopName: 'Terminal Lapa',
            stopSequence: 21,
          },
        ],
      },
      {
        directionId: 0,
        headsign: 'Metrô Butantã',
        stations: [
          {
            id: 'rail-butanta',
            name: 'Butantã',
            agencies: ['METRO'],
            lines: ['AMARELA'],
            distanceMeters: 64,
            nearStopId: '340014884',
            nearStopName: 'Av. Vital Brasil',
            stopSequence: 4,
          },
        ],
      },
    ],
  },
  {
    routeId: ROUTE_875A.routeId,
    routeShortName: ROUTE_875A.shortName,
    routeLongName: ROUTE_875A.longName,
    directions: [
      {
        directionId: 0,
        headsign: 'Term. Pq. Dom Pedro II',
        stations: [
          {
            id: 'rail-sao-joaquim',
            name: 'São Joaquim',
            agencies: ['METRO'],
            lines: ['AZUL'],
            distanceMeters: 93,
            nearStopId: '340012887',
            nearStopName: 'R. Vergueiro',
            stopSequence: 17,
          },
        ],
      },
    ],
  },
  {
    routeId: ROUTE_775A.routeId,
    routeShortName: ROUTE_775A.shortName,
    routeLongName: ROUTE_775A.longName,
    directions: [],
  },
];

// Mock Arrival Predictions

function getCurrentTimeString(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function getTimeInMinutes(minutes: number): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + minutes);
  return `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export function createMockArrivals(stopCode: string): StopArrivalUpdate {
  return {
    stopCode,
    hr: getCurrentTimeString(),
    p: {
      cp: parseInt(stopCode, 10),
      np: 'Ponto de teste',
      py: -23.5669,
      px: -46.6918,
      l: [
        {
          c: '477A-10',
          cl: 477,
          sl: 1,
          lt0: 'Pinheiros',
          lt1: 'Metrô Santana',
          qv: 2,
          vs: [
            {
              p: 12345,
              a: true,
              ta: new Date().toISOString(),
              py: -23.568,
              px: -46.693,
              t: getTimeInMinutes(3),
            },
            {
              p: 12346,
              a: false,
              ta: new Date().toISOString(),
              py: -23.57,
              px: -46.695,
              t: getTimeInMinutes(8),
            },
          ],
        },
        {
          c: '775A-10',
          cl: 775,
          sl: 1,
          lt0: 'Pinheiros',
          lt1: 'Term. Pirituba',
          qv: 1,
          vs: [
            {
              p: 23456,
              a: true,
              ta: new Date().toISOString(),
              py: -23.565,
              px: -46.69,
              t: getTimeInMinutes(5),
            },
          ],
        },
        {
          c: '177H-10',
          cl: 177,
          sl: 2,
          lt0: 'Lapa',
          lt1: 'Metrô Butantã',
          qv: 3,
          vs: [
            {
              p: 34567,
              a: false,
              ta: new Date().toISOString(),
              py: -23.566,
              px: -46.688,
              t: getTimeInMinutes(1),
            },
            {
              p: 34568,
              a: true,
              ta: new Date().toISOString(),
              py: -23.564,
              px: -46.686,
              t: getTimeInMinutes(12),
            },
            {
              p: 34569,
              a: false,
              ta: new Date().toISOString(),
              py: -23.562,
              px: -46.684,
              t: getTimeInMinutes(20),
            },
          ],
        },
      ],
    },
    cacheTimestamp: Date.now(),
  };
}

export function createEmptyArrivals(stopCode: string): StopArrivalUpdate {
  return {
    stopCode,
    hr: getCurrentTimeString(),
    p: {
      cp: parseInt(stopCode, 10),
      np: 'Ponto de teste',
      py: -23.5669,
      px: -46.6918,
      l: [],
    },
    cacheTimestamp: Date.now(),
  };
}

// Mock Bike Stations

const PRICING_PLAN_FIT: BikePricingPlan = {
  planId: '243',
  name: 'Avulso dia de semana',
  currency: 'BRL',
  initialPrice: 6.9,
  initialPriceFormatted: 'R$ 6,90',
  activationFee: null,
  activationFeeFormatted: null,
  perMinuteRate: 0.49,
  perMinuteRateFormatted: 'R$ 0,49/min',
  perMinuteChargingStartsAfterMinutes: 15,
  maxUsageMinutes: null,
};

const PRICING_PLAN_EFIT: BikePricingPlan = {
  planId: '247-121',
  name: 'Mensal',
  currency: 'BRL',
  initialPrice: 43.9,
  initialPriceFormatted: 'R$ 43,90',
  activationFee: 9.99,
  activationFeeFormatted: 'R$ 9,99',
  perMinuteRate: 0.39,
  perMinuteRateFormatted: 'R$ 0,39/min',
  perMinuteChargingStartsAfterMinutes: 60,
  maxUsageMinutes: 120,
};

const VEHICLE_FIT: BikeVehicleAvailability = {
  vehicleTypeId: 'FIT',
  name: 'FIT',
  formFactor: 'bicycle',
  propulsionType: 'human',
  count: 5,
  maxRangeMeters: null,
  pricingPlan: PRICING_PLAN_FIT,
};

const VEHICLE_EFIT: BikeVehicleAvailability = {
  vehicleTypeId: 'EFIT',
  name: 'EFIT',
  formFactor: 'bicycle',
  propulsionType: 'electric_assist',
  count: 2,
  maxRangeMeters: null,
  pricingPlan: PRICING_PLAN_EFIT,
};

const VEHICLE_FIT_EMPTY: BikeVehicleAvailability = {
  ...VEHICLE_FIT,
  count: 0,
};

const VEHICLE_EFIT_EMPTY: BikeVehicleAvailability = {
  ...VEHICLE_EFIT,
  count: 0,
};

export const BIKE_STATION_FULL: BikeStation = {
  stationId: 'station-1',
  name: 'Estação Paulista',
  latitude: -23.5614,
  longitude: -46.656,
  address: 'Av. Paulista, 1000',
  capacity: 20,
  effectiveCapacity: 20,
  numBikesAvailable: 7,
  numBikesDisabled: 1,
  numDocksAvailable: 12,
  numDocksDisabled: 0,
  status: 'IN_SERVICE',
  isInstalled: true,
  isRenting: true,
  isReturning: true,
  lastReported: Date.now(),
  lastReportedIso: new Date().toISOString(),
  fetchedAt: Date.now(),
  electricBikesAvailable: 2,
  hasElectricBikesAvailable: true,
  vehicleAvailability: [VEHICLE_FIT, VEHICLE_EFIT],
  detailsLoaded: true,
};

export const BIKE_STATION_EMPTY: BikeStation = {
  stationId: 'station-2',
  name: 'Estação Faria Lima',
  latitude: -23.5669,
  longitude: -46.6918,
  address: 'Av. Brigadeiro Faria Lima, 500',
  capacity: 15,
  effectiveCapacity: 15,
  numBikesAvailable: 0,
  numBikesDisabled: 2,
  numDocksAvailable: 13,
  numDocksDisabled: 0,
  status: 'IN_SERVICE',
  isInstalled: true,
  isRenting: true,
  isReturning: true,
  lastReported: Date.now(),
  lastReportedIso: new Date().toISOString(),
  fetchedAt: Date.now(),
  electricBikesAvailable: 0,
  hasElectricBikesAvailable: false,
  vehicleAvailability: [VEHICLE_FIT_EMPTY, VEHICLE_EFIT_EMPTY],
  detailsLoaded: true,
};

export const BIKE_STATION_NO_DOCKS: BikeStation = {
  stationId: 'station-3',
  name: 'Estação República',
  latitude: -23.5437,
  longitude: -46.6422,
  address: 'Praça da República, 100',
  capacity: 10,
  effectiveCapacity: 10,
  numBikesAvailable: 10,
  numBikesDisabled: 0,
  numDocksAvailable: 0,
  numDocksDisabled: 0,
  status: 'IN_SERVICE',
  isInstalled: true,
  isRenting: true,
  isReturning: true,
  lastReported: Date.now(),
  lastReportedIso: new Date().toISOString(),
  fetchedAt: Date.now(),
  electricBikesAvailable: 3,
  hasElectricBikesAvailable: true,
  vehicleAvailability: [
    { ...VEHICLE_FIT, count: 7 },
    { ...VEHICLE_EFIT, count: 3 },
  ],
  detailsLoaded: true,
};

export const BIKE_STATION_LOADING: BikeStation = {
  stationId: 'station-4',
  name: 'Estação Consolação',
  latitude: -23.5563,
  longitude: -46.6602,
  address: 'Rua da Consolação, 300',
  capacity: 12,
  effectiveCapacity: 12,
  numBikesAvailable: 0,
  numBikesDisabled: 0,
  numDocksAvailable: 0,
  numDocksDisabled: 0,
  status: 'IN_SERVICE',
  isInstalled: true,
  isRenting: true,
  isReturning: true,
  lastReported: Date.now(),
  lastReportedIso: new Date().toISOString(),
  fetchedAt: Date.now(),
  electricBikesAvailable: 0,
  hasElectricBikesAvailable: false,
  vehicleAvailability: [],
  detailsLoaded: false,
};

export const BIKE_STATION_OUT_OF_SERVICE: BikeStation = {
  stationId: 'station-5',
  name: 'Estação Liberdade',
  latitude: -23.5568,
  longitude: -46.6345,
  address: 'Av. Liberdade, 200',
  capacity: 8,
  effectiveCapacity: 8,
  numBikesAvailable: 0,
  numBikesDisabled: 8,
  numDocksAvailable: 0,
  numDocksDisabled: 0,
  status: 'OUT_OF_SERVICE',
  isInstalled: true,
  isRenting: false,
  isReturning: false,
  lastReported: Date.now() - 3600000, // 1 hour ago
  lastReportedIso: new Date(Date.now() - 3600000).toISOString(),
  fetchedAt: Date.now(),
  electricBikesAvailable: 0,
  hasElectricBikesAvailable: false,
  vehicleAvailability: [],
  detailsLoaded: true,
};

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
    POLL_INTERVAL_MS: 15000,
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
