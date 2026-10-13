import { HttpClient } from '@angular/common/http';
import { PLATFORM_ID, provideAppInitializer, signal } from '@angular/core';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import {
  Meta,
  StoryObj,
  applicationConfig,
  componentWrapperDecorator,
} from '@storybook/angular';
import { NEVER, of } from 'rxjs';
import { AuthService, authReady, firebaseUser } from '@metro/shared/firebase';
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
import {
  FavoriteList,
  emptyFavorites,
  encodeBusDirectionFavorite,
} from '@metro/shared/utils';
import { LiteRealtimeService } from '../../shared/realtime/lite-realtime.service';
import { Dashboard } from './dashboard';
import type { BusRouteGraphQL } from './dashboard.types';

type DashboardScenario =
  | 'comFavoritos'
  | 'semFavoritos'
  | 'erroParcial'
  | 'artesp'
  | 'conteudoLongo'
  | 'somenteTrilhos'
  | 'carregando'
  | 'erro';

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

const sptransStoryRoute: BusRouteGraphQL = {
  routeId: '477A-10',
  shortName: '477A-10',
  longName: 'Sacoma - Terminal Pinheiros',
  color: '2563eb',
  textColor: 'ffffff',
  sourceAgency: 'sptrans',
};

const secondSptransStoryRoute: BusRouteGraphQL = {
  routeId: '875A-10',
  shortName: '875A-10',
  longName: 'Aeroporto - Perdizes',
  color: '16a34a',
  textColor: 'ffffff',
  sourceAgency: 'sptrans',
};

function createStoryDirections(route: BusRouteGraphQL): BusRouteGraphQL[] {
  const [origin, destination] = route.longName.split(/\s+[-–]\s+/);
  const firstTerminal = origin || route.longName;
  const secondTerminal = destination || route.longName;
  return [0, 1].map((directionId) => {
    const start = directionId === 0 ? 0 : 1;
    const end = directionId === 0 ? 1 : 0;
    const coordinates = [
      { latitude: -23.55, longitude: -46.63 },
      { latitude: -23.56, longitude: -46.62 },
    ];
    const favoriteCode = encodeBusDirectionFavorite({
      sourceAgency: route.sourceAgency ?? 'sptrans',
      shortName: route.shortName,
      originLatitude: coordinates[start].latitude,
      originLongitude: coordinates[start].longitude,
      viaLatitude: -23.555,
      viaLongitude: -46.625,
      destinationLatitude: coordinates[end].latitude,
      destinationLongitude: coordinates[end].longitude,
    });
    if (!favoriteCode) {
      throw new Error('Story direction key was invalid');
    }
    return {
      ...route,
      favoriteCode,
      destination: directionId === 0 ? secondTerminal : firstTerminal,
      directionId,
    };
  });
}

function resolveFavoriteRows(
  codes: string[],
  routes: BusRouteGraphQL[],
): BusRouteGraphQL[] {
  const directions = routes.flatMap((route) => createStoryDirections(route));
  return codes.flatMap((code) => {
    const savedDirection = directions.find(
      (direction) => direction.favoriteCode === code,
    );
    const matches = savedDirection
      ? [savedDirection]
      : directions.filter((direction) => direction.routeId === code);
    return matches.map((direction) => ({
      ...direction,
      requestedCode: code,
    }));
  });
}

function createFavoriteList(scenario: DashboardScenario): FavoriteList {
  switch (scenario) {
    case 'semFavoritos':
      return { ...emptyFavorites };
    case 'somenteTrilhos':
      return { ...favoriteList, busStop: [], busRoute: [] };
    case 'artesp':
      return artespFavoriteList;
    default:
      return favoriteList;
  }
}

