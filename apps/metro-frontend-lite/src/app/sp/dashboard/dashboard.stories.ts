import { HttpClient } from '@angular/common/http';
import { PLATFORM_ID, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  Meta,
  StoryObj,
  applicationConfig,
  componentWrapperDecorator,
} from '@storybook/angular';
import { of } from 'rxjs';
import {
  API_BASE_URL,
  DashboardFavoriteSelections,
  FavoritesService,
} from '@metro/shared/api';
import {
  ARTESP_ONLY_BUS_STOP,
  ROUTE_ARTESP_001,
  ROUTE_ARTESP_WITHOUT_FARE,
  SCHEDULED_ARTESP_DEPARTURES,
  createRailStatusResponse,
  LINES_WITH_ISSUES,
} from '@metro/storybook-mocks';
import { FavoriteList, emptyFavorites } from '@metro/shared/utils';
import { LiteRealtimeService } from '../../services/lite-realtime.service';
import { Dashboard } from './dashboard';

type DashboardScenario =
  | 'comFavoritos'
  | 'semFavoritos'
  | 'erroParcial'
  | 'artesp';

const favoriteList: FavoriteList = {
  ...emptyFavorites,
  busStop: ['701441'],
  busRoute: ['477A-10'],
  railStation: ['station:pinheiros'],
  railLine: ['L4', 'EA'],
};

const dashboardSelections: DashboardFavoriteSelections = {
  busStopRoutes: {
    '701441': ['477A-10'],
  },
  railStationLines: {
    'station:pinheiros': ['L4', 'L9'],
  },
};

const artespFavoriteList: FavoriteList = {
  ...emptyFavorites,
  busStop: [ARTESP_ONLY_BUS_STOP.stopId],
  busRoute: [ROUTE_ARTESP_001.routeId, ROUTE_ARTESP_WITHOUT_FARE.routeId],
};

const artespDashboardSelections: DashboardFavoriteSelections = {
  busStopRoutes: {
    [ARTESP_ONLY_BUS_STOP.stopId]: [
      ROUTE_ARTESP_001.routeId,
      ROUTE_ARTESP_WITHOUT_FARE.routeId,
    ],
  },
  railStationLines: {},
};

function createFavoritesService(scenario: DashboardScenario) {
  const favorites =
    scenario === 'semFavoritos'
      ? { ...emptyFavorites }
      : scenario === 'artesp'
        ? artespFavoriteList
        : favoriteList;
  const selections =
    scenario === 'artesp' ? artespDashboardSelections : dashboardSelections;

  return {
    favorites: signal(favorites).asReadonly(),
    dashboardSelections: signal(selections).asReadonly(),
    readFavoritesSnapshot: () => Promise.resolve(favorites),
    readDashboardSelectionsSnapshot: () => Promise.resolve(selections),
  };
}

function createRealtimeService(scenario: DashboardScenario) {
  return {
    fetchStopArrivalOnce: () =>
      Promise.resolve(
        scenario === 'erroParcial'
          ? null
          : {
              stopCode: '701441',
              hr: '14:32',
              cacheTimestamp: Date.now(),
              p: {
                cp: 701441,
                np: 'Parada Cardeal Arcoverde',
                py: -23.5678,
                px: -46.6934,
                l: [
                  {
                    c: '477A-10',
                    cl: 477,
                    sl: 1,
                    lt0: 'Terminal Pinheiros',
                    lt1: 'Sacoma',
                    qv: 2,
                    vs: [
                      {
                        p: 42131,
                        a: true,
                        ta: new Date().toISOString(),
                        py: -23.56,
                        px: -46.68,
                        t: '14:36',
                      },
                    ],
                  },
                ],
              },
            },
      ),
  };
}

