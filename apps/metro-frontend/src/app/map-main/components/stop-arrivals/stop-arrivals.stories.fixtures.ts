import { signal } from '@angular/core';
import { NEVER, of, throwError } from 'rxjs';
import {
  BusInformationService,
  type BusNoticesResult,
} from '../bus-information/bus-information.service';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import type {
  BusRouteGraphQL,
  BusStopGraphQL,
  RouteRailConnectionGraphQL,
} from '../../geography/geography-graphql.service';
import { RealtimeWebsocketService } from '../../realtime/realtime-websocket.service';
import type { StopArrivalUpdate } from '../../realtime/realtime-websocket.service';
import {
  MOCK_ROUTE_RAIL_CONNECTIONS,
  ROUTE_177H,
  ROUTE_477A,
  ROUTE_775A,
  ROUTE_875A,
  ROUTE_875I,
  SCHEDULED_ARTESP_DEPARTURES,
} from '@metro/storybook-mocks';
import { OLHOVIVO_POLL_INTERVAL_MS } from '@metro/shared/utils';

export interface StopArrivalsProviderOptions {
  stop: BusStopGraphQL;
  arrivals?: StopArrivalUpdate;
  isLoading?: boolean;
  scheduledDepartures?: typeof SCHEDULED_ARTESP_DEPARTURES;
  scheduledState?: 'loaded' | 'loading' | 'error';
  notices?: BusNoticesResult;
  railConnections?: RouteRailConnectionGraphQL[];
}

export const BUSY_STOP_MANY_ROUTES: BusRouteGraphQL[] = [
  ROUTE_477A,
  ROUTE_775A,
  ROUTE_177H,
  ROUTE_875A,
  ROUTE_875I,
  {
    id: '1234-10',
    routeId: '1234-10',
    shortName: '1234-10',
    longName: 'Terminal Regional – Jardim Norte',
    color: '6D28D9',
    textColor: 'FFFFFF',
    sourceAgency: 'SPTRANS',
    supportsRealtime: true,
  },
];

export const SPACED_STATION_ROUTE: BusRouteGraphQL = {
  id: '456T-10',
  routeId: '456T-10',
  shortName: '456T-10',
  longName: 'Terminal Norte – Terminal Sul',
  color: '006341',
  textColor: 'FFFFFF',
  sourceAgency: 'SPTRANS',
  supportsRealtime: true,
  destination: 'Terminal Sul',
  directionId: 0,
};

export const SPACED_STATION_RAIL_CONNECTIONS: RouteRailConnectionGraphQL[] = [
  {
    routeId: SPACED_STATION_ROUTE.routeId,
    routeShortName: SPACED_STATION_ROUTE.shortName,
    directions: [
      {
        directionId: 0,
        headsign: 'Terminal Sul',
        stations: [
          {
            id: 'rail-norte',
            name: 'Estação Norte',
            lines: ['AZUL'],
            distanceMeters: 120,
            stopsUntil: 3,
          },
          {
            id: 'rail-centro',
            name: 'Estação Central',
            lines: ['VERDE'],
            distanceMeters: 88,
            stopsUntil: 8,
          },
          {
            id: 'rail-sul',
            name: 'Estação Sul',
            lines: ['RUBI'],
            distanceMeters: 175,
            stopsUntil: 13,
          },
        ],
      },
    ],
  },
];

