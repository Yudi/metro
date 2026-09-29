import {
  Meta,
  StoryObj,
  applicationConfig,
  moduleMetadata,
} from '@storybook/angular';
import { ChangeDetectionStrategy, Component, afterNextRender, inject, input } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { userEvent, waitFor, within } from 'storybook/test';
import { MapMainComponent } from '../../map-main.component';
import {
  createMapStoryProviders,
  MAP_STORY_ROUTER_PROVIDERS,
  STORY_MAP_DEFAULT_STATION,
} from './map.stories.fixtures';
import { ROUTE_477A, ROUTE_ARTESP_001, PINHEIROS_BUS_STOP, BIKE_STATION_FULL } from '@metro/storybook-mocks';
import type { SelectedRoute } from './map.types';
import {
  PARAISO,
} from '../subway-station-dialog/subway-station-dialog.stories.fixtures';

const LONG_STATION_NAME_FIXTURE = {
  ...PARAISO,
  id: 'story:long-station-name',
  stopId: 'story:long-station-name',
  name: 'Terminal Intermunicipal Jardim Paulista – Conexão Azul e Verde',
  description:
    'Nome fictício usado para conferir a quebra de linha no painel de detalhes.',
  routeShortNames: ['AZUL', 'VERDE'],
};

const SORTED_AGENCY_LINES_FIXTURE = {
  ...PARAISO,
  id: 'story:sorted-agency-lines',
  stopId: 'story:sorted-agency-lines',
  name: 'Estação fictícia',
  description: 'Conexão sintética usada para demonstrar a ordem das linhas.',
  routeShortNames: ['L15', 'L5', 'L4', 'L1'],
};

