import { HttpClient } from '@angular/common/http';
import { PLATFORM_ID, signal } from '@angular/core';
import type { ApplicationConfig, Provider } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ApiService, FavoritesService } from '@metro/shared/api';
import type { FavoriteList } from '@metro/shared/utils';
import {
  createEmptyFavorites,
  encodeBusDirectionFavorite,
  getRailStationFavoriteKey,
} from '@metro/shared/utils';
import {
  createMockApiService,
  createMockArrivals,
  PINHEIROS_BUS_STOP,
  ROUTE_477A,
  ROUTE_ARTESP_001,
  SCHEDULED_ARTESP_DEPARTURES,
  SHARED_SPTRANS_ARTESP_BUS_STOP,
} from '@metro/storybook-mocks';
import {
  applicationConfig,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { userEvent, within } from 'storybook/test';
import { NEVER, of, throwError } from 'rxjs';
import type {
  BusRouteGraphQL,
  BusStopGraphQL,
} from '../map-main/geography/geography-graphql.service';
import { GeographyGraphQLService } from '../map-main/geography/geography-graphql.service';
import { createStopArrivalsProviders } from '../map-main/components/stop-arrivals/stop-arrivals.stories.fixtures';
import {
  SCHEDULED_SERVICE_FALLBACK,
  SCHEDULED_SERVICE_ORIGIN,
  createNextTrainCardProviders,
} from '../next-train/components/next-train-card/next-train-card.stories.fixtures';
import type {
  BusRouteInsight,
  MergedRailStationInsight,
} from './insights-dashboard.types';
import { InsightsDashboardComponent } from './insights-dashboard.component';

const PINHEIROS_FAVORITE_KEY = getRailStationFavoriteKey('Pinheiros');
const PINHEIROS_RAIL_FIXTURE: MergedRailStationInsight = {
  id: 'storybook-pinheiros',
  name: 'Pinheiros',
  lines: ['ESMERALDA'],
};

function createDashboardBusRouteFavorite(): string {
  const favorite = encodeBusDirectionFavorite({
    sourceAgency: 'SPTRANS',
    shortName: '477A-10',
    originLatitude: -23.5669,
    originLongitude: -46.6918,
    viaLatitude: -23.5701,
    viaLongitude: -46.7002,
    destinationLatitude: -23.5812,
    destinationLongitude: -46.6821,
  });

  if (!favorite) {
    throw new Error('Could not create the Storybook bus route favorite key.');
  }

  return favorite;
}

const DASHBOARD_BUS_ROUTE_FAVORITE = createDashboardBusRouteFavorite();

const MIXED_STOP_ROUTES: BusRouteGraphQL[] = [
  ROUTE_477A,
  ROUTE_ARTESP_001,
];

type BusLookupState = 'success' | 'loading' | 'failure' | 'partial-failure';

interface DashboardStoryOptions {
  favorites?: Partial<FavoriteList>;
  busLookup?: BusLookupState;
  stop?: BusStopGraphQL;
  stopName?: string;
  routesForStop?: BusRouteGraphQL[];
  selectedBusRouteKeys?: string[];
  selectedRailLineIds?: string[];
  favoriteBusRoutes?: BusRouteInsight[];
  favoriteBusRouteDestination?: string;
  mergedRailStations?: MergedRailStationInsight[];
}

type DashboardStoryProviders = NonNullable<ApplicationConfig['providers']>;

function routeInsightForStory(
  route: BusRouteGraphQL,
  destination = route.destination ?? 'Pinheiros',
): BusRouteInsight {
  return {
    routeId: route.routeId,
    shortName: route.shortName,
    longName: route.longName,
    favoriteCode: DASHBOARD_BUS_ROUTE_FAVORITE,
    requestedCode: DASHBOARD_BUS_ROUTE_FAVORITE,
    destination,
    directionId: route.directionId ?? 0,
    sourceAgency: route.sourceAgency,
    sourceId: route.sourceId,
    color: route.color,
    textColor: route.textColor,
    supportsRealtime: route.supportsRealtime,
    fares: route.fares,
  };
}

function createDashboardHttpClient(options: DashboardStoryOptions) {
  const stop = options.stop ?? SHARED_SPTRANS_ARTESP_BUS_STOP;
  const routesForStop = options.routesForStop ?? MIXED_STOP_ROUTES;

  return {
    post: (_url: string, body: { query: string }) => {
      if (body.query.includes('MergedRailStationsForInsights')) {
        return of({
          data: {
            mergedRailStations:
              options.mergedRailStations ?? [PINHEIROS_RAIL_FIXTURE],
          },
        });
      }

      if (body.query.includes('BusFavoritesLookup')) {
        switch (options.busLookup ?? 'success') {
          case 'loading':
            return NEVER;
          case 'failure':
            return throwError(() => new Error('Storybook lookup failure'));
          case 'success':
          case 'partial-failure': {
            const response = {
              data: {
                multipleBusRoutes:
                  options.favoriteBusRoutes ??
                  (options.favorites?.busRoute?.length
                    ? [
                        routeInsightForStory(
                          routesForStop[0] ?? ROUTE_477A,
                          options.favoriteBusRouteDestination,
                        ),
                      ]
                    : []),
                multipleBusStops: [
                  {
                    stopId: stop.stopId,
                    name: options.stopName ?? stop.name,
                    agencies: stop.agencies,
                    routeShortNames: routesForStop.map(
                      (route) => route.shortName,
                    ),
                    sourceAgency: stop.sourceAgency,
                    sourceId: stop.sourceId,
                    platformCode: stop.platformCode,
                    mergedStopIds: stop.mergedStopIds,
                  },
                ],
              },
            };

            return options.busLookup === 'partial-failure'
              ? of({ ...response, errors: [{ message: 'Partial fixture error' }] })
              : of(response);
          }
        }
      }

      return of({ data: {} });
    },
  };
}

function createDashboardGeographyProviders(
  stop: BusStopGraphQL,
  routes: BusRouteGraphQL[],
): Provider[] {
  const stopArrivalProviders = createStopArrivalsProviders({
    stop,
    arrivals: createMockArrivals(stop.stopId),
    scheduledDepartures: SCHEDULED_ARTESP_DEPARTURES,
  });
  const [busInformationProvider, originalGeographyProvider, realtimeProvider] =
    stopArrivalProviders;
  const geographyValue = (
    originalGeographyProvider as { useValue: Record<string, unknown> }
  ).useValue;

  return [
    busInformationProvider,
    {
      provide: GeographyGraphQLService,
      useValue: {
        ...geographyValue,
        getRoutesForStop: () => of(routes),
      },
    },
    realtimeProvider,
  ];
}

function createDashboardProviders(
  options: DashboardStoryOptions = {},
): DashboardStoryProviders {
  const stop = options.stop ?? SHARED_SPTRANS_ARTESP_BUS_STOP;
  const routesForStop = options.routesForStop ?? MIXED_STOP_ROUTES;
  const favorites = signal<FavoriteList>({
    ...createEmptyFavorites(),
    ...options.favorites,
  });
  const busStopRoutes =
    options.selectedBusRouteKeys === undefined
      ? {}
      : { [stop.stopId]: options.selectedBusRouteKeys };
  const railStationLines =
    options.selectedRailLineIds === undefined
      ? {}
      : { [PINHEIROS_FAVORITE_KEY]: options.selectedRailLineIds };

  const favoritesService = {
    favorites: favorites.asReadonly(),
    dashboardSelections: signal({ railStationLines, busStopRoutes }),
    migrateDashboardBusStopRoutes: async () => false,
    migrateBusRouteFavorite: async () => false,
    preserveBusLineFavorite: async () => false,
  };

  return [
    provideRouter([]),
    { provide: PLATFORM_ID, useValue: 'browser' },
    { provide: HttpClient, useValue: createDashboardHttpClient(options) },
    { provide: FavoritesService, useValue: favoritesService },
    { provide: ApiService, useValue: createMockApiService({ fetchKind: 'normal', fetchDelayMs: 0 }) },
    ...createNextTrainCardProviders({
      connected: true,
      lastUpdate: Date.now(),
      trains: [],
      lineCode: 'L9',
      stationCode: 'PIN',
      scheduledServices: [SCHEDULED_SERVICE_FALLBACK, SCHEDULED_SERVICE_ORIGIN],
    }),
    ...createDashboardGeographyProviders(stop, routesForStop),
  ];
}

const meta: Meta<InsightsDashboardComponent> = {
  title: 'Dashboard/InsightsDashboard',
  component: InsightsDashboardComponent,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Painel de favoritos de transporte com horários de ônibus e trem, status das linhas e composição estática das plataformas.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<InsightsDashboardComponent>;

function mixedFavoritesDecorator() {
  return applicationConfig({
    providers: createDashboardProviders({
      favorites: {
        busStop: [SHARED_SPTRANS_ARTESP_BUS_STOP.stopId],
        busRoute: [DASHBOARD_BUS_ROUTE_FAVORITE],
        railStation: [PINHEIROS_FAVORITE_KEY],
      },
      selectedBusRouteKeys: [
        ROUTE_477A.routeId,
        ROUTE_ARTESP_001.routeId,
      ],
      selectedRailLineIds: ['L9'],
    }),
  });
}

export const MixedFavorites: Story = {
  decorators: [mixedFavoritesDecorator()],
};

export const MixedFavoritesInteraction: Story = {
  decorators: [mixedFavoritesDecorator()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const spTransRoute = await canvas.findByRole('button', {
      name: /477A-10/,
    });
    await userEvent.click(spTransRoute);
    await canvas.findByText('Próximos ônibus');

    const compositionTab = await canvas.findByRole('tab', {
      name: 'Composição',
    });
    await userEvent.click(compositionTab);
    await canvas.findByLabelText(
      /Escada rolante de subida próxima ao carro 1, porta 1/,
    );
  },
};

export const Empty: Story = {
  decorators: [
    applicationConfig({
      providers: createDashboardProviders({ favorites: createEmptyFavorites() }),
    }),
  ],
};

export const LoadingLookup: Story = {
  decorators: [
    applicationConfig({
      providers: createDashboardProviders({
        favorites: {
          busStop: [SHARED_SPTRANS_ARTESP_BUS_STOP.stopId],
          railStation: [PINHEIROS_FAVORITE_KEY],
        },
        busLookup: 'loading',
      }),
    }),
  ],
};

export const PartialLookupFailure: Story = {
  decorators: [
    applicationConfig({
      providers: createDashboardProviders({
        favorites: { busStop: [PINHEIROS_BUS_STOP.stopId] },
        busLookup: 'partial-failure',
        stop: PINHEIROS_BUS_STOP,
        routesForStop: [ROUTE_477A],
        selectedBusRouteKeys: [ROUTE_477A.routeId],
      }),
    }),
  ],
};

export const NoSelectedLines: Story = {
  decorators: [
    applicationConfig({
      providers: createDashboardProviders({
        favorites: {
          busStop: [SHARED_SPTRANS_ARTESP_BUS_STOP.stopId],
          railStation: [PINHEIROS_FAVORITE_KEY],
        },
        selectedBusRouteKeys: [],
        selectedRailLineIds: [],
      }),
    }),
  ],
};

const LONG_STOP_NAME =
  'Terminal Metropolitano de São Bernardo do Campo – Plataforma de embarque sentido Praça Ramos de Azevedo';
const LONG_ROUTE_DESTINATION =
  'Terminal Metropolitano de São Bernardo do Campo – São Paulo (Terminal Sacomã)';
const LONG_LABEL_ROUTE: BusRouteGraphQL = {
  ...ROUTE_477A,
  favoriteCode: DASHBOARD_BUS_ROUTE_FAVORITE,
  destination: LONG_ROUTE_DESTINATION,
  longName: LONG_ROUTE_DESTINATION,
};
const LONG_LABEL_STOP: BusStopGraphQL = {
  ...SHARED_SPTRANS_ARTESP_BUS_STOP,
  name: LONG_STOP_NAME,
};

export const LongLabelsResponsive: Story = {
  decorators: [
    applicationConfig({
      providers: createDashboardProviders({
        favorites: {
          busStop: [LONG_LABEL_STOP.stopId],
          busRoute: [DASHBOARD_BUS_ROUTE_FAVORITE],
        },
        stop: LONG_LABEL_STOP,
        stopName: LONG_STOP_NAME,
        routesForStop: [LONG_LABEL_ROUTE],
        selectedBusRouteKeys: [DASHBOARD_BUS_ROUTE_FAVORITE],
        favoriteBusRoutes: [
          routeInsightForStory(LONG_LABEL_ROUTE, LONG_ROUTE_DESTINATION),
        ],
      }),
    }),
  ],
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
