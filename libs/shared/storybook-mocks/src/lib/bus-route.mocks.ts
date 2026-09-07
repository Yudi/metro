import type {
  BusRouteGraphQL,
  RouteRailConnectionGraphQL,
  ScheduledBusDepartureGraphQL,
} from './bus-data.types';

// Mock Bus Routes

export const ROUTE_477A: BusRouteGraphQL = {
  id: 'route-477a',
  routeId: '477A-10',
  shortName: '477A-10',
  longName: 'Metrô Santana – Pinheiros',
  routeType: 3,
  color: '0066CC',
  textColor: 'FFFFFF',
  sourceAgency: 'SPTRANS',
  sourceId: '477A-10',
  supportsRealtime: true,
  fares: [{ price: 5, currency: 'BRL' }],
};

/** Artesp route with a published fare and no realtime support. */
export const ROUTE_ARTESP_001: BusRouteGraphQL = {
  id: 'artesp:001',
  routeId: 'artesp:001',
  shortName: '001',
  longName: 'Terminal Regional – Centro',
  routeType: 3,
  color: 'C90C0F',
  textColor: 'FFFFFF',
  sourceAgency: 'ARTESP',
  sourceId: '001',
  supportsRealtime: false,
  fares: [{ price: 5.5, currency: 'BRL' }],
};

/** Artesp route whose feed does not publish a fare-rule mapping. */
export const ROUTE_ARTESP_WITHOUT_FARE: BusRouteGraphQL = {
  id: 'artesp:02Verde',
  routeId: 'artesp:02Verde',
  shortName: '02Verde',
  longName: 'Terminal Metropolitano – Bairro Verde',
  routeType: 3,
  color: '16803C',
  textColor: 'FFFFFF',
  sourceAgency: 'ARTESP',
  sourceId: '02Verde',
  supportsRealtime: false,
  fares: [],
};

// Relative fixtures keep today's departures free of a weekday label in Storybook.
const scheduledFixtureNow = new Date();
scheduledFixtureNow.setSeconds(0, 0);
const scheduledFixtureTomorrow = new Date(
  scheduledFixtureNow.getTime() + 86_400_000,
).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export const SCHEDULED_ARTESP_DEPARTURES: ScheduledBusDepartureGraphQL[] = [
  ...[10, 25, 40, 55, 70, 85].map((minutes, index) => ({
    routeId: ROUTE_ARTESP_001.routeId,
    routeShortName: ROUTE_ARTESP_001.shortName,
    tripId: `artesp:trip-001-${index}`,
    headsign: index % 2 === 0 ? 'Centro' : 'Terminal Regional',
    directionId: index % 2,
    departureTime: new Date(
      scheduledFixtureNow.getTime() + minutes * 60_000,
    ).toISOString(),
    sourceAgency: 'ARTESP',
    platformCode: '1',
  })),
  ...[15, 35, 55, 75].map((minutes, index) => ({
    routeId: ROUTE_ARTESP_WITHOUT_FARE.routeId,
    routeShortName: ROUTE_ARTESP_WITHOUT_FARE.shortName,
    tripId: `artesp:trip-02Verde-${index}`,
    headsign: 'Bairro Verde',
    directionId: 0,
    departureTime: new Date(
      scheduledFixtureNow.getTime() + minutes * 60_000,
    ).toISOString(),
    sourceAgency: 'ARTESP',
    platformCode: '2',
  })),
  {
    routeId: ROUTE_ARTESP_WITHOUT_FARE.routeId,
    routeShortName: ROUTE_ARTESP_WITHOUT_FARE.shortName,
    tripId: 'artesp:trip-02Verde-tomorrow',
    headsign: 'Bairro Verde',
    directionId: 0,
    departureTime: `${scheduledFixtureTomorrow}T07:00:00-03:00`,
    sourceAgency: 'ARTESP',
    platformCode: '2',
  },
];

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
  ROUTE_ARTESP_001,
  ROUTE_ARTESP_WITHOUT_FARE,
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
        directionId: 0,
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
        directionId: 1,
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