export function createStopArrivalsProviders(opts: StopArrivalsProviderOptions) {
  const { stop, arrivals, isLoading = false } = opts;
  const arrivalsMap = new Map<string, StopArrivalUpdate>();
  if (arrivals && !isLoading) {
    arrivalsMap.set(stop.stopId, arrivals);
  }

  const scheduledDepartures$ =
    opts.scheduledState === 'loading'
      ? NEVER
      : opts.scheduledState === 'error'
        ? throwError(() => new Error('Falha simulada ao carregar horários'))
        : of(opts.scheduledDepartures ?? []);

  return [
    {
      provide: BusInformationService,
      useValue: {
        notices: () =>
          of(opts.notices ?? {
            status: 'AVAILABLE',
            lastUpdated: '2026-09-07T07:30:00Z',
            notices: [
              {
                sourceId: '1',
                sourceUrl:
                  'https://www.sptrans.com.br/informativos/oeste/desvios-de-itinerarios-na-regiao-da-av-paulista/71116/',
                title: 'Exemplo: desvio na região da Av. Paulista',
                periodText: '07/09/2026, das 9h às 20h.',
                description:
                  '07/09/2026, das 9h às 20h.\nMotivo: exemplo ilustrativo de evento.\n477A-10 Pinheiros\nIda: exemplo de desvio pela via alternativa.\nVolta: sem alteração.\n875A-10 Outro destino\nIda: instrução de outra linha.',
                routes: ['477A-10', '875A-10'],
                listing: 'RECENT',
                listedDate: '7 de setembro de 2026',
              },
            ],
          }),
      },
    },
    {
      provide: GeographyGraphQLService,
      useValue: {
        getRouteRailConnectionsForStop: () =>
          of(opts.railConnections ?? MOCK_ROUTE_RAIL_CONNECTIONS),
        getScheduledBusDepartures: () => scheduledDepartures$,
      },
    },
    {
      provide: RealtimeWebsocketService,
      useValue: {
        connected: signal(!isLoading),
        lastUpdateTimestamp: signal(arrivals ? Date.now() : null),
        vehiclePositions: signal(new Map()),
        stopArrivals: signal(arrivalsMap),
        subscribeToStop: (stopId: string) => {
          console.debug('[story] subscribeToStop', stopId);
        },
        unsubscribeFromStop: (stopId: string) => {
          console.debug('[story] unsubscribeFromStop', stopId);
        },
        POLL_INTERVAL_MS: OLHOVIVO_POLL_INTERVAL_MS,
      },
    },
  ];
}

export function createBusyManyRouteArrivals(
  stop: BusStopGraphQL,
  routes: readonly BusRouteGraphQL[],
): StopArrivalUpdate {
  const destinations = [
    'Pinheiros',
    'Terminal Pirituba',
    'Lapa',
    'Term. Pq. Dom Pedro II',
    'Pq. Dom Pedro II',
    'Jardim Norte',
  ];
  const now = new Date();
  const nowLabel = now.toTimeString().slice(0, 5);
  const timeAfter = (minutes: number) =>
    new Date(now.getTime() + minutes * 60_000).toTimeString().slice(0, 5);

  return {
    stopCode: stop.stopId,
    hr: nowLabel,
    p: {
      cp: Number.parseInt(stop.stopId, 10),
      np: stop.name,
      py: stop.latitude,
      px: stop.longitude,
      l: routes.map((route, index) => ({
        c: route.shortName,
        cl: 40000 + index,
        sl: 1,
        lt0: destinations[index] ?? 'Terminal Regional',
        lt1: 'Terminal Regional',
        qv: 2,
        vs: [
          {
            p: 41000 + index * 10,
            a: index % 2 === 0,
            ta: now.toISOString(),
            py: stop.latitude,
            px: stop.longitude,
            t: timeAfter(3 + index * 2),
          },
          {
            p: 41001 + index * 10,
            a: false,
            ta: now.toISOString(),
            py: stop.latitude,
            px: stop.longitude,
            t: timeAfter(8 + index * 2),
          },
        ],
      })),
    },
    cacheTimestamp: now.getTime(),
  };
}

function createArrival(
  stop: BusStopGraphQL,
  line: NonNullable<StopArrivalUpdate['p']>['l'][number],
  hr: string,
): StopArrivalUpdate {
  return {
    stopCode: stop.stopId,
    hr,
    p: {
      cp: parseInt(stop.stopId, 10),
      np: stop.name,
      py: stop.latitude,
      px: stop.longitude,
      l: [line],
    },
    cacheTimestamp: Date.now(),
  };
}

export function createSingleLineArrival(
  stop: BusStopGraphQL,
): StopArrivalUpdate {
  return createArrival(
    stop,
    {
      c: '477A-10',
      cl: 477,
      sl: 1,
      lt0: 'Pinheiros',
      lt1: 'Metrô Santana',
      qv: 1,
      vs: [
        {
          p: 12345,
          a: true,
          ta: new Date().toISOString(),
          py: -23.568,
          px: -46.693,
          t: '14:35',
        },
      ],
    },
    '14:30',
  );
}