function createHttpClient(
  scenario: DashboardScenario,
): Pick<HttpClient, 'post'> {
  return {
    post: <T>(url: string, body: unknown) => {
      const query =
        typeof body === 'object' && body && 'query' in body
          ? String((body as { query?: string }).query)
          : '';

      if (
        scenario === 'erroParcial' &&
        query.includes('LiteDashboardBusFavorites')
      ) {
        return of(null as T);
      }

      if (query.includes('LiteDashboardBusFavorites')) {
        if (scenario === 'artesp') {
          return of({
            data: {
              multipleBusRoutes: [
                ROUTE_ARTESP_001,
                ROUTE_ARTESP_WITHOUT_FARE,
              ],
              multipleBusStops: [ARTESP_ONLY_BUS_STOP],
            },
          } as T);
        }

        return of({
          data: {
            multipleBusRoutes: [
              {
                routeId: '477A-10',
                shortName: '477A-10',
                longName: 'Sacoma - Terminal Pinheiros',
                color: '2563eb',
                textColor: 'ffffff',
              },
            ],
            multipleBusStops: [
              {
                id: 'stop-701441',
                stopId: '701441',
                name: 'Parada Cardeal Arcoverde',
                latitude: -23.5678,
                longitude: -46.6934,
                isSubwayStation: false,
                agencies: ['SPTrans'],
                routeShortNames: ['477A-10', '875A-10'],
              },
            ],
          },
        } as T);
      }

      if (query.includes('LiteDashboardMergedRailStations')) {
        return of({
          data: {
            mergedRailStations: [
              {
                id: 'pinheiros',
                name: 'Pinheiros',
                lines: ['Amarela', 'Esmeralda'],
              },
            ],
          },
        } as T);
      }

      if (query.includes('LiteDashboardRailStatus')) {
        return of({
          data: {
            railLinesStatus: createRailStatusResponse(LINES_WITH_ISSUES),
            railSpecialLinesStatus: [
              {
                code: 'EA',
                colorName: 'Preto',
                colorHex: '#111827',
                line: 'Expresso Aeroporto',
                statusCode: 'OperacaoNormal',
                statusLabel: 'Operação Normal',
                statusColor: 'verde',
                nextDepartures: [{ label: 'Próxima partida', time: '15:00' }],
                issues: [],
              },
            ],
          },
        } as T);
      }

      if (query.includes('LiteDashboardRoutesForStop')) {
        if (scenario === 'artesp') {
          return of({
            data: {
              routesForStop: [
                ROUTE_ARTESP_001,
                ROUTE_ARTESP_WITHOUT_FARE,
              ],
            },
          } as T);
        }

        return of({
          data: {
            routesForStop: [
              {
                id: 'route-477a',
                routeId: '477A-10',
                shortName: '477A-10',
                longName: 'Sacoma - Terminal Pinheiros',
                color: '2563eb',
                textColor: 'ffffff',
              },
              {
                id: 'route-875a',
                routeId: '875A-10',
                shortName: '875A-10',
                longName: 'Aeroporto - Perdizes',
                color: '16a34a',
                textColor: 'ffffff',
              },
            ],
          },
        } as T);
      }

      if (query.includes('LiteDashboardNextTrains')) {
        return of({
          data: {
            nextTrains: {
              trains: [
                {
                  lineCode: 'L4',
                  stationCode: 'PIN',
                  destinationCode: 'LUZ',
                  destinationName: 'Luz',
                  arrivalTime: '14:41',
                  isAtPlatform: false,
                },
                {
                  lineCode: 'L4',
                  stationCode: 'PIN',
                  destinationCode: 'VPT',
                  destinationName: 'Vila Sonia',
                  arrivalTime: '14:47',
                  isAtPlatform: false,
                },
              ],
            },
          },
        } as T);
      }

      if (query.includes('LiteDashboardScheduledBusDepartures')) {
        return of({
          data: {
            scheduledBusDepartures:
              scenario === 'artesp' ? SCHEDULED_ARTESP_DEPARTURES : [],
          },
        } as T);
      }

      return of({ data: {} } as T);
    },
  };
}

function createDashboardProviders(scenario: DashboardScenario) {
  return [
    provideRouter([{ path: '', component: Dashboard }]),
    { provide: API_BASE_URL, useValue: '/api' },
    { provide: PLATFORM_ID, useValue: 'browser' },
    {
      provide: FavoritesService,
      useValue: createFavoritesService(scenario),
    },
    {
      provide: LiteRealtimeService,
      useValue: createRealtimeService(scenario),
    },
    {
      provide: HttpClient,
      useValue: createHttpClient(scenario),
    },
  ];
}

const meta: Meta<Dashboard> = {
  title: 'Lite/Dashboard',
  component: Dashboard,
  tags: ['autodocs'],
  decorators: [
    componentWrapperDecorator(
      (story) =>
        `<main style="max-width: 960px; margin: 0 auto">${story}</main>`,
    ),
  ],
};

export default meta;
type Story = StoryObj<Dashboard>;

export const ComFavoritos: Story = {
  decorators: [
    applicationConfig({
      providers: createDashboardProviders('comFavoritos'),
    }),
  ],
};

export const SemFavoritos: Story = {
  decorators: [
    applicationConfig({
      providers: createDashboardProviders('semFavoritos'),
    }),
  ],
};

export const ErroParcial: Story = {
  decorators: [
    applicationConfig({
      providers: createDashboardProviders('erroParcial'),
    }),
  ],
};

export const ArtespScheduledOnly: Story = {
  decorators: [
    applicationConfig({
      providers: createDashboardProviders('artesp'),
    }),
  ],
};
