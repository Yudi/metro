import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  withDisabledInitialNavigation,
} from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { ApiService, FavoritesService, LoggerService } from '@metro/shared/api';
import {
  createMockApiService,
  createMockLoggerService,
  createMockRealtimeService,
} from '@metro/storybook-mocks';
import { createEmptyFavorites } from '@metro/shared/utils';
import { signal } from '@angular/core';
import { GeolocationService } from '@metro/shared/geolocation';
import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { concat, map, of, timer } from 'rxjs';
import { userEvent, within } from 'storybook/test';
import { BikeStationsService } from '../map-main/geography/bike-stations.service';
import { GeographyGraphQLService } from '../map-main/geography/geography-graphql.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { createOmniboxSearchResponse } from './omnibox.fixtures';
import { BusItineraryService } from '../bus-itinerary/bus-itinerary.service';
import {
  SPTRANS_ITINERARY,
  SPTRANS_NOTICES,
  SPTRANS_PUBLISHED,
} from '../bus-itinerary/bus-itinerary.fixtures';
import { BusInformationService } from '../map-main/components/bus-information/bus-information.service';
import { RealtimeWebsocketService } from '../map-main/realtime/realtime-websocket.service';
import { OmniboxResultPageComponent } from './omnibox-result-page.component';

function detailRoute(kind: string, id: string, searchTerm: string) {
  const params = convertToParamMap({ kind, id });
  const query = convertToParamMap({ q: searchTerm });
  return {
    paramMap: of(params),
    queryParamMap: of(query),
    snapshot: { queryParamMap: query },
  };
}

const meta: Meta<OmniboxResultPageComponent> = {
  title: 'Busca/Página de resultado',
  component: OmniboxResultPageComponent,
  decorators: [
    moduleMetadata({ imports: [MatDialogModule] }),
    applicationConfig({
      providers: [
        provideRouter([], withDisabledInitialNavigation()),
        {
          provide: ApiService,
          useValue: createMockApiService({
            fetchKind: 'normal',
            fetchDelayMs: 0,
          }),
        },
        { provide: BikeStationsService, useValue: {} },
        { provide: GeographyGraphQLService, useValue: {} },
        {
          provide: TypesenseSearchService,
          useValue: {
            search: (query: string) => of(createOmniboxSearchResponse(query)),
          },
        },
        {
          provide: GeolocationService,
          useValue: {
            location: signal(null),
            isRequesting: signal(false),
            isSupported: signal(false),
            isDisabled: signal(true),
            permissionMessage: signal('Localização indisponível nesta prévia'),
          },
        },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<OmniboxResultPageComponent>;

export const RailLine: Story = {
  decorators: [
    applicationConfig({
      providers: [
        { provide: ActivatedRoute, useValue: detailRoute('rail-line', 'L9', 'linha 9') },
      ],
    }),
  ],
};

export const Unavailable: Story = {
  decorators: [
    applicationConfig({
      providers: [
        { provide: ActivatedRoute, useValue: detailRoute('rail-line', 'unknown', 'linha 9') },
      ],
    }),
  ],
};

export const SearchOpen: Story = {
  decorators: RailLine.decorators,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('searchbox', {
        name: 'Linhas, paradas e páginas',
      }),
    );
    await within(canvasElement.ownerDocument.body).findByRole('dialog', {
      name: 'Buscar no site',
    });
  },
};

export const BusRoute: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: detailRoute('bus-route', '477A-10', '477A'),
        },
        {
          provide: BusItineraryService,
          useValue: {
            published: () => of(SPTRANS_PUBLISHED),
            load: () => of(SPTRANS_ITINERARY),
          },
        },
        {
          provide: BusInformationService,
          useValue: { notices: () => of(SPTRANS_NOTICES) },
        },
      ],
    }),
  ],
};

export const BusStop: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: detailRoute('bus-stop', '340015325', 'paulista'),
        },
        {
          provide: GeographyGraphQLService,
          useValue: {
            watchStopFullData: () => {
              const stop = {
                id: '340015325',
                stopId: '340015325',
                name: 'Av. Paulista, 1000',
                latitude: -23.5614,
                longitude: -46.656,
                isSubwayStation: false,
                agencies: ['bus'],
                routeShortNames: ['477A'],
              };
              return concat(
                of({ stop, hasNext: true }),
                timer(900).pipe(
                  map(() => ({ stop, routes: [], hasNext: false })),
                ),
              );
            },
            getRouteRailConnectionsForStop: () => of([]),
            getScheduledBusDepartures: () => of([]),
          },
        },
        {
          provide: RealtimeWebsocketService,
          useValue: createMockRealtimeService({
            fetchKind: 'no-arrivals',
            arrivals: new Map(),
          }),
        },
        {
          provide: FavoritesService,
          useValue: {
            favorites: signal(createEmptyFavorites()),
            isFavorite: () => false,
            addFavorite: () => undefined,
            removeFavorite: () => undefined,
          },
        },
        { provide: LoggerService, useValue: createMockLoggerService() },
        {
          provide: BusInformationService,
          useValue: { notices: () => of(SPTRANS_NOTICES) },
        },
      ],
    }),
  ],
};
