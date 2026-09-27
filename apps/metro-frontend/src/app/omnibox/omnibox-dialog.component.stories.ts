import {
  computed,
  inject,
  provideEnvironmentInitializer,
  DestroyRef,
  signal,
} from '@angular/core';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import {
  applicationConfig,
  Meta,
  StoryObj,
  moduleMetadata,
} from '@storybook/angular';
import { userEvent, within } from 'storybook/test';
import { NEVER, Observable, of, throwError } from 'rxjs';
import type { User } from 'firebase/auth';
import { AuthService, authReady, firebaseUser } from '@metro/shared/firebase';
import {
  GeolocationService,
  type UserLocation,
} from '@metro/shared/geolocation';
import { FavoritesService, LoggerService } from '@metro/shared/api';
import { createEmptyFavorites } from '@metro/shared/utils';
import {
  createMockArrivals,
  createMockLoggerService,
  createMockRealtimeService,
} from '@metro/storybook-mocks';
import { TypesenseSearchService } from '../search/typesense-search.service';
import type {
  NearbyStopsResponse,
  TypesenseSearchResponse,
} from '../search/typesense-search.types';
import {
  GeographyGraphQLService,
  type BusRouteGraphQL,
  type BusStopGraphQL,
} from '../map-main/geography/geography-graphql.service';
import { BusInformationService } from '../map-main/components/bus-information/bus-information.service';
import { RealtimeWebsocketService } from '../map-main/realtime/realtime-websocket.service';
import { BusItineraryService } from '../bus-itinerary/bus-itinerary.service';
import { MenuComponent } from '../menu/menu.component';
import {
  SPTRANS_ITINERARY,
  SPTRANS_NOTICES,
  SPTRANS_PUBLISHED,
} from '../bus-itinerary/bus-itinerary.fixtures';
import {
  createOmniboxSearchResponse,
  OMNIBOX_NEARBY_RESPONSE,
} from './omnibox.fixtures';

type Scenario =
  | 'results'
  | 'empty'
  | 'loading'
  | 'failure'
  | 'nearby'
  | 'long-content';

const fixtureStop: BusStopGraphQL = {
  id: '340015325',
  stopId: '340015325',
  name: 'Av. Paulista, 1000',
  description: 'Em frente ao MASP',
  latitude: -23.5614,
  longitude: -46.656,
  isSubwayStation: false,
  agencies: ['bus'],
  routeShortNames: ['477A'],
  sourceAgency: 'SPTRANS',
  sourceId: '340015325',
};

const fixtureRoute: BusRouteGraphQL = {
  id: 'sptrans:477A-10',
  routeId: '477A-10',
  shortName: '477A-10',
  longName: 'Sacomã – Pinheiros',
  color: '0066CC',
  textColor: 'FFFFFF',
  sourceAgency: 'SPTRANS',
  sourceId: '477A-10',
  supportsRealtime: true,
  fares: [{ price: 5, currency: 'BRL' }],
};

function createGeographyService(): Pick<
  GeographyGraphQLService,
  | 'getBusStop'
  | 'getRoutesForStop'
  | 'getRouteRailConnectionsForStop'
  | 'getScheduledBusDepartures'
> {
  return {
    getBusStop: () => of(fixtureStop),
    getRoutesForStop: () => of([fixtureRoute]),
    getRouteRailConnectionsForStop: () => of([]),
    getScheduledBusDepartures: () => of([]),
  };
}

function createBusItineraryService(): Pick<
  BusItineraryService,
  'load' | 'published'
> {
  return {
    load: () => of(SPTRANS_ITINERARY),
    published: () => of(SPTRANS_PUBLISHED),
  };
}

interface OmniboxStoryArgs {
  scenario: Scenario;
}

function searchResponse(
  scenario: Scenario,
  query: string,
): TypesenseSearchResponse {
  const response = createOmniboxSearchResponse(query);
  if (scenario === 'empty') return { ...response, results: [], total: 0 };
  if (scenario !== 'long-content') return response;

  return {
    ...response,
    results: response.results.map((result) => {
      if (result.type !== 'route') return result;
      const route = result.document;
      return {
        ...result,
        document: {
          ...route,
          route_long_name:
            'Terminal Sacomã · Avenida do Cursino · Avenida Paulista · Consolação · Terminal Pinheiros',
        },
      };
    }),
  };
}

function createSearchService(
  scenario: Scenario,
): Pick<TypesenseSearchService, 'search' | 'searchNearbyStops'> {
  let requestCount = 0;
  return {
    search: (query): Observable<TypesenseSearchResponse> => {
      requestCount++;
      if (scenario === 'loading') return NEVER;
      if (scenario === 'failure' && requestCount === 1) {
        return throwError(() => new Error('Typesense is unavailable'));
      }
      return of(searchResponse(scenario, query));
    },
    searchNearbyStops: (latitude, longitude): Observable<NearbyStopsResponse> =>
      of({
        ...OMNIBOX_NEARBY_RESPONSE,
        center: { lat: latitude, lon: longitude },
      }),
  };
}