function createFavoritesService(scenario: DashboardScenario) {
  const favorites = createFavoriteList(scenario);
  const selections =
    scenario === 'artesp' ? artespDashboardSelections : dashboardSelections;
  const favoritesState = signal(favorites);

  return {
    favorites: favoritesState.asReadonly(),
    dashboardSelections: signal(selections).asReadonly(),
    migrateDashboardBusStopRoutes: async () => {
      if (scenario === 'erro') {
        throw new Error('Falha simulada ao carregar favoritos');
      }
      return false;
    },
    migrateBusRouteFavorite: async (
      legacyCode: string,
      directionCodes: string[],
    ) => {
      if (!favoritesState().busRoute.includes(legacyCode)) {
        return false;
      }
      favoritesState.update((current) => ({
        ...current,
        busRoute: [
          ...current.busRoute.filter((code) => code !== legacyCode),
          ...directionCodes.filter((code) => !current.busRoute.includes(code)),
        ],
      }));
      return true;
    },
    readFavoritesSnapshot: () => Promise.resolve(favoritesState()),
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
      if (scenario === 'carregando') {
        return NEVER;
      }
      const query =
        typeof body === 'object' && body && 'query' in body
          ? String((body as { query?: string }).query)
          : '';
      const routeIds =
        typeof body === 'object' && body && 'variables' in body
          ? ((body as { variables?: { routeIds?: string[] } }).variables
              ?.routeIds ?? [])
          : [];

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
              multipleBusRoutes: resolveFavoriteRows(routeIds, [
                ROUTE_ARTESP_001,
                ROUTE_ARTESP_WITHOUT_FARE,
              ]),
              multipleBusStops: [ARTESP_ONLY_BUS_STOP],
            },
          } as T);
        }

        return of({
          data: {
            multipleBusRoutes: resolveFavoriteRows(routeIds, [
              sptransStoryRoute,
            ]),
            multipleBusStops: [
              {
                id: 'stop-701441',
                stopId: '701441',
                name:
                  scenario === 'conteudoLongo'
                    ? 'Terminal de Integração — Avenida Professor Francisco Morato / Sentido Centro'
                    : 'Parada Cardeal Arcoverde',
                platformCode:
                  scenario === 'conteudoLongo'
                    ? '12 — Embarque metropolitano'
                    : undefined,
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
                ...createStoryDirections(ROUTE_ARTESP_001),
                ...createStoryDirections(ROUTE_ARTESP_WITHOUT_FARE),
              ],
            },
          } as T);
        }

        return of({
          data: {
            routesForStop: [
              ...createStoryDirections(sptransStoryRoute),
              ...createStoryDirections(secondSptransStoryRoute),
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
    provideRouter([], withDisabledInitialNavigation()),
    provideAppInitializer(() => {
      authReady.set(true);
      firebaseUser.set(null);
    }),
    {
      provide: AuthService,
      useValue: {
        loginGoogle: async () => ({ success: false, reason: 'failed' }),
        logout: async () => ({ success: true }),
      },
    },
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
        `<main style="max-width: 1200px; margin: 0 auto">
          <p style="margin: 0 1rem; font-size: 0.8125rem">
            Demonstração com dados fictícios
          </p>
          ${story}
        </main>`,
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

export const ConteudoLongo: Story = {
  decorators: [
    applicationConfig({
      providers: createDashboardProviders('conteudoLongo'),
    }),
  ],
};

export const SomenteTrilhos: Story = {
  decorators: [
    applicationConfig({
      providers: createDashboardProviders('somenteTrilhos'),
    }),
  ],
};

export const Carregando: Story = {
  decorators: [
    applicationConfig({
      providers: createDashboardProviders('carregando'),
    }),
  ],
};

export const Erro: Story = {
  decorators: [
    applicationConfig({ providers: createDashboardProviders('erro') }),
  ],
};

export const ModoEscuro: Story = {
  render: () => ({ template: '<app-dashboard style="color-scheme: dark" />' }),
  decorators: [
    applicationConfig({ providers: createDashboardProviders('comFavoritos') }),
  ],
};
