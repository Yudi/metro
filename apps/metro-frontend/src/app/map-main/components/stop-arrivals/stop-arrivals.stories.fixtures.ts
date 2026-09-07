import { signal } from '@angular/core';
import { NEVER, of, throwError } from 'rxjs';
import { BusInformationService } from '../bus-information/bus-information.service';
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import type { BusStopGraphQL } from '../../geography/geography-graphql.service';
import { RealtimeWebsocketService } from '../../realtime/realtime-websocket.service';
import type { StopArrivalUpdate } from '../../realtime/realtime-websocket.service';
import {
  MOCK_ROUTE_RAIL_CONNECTIONS,
  SCHEDULED_ARTESP_DEPARTURES,
} from '@metro/storybook-mocks';
import { OLHOVIVO_POLL_INTERVAL_MS } from '@metro/shared/utils';

export interface StopArrivalsProviderOptions {
  stop: BusStopGraphQL;
  arrivals?: StopArrivalUpdate;
  isLoading?: boolean;
  scheduledDepartures?: typeof SCHEDULED_ARTESP_DEPARTURES;
  scheduledState?: 'loaded' | 'loading' | 'error';
}

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
          of({
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
        getRouteRailConnectionsForStop: () => of(MOCK_ROUTE_RAIL_CONNECTIONS),
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