function createGeolocationService(): GeolocationService {
  const permission = signal<'prompt' | 'granted'>('prompt');
  const location = signal<UserLocation | null>(null);
  const isRequesting = signal(false);
  const foundLocation: UserLocation = {
    latitude: -23.56,
    longitude: -46.66,
    accuracy: 12,
    timestamp: Date.now(),
  };

  return {
    permission,
    location,
    isRequesting,
    isTracking: signal(false),
    isTrackingOrientation: signal(false),
    orientation: signal(null),
    isSupported: computed(() => true),
    isOrientationSupported: computed(() => false),
    isDisabled: computed(() => false),
    permissionMessage: computed(
      () => 'A localização está disponível nesta demonstração.',
    ),
    requestLocation: async () => {
      isRequesting.set(true);
      permission.set('granted');
      location.set(foundLocation);
      isRequesting.set(false);
      return foundLocation;
    },
    startTracking: () => undefined,
    stopTracking: () => undefined,
    startOrientationTracking: () => undefined,
    stopOrientationTracking: () => undefined,
    ngOnDestroy: () => undefined,
  } as unknown as GeolocationService;
}

const mockUser = {
  uid: 'storybook-passenger',
  displayName: 'Passageiro de exemplo',
  photoURL: '/app/icons/avatar-placeholder.avif',
} as User;

const meta: Meta<OmniboxStoryArgs> = {
  title: 'Navigation/Omnibox',
  component: MenuComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({ imports: [MenuComponent] }),
    applicationConfig({
      providers: [
        provideRouter([], withDisabledInitialNavigation()),
        {
          provide: AuthService,
          useValue: {
            loginGoogle: async () => ({ success: true }),
            logout: async () => ({ success: true }),
          },
        },
        {
          provide: GeographyGraphQLService,
          useFactory: createGeographyService,
        },
        {
          provide: BusItineraryService,
          useFactory: createBusItineraryService,
        },
        {
          provide: BusInformationService,
          useValue: { notices: () => of(SPTRANS_NOTICES) },
        },
        {
          provide: RealtimeWebsocketService,
          useValue: createMockRealtimeService({
            fetchKind: 'arrivals',
            arrivals: new Map([['340015325', createMockArrivals('340015325')]]),
          }),
        },
        {
          provide: LoggerService,
          useValue: createMockLoggerService(),
        },
        {
          provide: FavoritesService,
          useFactory: () => ({
            favorites: signal(createEmptyFavorites()),
            isFavorite: () => false,
            addFavorite: () => undefined,
            removeFavorite: () => undefined,
          }),
        },
        {
          provide: GeolocationService,
          useFactory: createGeolocationService,
        },
        {
          provide: TypesenseSearchService,
          useFactory: () => createSearchService('results'),
        },
      ],
    }),
  ],
  argTypes: {
    scenario: {
      control: 'select',
      options: [
        'results',
        'empty',
        'loading',
        'failure',
        'nearby',
        'long-content',
      ],
      description: 'Estado de busca apresentado pelo diálogo.',
    },
  },
  render: (args) => ({
    applicationConfig: {
      providers: [
        {
          provide: TypesenseSearchService,
          useFactory: () => createSearchService(args.scenario),
        },
        provideEnvironmentInitializer(() => {
          const destroyRef = inject(DestroyRef);
          const previousAuthReady = authReady();
          const previousUser = firebaseUser();
          authReady.set(true);
          firebaseUser.set(mockUser);
          destroyRef.onDestroy(() => {
            authReady.set(previousAuthReady);
            firebaseUser.set(previousUser);
          });
        }),
      ],
    },
    template: '<app-menu />',
  }),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Abra a busca pelo menu para encontrar transporte e destinos do próprio Metro em um único diálogo.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<OmniboxStoryArgs>;

async function openSearch(
  canvasElement: HTMLElement,
  query?: string,
): Promise<ReturnType<typeof within>> {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole('searchbox', {
      name: 'Buscar linhas, paradas e páginas',
    }),
  );
  const dialog = within(canvasElement.ownerDocument.body);
  await dialog.findByRole('dialog', { name: 'Buscar no site' });

  if (query) {
    await userEvent.type(
      dialog.getByLabelText('Linhas, paradas e páginas'),
      query,
    );
  }
  return dialog;
}

export const Results: Story = {
  args: { scenario: 'results' },
  play: async ({ canvasElement }) => {
    const dialog = await openSearch(canvasElement, 'paulista');
    await dialog.findByText(/Sacomã/);
  },
};

export const Empty: Story = {
  args: { scenario: 'empty' },
  play: async ({ canvasElement }) => {
    const dialog = await openSearch(canvasElement, 'xyzq');
    await dialog.findByText(/Nenhum resultado/);
  },
};

export const Loading: Story = {
  args: { scenario: 'loading' },
  play: async ({ canvasElement }) => {
    const dialog = await openSearch(canvasElement, 'paulista');
    await dialog.findByText('Buscando…');
  },
};

export const FailureWithRetry: Story = {
  args: { scenario: 'failure' },
  play: async ({ canvasElement }) => {
    const dialog = await openSearch(canvasElement, 'paulista');
    await dialog.findByRole('alert');
  },
};

export const Nearby: Story = {
  args: { scenario: 'nearby' },
  play: async ({ canvasElement }) => {
    const dialog = await openSearch(canvasElement);
    await userEvent.click(dialog.getByRole('button', { name: /Perto de mim/ }));
    await dialog.findByText('Av. Paulista, 1000');
  },
};

export const LongContent: Story = {
  args: { scenario: 'long-content' },
  play: async ({ canvasElement }) => {
    const dialog = await openSearch(canvasElement, 'paulista');
    await dialog.findByText(/Terminal Sacomã/);
  },
};
