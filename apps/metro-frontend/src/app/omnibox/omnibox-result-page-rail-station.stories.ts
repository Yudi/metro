import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  withDisabledInitialNavigation,
} from '@angular/router';
import type { ParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { userEvent, within } from 'storybook/test';
import { FavoritesService } from '@metro/shared/api';
import {
  createEmptyFavorites,
  getRailLineById,
  getStaticRailStationsByLine,
} from '@metro/shared/utils';
import type { FavoriteTypes } from '@metro/shared/utils';
import { GeolocationService } from '@metro/shared/geolocation';
import {
  OSASCO,
  OSASCO_L8_TRAINS,
  OSASCO_L9_TRAINS,
  PARAISO,
  PINHEIROS,
  PINHEIROS_TRAINS,
  SANTANA,
  createSubwayStationDialogProviders,
} from '../map-main/components/subway-station-dialog/subway-station-dialog.stories.fixtures';
import { BikeStationsService } from '../map-main/geography/bike-stations.service';
import { GeographyGraphQLService } from '../map-main/geography/geography-graphql.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import type { TypesenseSearchResponse } from '../search/typesense-search.types';
import { OmniboxResultPageComponent } from './omnibox-result-page.component';
import type { BusStopGraphQL } from '../map-main/geography/geography-graphql.service';

interface RailStationScenario {
  id: string;
  name: string;
  lines: string[];
  latitude?: number;
  longitude?: number;
}

function fromSharedStationFixture(
  stop: BusStopGraphQL,
  includeCoordinates = true,
): RailStationScenario {
  return {
    id: stop.stopId,
    name: stop.name,
    lines: (stop.routeShortNames ?? []).map(
      (lineId) => getRailLineById(lineId)?.colorName ?? lineId,
    ),
    ...(includeCoordinates
      ? { latitude: stop.latitude, longitude: stop.longitude }
      : {}),
  };
}

function fromSharedRailCatalog(): RailStationScenario {
  const station = getStaticRailStationsByLine('L3')?.find(
    (candidate) => candidate.code === 'REP',
  );
  if (!station) {
    throw new Error(
      'A estação República deve existir no catálogo ferroviário compartilhado.',
    );
  }

  const lineIds = ['L3', 'L4'];
  const lines = lineIds.flatMap((lineId) => {
    const line = getRailLineById(lineId);
    return line ? [line.colorName] : [];
  });

  return { id: station.code, name: station.name, lines };
}

const STATIONS = {
  Paraíso: fromSharedStationFixture(PARAISO),
  Pinheiros: fromSharedStationFixture(PINHEIROS),
  Osasco: fromSharedStationFixture(OSASCO),
  Santana: fromSharedStationFixture(SANTANA, false),
  República: fromSharedRailCatalog(),
} as const;

type StationKey = keyof typeof STATIONS;

interface RailStationStoryArgs {
  station: StationKey;
  showMapAction: boolean;
}

interface StoryRouteState {
  route: ActivatedRoute;
  showStation(station: StationKey, showMapAction: boolean): void;
}

const STORY_ROUTE_STATE = new InjectionToken<StoryRouteState>(
  'STORY_ROUTE_STATE',
);

function routeQuery(
  station: RailStationScenario,
  showMapAction: boolean,
): Record<string, string> {
  const hasCoordinates =
    showMapAction &&
    station.latitude !== undefined &&
    station.longitude !== undefined;

  return {
    q: station.name.toLowerCase(),
    name: station.name,
    lines: station.lines.join(','),
    ...(hasCoordinates
      ? {
          lat: String(station.latitude),
          lon: String(station.longitude),
        }
      : {}),
  };
}

function createStoryRouteState(): StoryRouteState {
  const initialStation = STATIONS.Pinheiros;
  const params = new BehaviorSubject(
    convertToParamMap({ kind: 'rail-station', id: initialStation.id }),
  );
  const queryParams = new BehaviorSubject<ParamMap>(
    convertToParamMap(routeQuery(initialStation, true)),
  );
  const route = {
    paramMap: params.asObservable(),
    queryParamMap: queryParams.asObservable(),
    get snapshot() {
      return { paramMap: params.value, queryParamMap: queryParams.value };
    },
  } as unknown as ActivatedRoute;

  return {
    route,
    showStation: (stationKey, showMapAction) => {
      const station = STATIONS[stationKey];
      queryParams.next(convertToParamMap(routeQuery(station, showMapAction)));
      params.next(convertToParamMap({ kind: 'rail-station', id: station.id }));
    },
  };
}

@Component({
  selector: 'app-omnibox-rail-station-story-host',
  imports: [OmniboxResultPageComponent],
  template: '<app-omnibox-result-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class OmniboxRailStationStoryHostComponent {
  readonly station = input<StationKey>('Pinheiros');
  readonly showMapAction = input(true);

  constructor() {
    const routeState = inject(STORY_ROUTE_STATE);
    effect(() => {
      routeState.showStation(this.station(), this.showMapAction());
    });
  }
}

function createStoryFavoritesService() {
  const favoriteKeys = signal<ReadonlySet<string>>(new Set());

  return {
    favorites: signal(createEmptyFavorites()),
    isFavorite: (code: string, type: FavoriteTypes) =>
      favoriteKeys().has(`${type}:${code}`),
    addFavorite: (code: string, type: FavoriteTypes) =>
      favoriteKeys.update(
        (current) => new Set([...current, `${type}:${code}`]),
      ),
    removeFavorite: (code: string, type: FavoriteTypes) =>
      favoriteKeys.update((current) => {
        const next = new Set(current);
        next.delete(`${type}:${code}`);
        return next;
      }),
  } satisfies Pick<
    FavoritesService,
    'favorites' | 'isFavorite' | 'addFavorite' | 'removeFavorite'
  >;
}

function createEmptySearchResponse(query: string): TypesenseSearchResponse {
  return { success: true, query, results: [], total: 0 };
}

function createStoryProviders() {
  const routeState = createStoryRouteState();

  return [
    provideRouter([], withDisabledInitialNavigation()),
    { provide: ActivatedRoute, useValue: routeState.route },
    { provide: STORY_ROUTE_STATE, useValue: routeState },
    { provide: BikeStationsService, useValue: {} },
    { provide: GeographyGraphQLService, useValue: {} },
    {
      provide: TypesenseSearchService,
      useValue: {
        search: (query: string) => of(createEmptySearchResponse(query)),
      } satisfies Pick<TypesenseSearchService, 'search'>,
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
    { provide: FavoritesService, useValue: createStoryFavoritesService() },
    ...createSubwayStationDialogProviders(
      PARAISO,
      { cached: null, isFresh: true, fetchKind: 'normal', fetchDelayMs: 0 },
      [
        { lineCode: 'L9', stationCode: 'PIN', trains: PINHEIROS_TRAINS },
        { lineCode: 'L8', stationCode: 'OSA', trains: OSASCO_L8_TRAINS },
        { lineCode: 'L9', stationCode: 'OSA', trains: OSASCO_L9_TRAINS },
      ],
    ),
  ];
}

const meta: Meta<RailStationStoryArgs> = {
  title: 'Busca/Página de resultado da estação',
  component: OmniboxRailStationStoryHostComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        MatDialogModule,
        OmniboxRailStationStoryHostComponent,
        OmniboxResultPageComponent,
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Página de estação como resultado standalone da busca. Paraíso, Pinheiros, Osasco e Santana usam fixtures compartilhadas; República usa o catálogo ferroviário compartilhado.',
      },
    },
  },
  argTypes: {
    station: {
      name: 'Estação',
      control: 'select',
      options: ['Paraíso', 'Pinheiros', 'Osasco', 'Santana', 'República'],
      description: 'Estação e dados compartilhados exibidos na página.',
    },
    showMapAction: {
      name: 'Ver no mapa',
      control: 'boolean',
      description:
        'Inclui coordenadas da fixture para mostrar ou ocultar “Ver no mapa”, quando disponíveis.',
    },
  },
  render: (args) => ({
    props: args,
    applicationConfig: { providers: createStoryProviders() },
    template:
      '<app-omnibox-rail-station-story-host [station]="station" [showMapAction]="showMapAction" />',
  }),
};

export default meta;
type Story = StoryObj<RailStationStoryArgs>;

export const Standalone: Story = {
  args: { station: 'Pinheiros', showMapAction: true },
  name: 'Pinheiros',
};

export const RepublicaInformacoes: Story = {
  args: { station: 'República', showMapAction: false },
  name: 'República - Informações',
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole('tab', { name: /Informações/ }),
    );
  },
};

export const SantanaPrePep: Story = {
  args: { station: 'Santana', showMapAction: false },
  name: 'Santana - PrEP/PEP',
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole('tab', { name: /Informações/ }),
    );
  },
};

export const IntercambioOsasco: Story = {
  args: { station: 'Osasco', showMapAction: true },
  name: 'Osasco - L8 + L9',
};

export const SemAcaoDeMapa: Story = {
  args: { station: 'Pinheiros', showMapAction: false },
  name: 'Sem ação Ver no mapa',
};