@Component({
  selector: 'app-map-story-host',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  host: { '[class.map-story-dark]': 'dark()' },
  styles: ':host { display: block; } :host(.map-story-dark) { color-scheme: dark; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class MapStoryHostComponent {
  readonly dark = input(false);
  private readonly router = inject(Router);

  constructor() {
    afterNextRender(() => {
      void this.router.navigateByUrl('/sp/mapa', { skipLocationChange: true });
    });
  }
}

const meta: Meta<MapMainComponent> = {
  title: 'Bus/Map/MapTab',
  component: MapMainComponent,
  tags: ['autodocs'],
  render: () => renderMapStoryHost(),
  decorators: [
    moduleMetadata({ imports: [MapStoryHostComponent] }),
    applicationConfig({ providers: MAP_STORY_ROUTER_PROVIDERS }),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The story uses the real map tab, route shell, OpenLayers controls, and map panel. The basemap comes from Carto; transit routes and station markers are synthetic local fixtures and do not call the application API.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<MapMainComponent>;

function renderMapStoryHost(dark = false) {
  return {
    template: dark
      ? '<app-map-story-host [dark]="true" />'
      : '<app-map-story-host />',
  };
}

function selectedRoute(route: typeof ROUTE_477A | typeof ROUTE_ARTESP_001): SelectedRoute {
  return {
    id: route.routeId,
    shortName: route.shortName,
    longName: route.longName,
    color: route.color,
    textColor: route.textColor,
    sourceAgency: route.sourceAgency,
    supportsRealtime: route.supportsRealtime,
    fares: route.fares,
  };
}

async function verifyMapShell(canvasElement: HTMLElement): Promise<void> {
  const document = canvasElement.ownerDocument;
  const window = document.defaultView;
  if (!window) throw new Error('Storybook document has no window');

  await waitFor(
    () => {
      if (!canvasElement.querySelector('.ol-viewport')) {
        throw new Error('OpenLayers map has not initialized');
      }
    },
    { timeout: 6_000 },
  );

  const layout = document.querySelector('.layout-container.viewport-layout');
  if (!layout) throw new Error('Map route did not activate viewport layout');
  if (!document.querySelector('.toolbar-content.viewport-content')) {
    throw new Error('Map route did not use viewport content');
  }
  if (!document.querySelector('app-bottom-toolbar')) {
    throw new Error('The mobile city tabs are missing from the real shell');
  }
  if (document.querySelector('.layout-container app-footer')) {
    throw new Error('The site footer should be omitted from the map route');
  }

  if (window.innerWidth < 768) {
    const map = document.querySelector<HTMLElement>('.map-wrapper');
    const tabs = document.querySelector<HTMLElement>(
      'app-bottom-toolbar .bottom-toolbar',
    );
    if (!map || !tabs) throw new Error('Mobile map or city tabs are missing');
    if (window.getComputedStyle(tabs).display === 'none') {
      throw new Error('The mobile city tabs should remain visible');
    }
    const panel = document.querySelector<HTMLElement>('.map-panel');
    await waitFor(() => {
      if (!panel || Math.abs(panel.getBoundingClientRect().bottom - tabs.getBoundingClientRect().top) > 1) {
        throw new Error('The panel and mobile city tabs do not share a moving edge');
      }
      if (Math.abs(map.getBoundingClientRect().bottom - window.innerHeight) > 1) {
        throw new Error('The map viewport should remain stable behind the sliding tabs');
      }
    });
  }

  if (document.documentElement.scrollHeight > window.innerHeight + 1) {
    throw new Error('The map route introduced page-level scrolling');
  }
}

function withMapState(
  state: Parameters<typeof createMapStoryProviders>[0],
): Story['decorators'] {
  return [applicationConfig({ providers: createMapStoryProviders(state) })];
}

export const CityOverview: Story = {
  decorators: withMapState({}),
  parameters: {
    docs: {
      description: {
        story:
          'Shows the default map tab with local São Paulo rail, bus stop, and bike station fixtures over the Carto basemap.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await verifyMapShell(canvasElement);

    const canvas = within(canvasElement);
    for (const label of [
      'Pesquisar no mapa',
      'Camadas',
      'Opções',
    ]) {
      if (!canvasElement.ownerDocument.querySelector(`[aria-label="${label}"]`)) {
        throw new Error(`Expected map control "${label}"`);
      }
    }

    await userEvent.click(canvas.getByRole('button', { name: 'Opções' }));
    const menu = within(canvasElement.ownerDocument.body).getByRole('menu', {
      name: 'Opções do mapa',
    });
    if (
      !within(menu).getByRole('menuitem', {
        name: 'Enquadrar itens visíveis',
      })
    ) {
      throw new Error('The fit-to-visible-items action is missing');
    }

    await userEvent.keyboard('{Escape}');

    // Open the real layer panel, toggle the station layer, then restore the
    // original state and close the panel so the story remains an overview.
    await userEvent.click(canvas.getByRole('button', { name: 'Camadas' }));
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => {
      if (!page.queryByRole('checkbox', { name: 'Estações de trem' })) {
        throw new Error('The map layer panel did not open');
      }
    });
    const stations = page.getByRole('checkbox', {
      name: 'Estações de trem',
    }) as HTMLInputElement;
    await userEvent.click(stations);
    await userEvent.click(stations);
    await userEvent.click(canvas.getByRole('button', { name: 'Fechar detalhes' }));
    await waitFor(() => {
      if (page.queryByRole('region', { name: /Detalhes no mapa/ })) {
        throw new Error('The layer panel is still open');
      }
    });
  },
};

export const RoutesSelected: Story = {
  decorators: withMapState({
    selectedRoutes: [selectedRoute(ROUTE_477A), selectedRoute(ROUTE_ARTESP_001)],
  }),
  parameters: {
    docs: {
      description: {
        story:
          'Displays the real selection chips with two selected routes while the map remains pannable and zoomable.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await verifyMapShell(canvasElement);
    if (!canvasElement.querySelector('app-map-selections-panel')) {
      throw new Error('The selected routes panel is missing');
    }
    const canvas = within(canvasElement);
    const selectionToggle = canvas.getByRole('slider', {
      name: 'Altura do painel do mapa',
    });
    await userEvent.click(selectionToggle);
    await waitFor(() => {
      const text = canvasElement.textContent ?? '';
      if (
        !text.includes(ROUTE_477A.shortName) ||
        !text.includes(ROUTE_ARTESP_001.shortName)
      ) {
        throw new Error('Selected route chips are not expanded');
      }
    });
    const text = canvasElement.textContent ?? '';
    if (!text.includes(ROUTE_477A.shortName)) {
      throw new Error('The first route selection is not visible');
    }
    if (!text.includes(ROUTE_ARTESP_001.shortName)) {
      throw new Error('The second route selection is not visible');
    }
    await userEvent.keyboard('{Home}');
  },
};

export const ArtespVehiclePosition: Story = {
  decorators: withMapState({
    selectedRoutes: [selectedRoute(ROUTE_ARTESP_001)],
    vehiclePositions: new Map([
      [
        ROUTE_ARTESP_001.routeId,
        {
          routeShortName: ROUTE_ARTESP_001.routeId,
          routeLabel: ROUTE_ARTESP_001.shortName,
          hr: '2026-09-28T12:00:00.000Z',
          l: [],
          positions: [
            {
              plate: 'ABC1D23',
              latitude: -23.55,
              longitude: -46.63,
              recordedAt: '2026-09-28T12:00:00.000Z',
            },
          ],
          cacheTimestamp: Date.parse('2026-09-28T12:00:00.000Z'),
        },
      ],
    ]),
  }),
  parameters: {
    docs: {
      description: {
        story:
          'Shows a synthetic ARTESP bus marker using the existing bus icon and route color, with the plate available from the map feature popup.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await verifyMapShell(canvasElement);
    const text = canvasElement.textContent ?? '';
    if (!text.includes(ROUTE_ARTESP_001.shortName)) {
      throw new Error('The selected ARTESP route label is not visible');
    }
  },
};

export const StationDetailsCompact: Story = {
  decorators: withMapState({
    stationDetail: {
      stop: STORY_MAP_DEFAULT_STATION,
      summary: 'Linhas 1-Azul e 2-Verde',
      initialSnap: 'compact',
    },
  }),
  parameters: {
    docs: {
      description: {
        story:
          'Starts with Paraíso selected in the compact map panel state used by the mobile bottom sheet.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await verifyMapShell(canvasElement);
    const panel = canvasElement.querySelector<HTMLElement>('.map-panel');
    if (panel?.dataset['snap'] !== 'compact') {
      throw new Error('Station details should start in the compact panel state');
    }
    if (!panel.getAttribute('aria-label')?.includes(PARAISO.name)) {
      throw new Error('The selected station name is missing from the panel');
    }
  },
};

export const StationDetailsSortedAgencyGroups: Story = {
  decorators: withMapState({
    stationDetail: {
      stop: SORTED_AGENCY_LINES_FIXTURE,
      initialSnap: 'expanded',
    },
  }),
  parameters: {
    docs: {
      description: {
        story:
          'Shows fictitious station data with line badges sorted within each agency and agency groups ordered by their first line number.',
      },
    },
  },
};

export const BusStopDetails: Story = {
  decorators: withMapState({ busStopDetail: true }),
  parameters: {
    docs: { description: { story: 'Shows a bus stop on the map with its details panel expanded.' } },
  },
  play: async ({ canvasElement }) => {
    await verifyMapShell(canvasElement);
    const panel = canvasElement.querySelector<HTMLElement>('.map-panel');
    if (panel?.dataset['snap'] !== 'expanded' ||
        !panel.getAttribute('aria-label')?.includes(PINHEIROS_BUS_STOP.name)) {
      throw new Error('The bus stop details panel is missing');
    }
  },
};

export const BikeStationDetails: Story = {
  decorators: withMapState({ bikeStationDetail: true }),
  parameters: {
    docs: { description: { story: 'Shows bike stations on the map with one station selected.' } },
  },
  play: async ({ canvasElement }) => {
    await verifyMapShell(canvasElement);
    const panel = canvasElement.querySelector<HTMLElement>('.map-panel');
    if (panel?.dataset['snap'] !== 'expanded' ||
        !panel.getAttribute('aria-label')?.includes(BIKE_STATION_FULL.name)) {
      throw new Error('The bike station details panel is missing');
    }
  },
};

export const StationDetailsExpandedWithLongName: Story = {
  decorators: withMapState({
    stationDetail: {
      stop: LONG_STATION_NAME_FIXTURE,
      summary: 'Nome de estação fictício para testar a quebra de linha.',
      initialSnap: 'expanded',
    },
  }),
  parameters: {
    docs: {
      description: {
        story:
          'Uses an explicitly fictitious long station name in the expanded detail panel to expose title wrapping and content height.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await verifyMapShell(canvasElement);
    const panel = canvasElement.querySelector<HTMLElement>('.map-panel');
    if (panel?.dataset['snap'] !== 'expanded') {
      throw new Error('Station details should start in the expanded state');
    }
    if (
      !panel
        .getAttribute('aria-label')
        ?.includes(LONG_STATION_NAME_FIXTURE.name)
    ) {
      throw new Error('The long station name is missing from the panel');
    }
  },
};

export const DarkStationDetails: Story = {
  decorators: withMapState({
    stationDetail: {
      stop: PARAISO,
      summary: 'Linhas 1-Azul e 2-Verde',
      initialSnap: 'expanded',
    },
  }),
  render: () => renderMapStoryHost(true),
  parameters: {
    docs: {
      description: {
        story:
          'Sets color-scheme: dark on a story-only wrapper to inspect the real Material panel and controls. The Carto basemap remains tied to the browser system preference, and transit features are local synthetic fixtures.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await verifyMapShell(canvasElement);
    const darkHost = canvasElement.querySelector<HTMLElement>(
      '.map-story-dark',
    );
    if (
      !darkHost ||
      canvasElement.ownerDocument.defaultView?.getComputedStyle(darkHost)
        .colorScheme !== 'dark'
    ) {
      throw new Error('The story-only dark color scheme is not active');
    }
    const panel = canvasElement.querySelector<HTMLElement>('.map-panel');
    if (panel?.dataset['snap'] !== 'expanded') {
      throw new Error('Station details should start expanded in dark mode');
    }
  },
};

export const LocationDenied: Story = {
  decorators: withMapState({ locationPermission: 'denied' }),
  parameters: {
    docs: {
      description: {
        story:
          'Shows how map actions communicate a browser location denial while keeping the map and layer controls available.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await verifyMapShell(canvasElement);
    const canvas = within(canvasElement);
    const locationButton = canvas.getByRole('button', {
      name: 'Perto de mim',
    }) as HTMLButtonElement;
    if (!locationButton.disabled) {
      throw new Error('The location action should be disabled after denial');
    }

    await userEvent.click(canvas.getByRole('button', { name: 'Opções' }));
    const menu = within(canvasElement.ownerDocument.body).getByRole('menu', {
      name: 'Opções do mapa',
    });
    const nearby = within(menu).getByRole('menuitemradio', {
      name: /Paradas próximas/,
    }) as HTMLButtonElement;
    if (!nearby.disabled) {
      throw new Error('Nearby mode should be disabled after location denial');
    }
  },
};

export const LocationRequesting: Story = {
  decorators: withMapState({
    locationPermission: 'prompt',
    isRequestingLocation: true,
  }),
  parameters: {
    docs: {
      description: {
        story:
          'Keeps the map interactive while the location action shows its pending state.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await verifyMapShell(canvasElement);
    const locationButton = within(canvasElement).getByRole('button', {
      name: 'Perto de mim',
    }) as HTMLButtonElement;
    if (locationButton.getAttribute('aria-busy') !== 'true') {
      throw new Error('The location action should expose its busy state');
    }
    if (!locationButton.disabled) {
      throw new Error('The location action should be disabled while pending');
    }
  },
};

export const StationDetailsHalf: Story = {
  decorators: withMapState({
    stationDetail: {
      stop: PARAISO,
      summary: 'Linhas 1-Azul e 2-Verde',
      initialSnap: 'half',
    },
  }),
  parameters: {
    docs: {
      description: {
        story: 'On mobile, scroll or swipe the visible content to resize the sheet. Taps remain available at half height; expanded content scrolls normally. The city tabs follow expansion without resizing the map.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await verifyMapShell(canvasElement);
  },
};

/** Integration story: all transit state is mocked; photos use the production API. */
export const StationPhotoHeader: Story = {
  decorators: withMapState({
    stationPhotos: true,
    stationDetail: { stop: PARAISO, initialSnap: 'expanded' },
  }),
  parameters: {
    docs: {
      description: {
        story:
          'Uses the production station image API. On mobile, drag between half and expanded to reveal the header image; compact mode shows text only.',
      },
    },
  },
};

export const StationPhotoHeaderDark: Story = {
  ...StationPhotoHeader,
  render: () => renderMapStoryHost(true),
};