export function createBusyStopArrivals(
  stop: BusStopGraphQL,
): StopArrivalUpdate {
  return {
    stopCode: stop.stopId,
    hr: '18:00',
    p: {
      cp: parseInt(stop.stopId, 10),
      np: stop.name,
      py: stop.latitude,
      px: stop.longitude,
      l: [
        {
          c: '477A-10',
          cl: 477,
          sl: 1,
          lt0: 'Pinheiros',
          lt1: 'Metrô Santana',
          qv: 4,
          vs: [
            {
              p: 12341,
              a: true,
              ta: new Date().toISOString(),
              py: -23.567,
              px: -46.691,
              t: '18:02',
            },
            {
              p: 12342,
              a: false,
              ta: new Date().toISOString(),
              py: -23.568,
              px: -46.692,
              t: '18:08',
            },
            {
              p: 12343,
              a: true,
              ta: new Date().toISOString(),
              py: -23.569,
              px: -46.693,
              t: '18:15',
            },
            {
              p: 12344,
              a: false,
              ta: new Date().toISOString(),
              py: -23.57,
              px: -46.694,
              t: '18:22',
            },
          ],
        },
        {
          c: '775A-10',
          cl: 775,
          sl: 1,
          lt0: 'Pinheiros',
          lt1: 'Term. Pirituba',
          qv: 3,
          vs: [
            {
              p: 23451,
              a: false,
              ta: new Date().toISOString(),
              py: -23.566,
              px: -46.69,
              t: '18:03',
            },
            {
              p: 23452,
              a: true,
              ta: new Date().toISOString(),
              py: -23.565,
              px: -46.689,
              t: '18:12',
            },
            {
              p: 23453,
              a: false,
              ta: new Date().toISOString(),
              py: -23.564,
              px: -46.688,
              t: '18:25',
            },
          ],
        },
        {
          c: '177H-10',
          cl: 177,
          sl: 2,
          lt0: 'Lapa',
          lt1: 'Metrô Butantã',
          qv: 2,
          vs: [
            {
              p: 34561,
              a: true,
              ta: new Date().toISOString(),
              py: -23.567,
              px: -46.688,
              t: '18:05',
            },
            {
              p: 34562,
              a: false,
              ta: new Date().toISOString(),
              py: -23.565,
              px: -46.686,
              t: '18:18',
            },
          ],
        },
      ],
    },
    cacheTimestamp: Date.now(),
  };
}

export function createVehicleArriving(stop: BusStopGraphQL): StopArrivalUpdate {
  return createArrival(
    stop,
    {
      c: '477A-10',
      cl: 477,
      sl: 1,
      lt0: 'Pinheiros',
      lt1: 'Metrô Santana',
      qv: 1,
      vs: [
        {
          p: 12345,
          a: true,
          ta: new Date().toISOString(),
          py: stop.latitude,
          px: stop.longitude,
          t: new Date().toTimeString().slice(0, 5),
        },
      ],
    },
    new Date().toTimeString().slice(0, 5),
  );
}

export function createAllAccessibleArrivals(
  stop: BusStopGraphQL,
): StopArrivalUpdate {
  return createArrival(
    stop,
    {
      c: '477A-10',
      cl: 477,
      sl: 1,
      lt0: 'Pinheiros',
      lt1: 'Metrô Santana',
      qv: 3,
      vs: [
        {
          p: 12341,
          a: true,
          ta: new Date().toISOString(),
          py: -23.567,
          px: -46.691,
          t: '10:05',
        },
        {
          p: 12342,
          a: true,
          ta: new Date().toISOString(),
          py: -23.568,
          px: -46.692,
          t: '10:12',
        },
        {
          p: 12343,
          a: true,
          ta: new Date().toISOString(),
          py: -23.569,
          px: -46.693,
          t: '10:20',
        },
      ],
    },
    '10:00',
  );
}
