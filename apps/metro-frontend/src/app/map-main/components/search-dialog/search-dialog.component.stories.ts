import {
  Meta,
  StoryObj,
  moduleMetadata,
  applicationConfig,
} from '@storybook/angular';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SearchDialogComponent } from './search-dialog.component';
import { TypesenseSearchService } from '../../../services/typesense-search.service';
import { GeographyGraphQLService } from '../../services/geography-graphql.service';
import { of, delay } from 'rxjs';

// Mock Data

const MOCK_SEARCH_RESULTS = {
  results: [
    {
      type: 'stop',
      document: {
        id: 'stop-1',
        stop_id: '340015325',
        stop_name: 'Av. Paulista, 1000',
        stop_desc: 'Em frente ao MASP',
        stop_lat: -23.5614,
        stop_lon: -46.656,
      },
    },
    {
      type: 'stop',
      document: {
        id: 'stop-2',
        stop_id: '340015326',
        stop_name: 'Av. Paulista, 1500',
        stop_desc: 'Próximo ao Conjunto Nacional',
        stop_lat: -23.559,
        stop_lon: -46.659,
      },
    },
    {
      type: 'stop',
      document: {
        id: 'subway-1',
        stop_id: '99001',
        stop_name: 'Consolação',
        stop_desc: 'Estação de metrô Consolação - Linha 2 Verde',
        stop_lat: -23.5563,
        stop_lon: -46.6602,
      },
    },
    {
      type: 'route',
      document: {
        id: 'route-1',
        route_id: '477A-10',
        route_short_name: '477A',
        route_long_name: 'Metrô Santana – Pinheiros',
        route_color: '0066CC',
        route_text_color: 'FFFFFF',
        route_type: 3,
      },
    },
  ],
};

const MOCK_NEARBY_STOPS = {
  stops: [
    {
      stop_id: '340015325',
      stop_name: 'Av. Paulista, 1000',
      stop_desc: 'Em frente ao MASP',
      stop_lat: -23.5614,
      stop_lon: -46.656,
      distance: 150,
    },
    {
      stop_id: '340015326',
      stop_name: 'Av. Paulista, 1500',
      stop_desc: 'Próximo ao Conjunto Nacional',
      stop_lat: -23.559,
      stop_lon: -46.659,
      distance: 320,
    },
    {
      stop_id: '340015327',
      stop_name: 'Rua Augusta, 500',
      stop_desc: null,
      stop_lat: -23.558,
      stop_lon: -46.657,
      distance: 450,
    },
    {
      stop_id: '99001',
      stop_name: 'Consolação',
      stop_desc: 'Estação de metrô Consolação',
      stop_lat: -23.5563,
      stop_lon: -46.6602,
      distance: 580,
    },
  ],
};

const MOCK_ROUTE_RESULTS = {
  results: [
    {
      type: 'route',
      document: {
        id: 'route-1',
        route_id: '477A-10',
        route_short_name: '477A',
        route_long_name: 'Metrô Santana – Pinheiros',
        route_color: '0066CC',
        route_text_color: 'FFFFFF',
        route_type: 3,
      },
    },
    {
      type: 'route',
      document: {
        id: 'route-2',
        route_id: '477P-10',
        route_short_name: '477P',
        route_long_name: 'Metrô Santana – USP',
        route_color: '0066CC',
        route_text_color: 'FFFFFF',
        route_type: 3,
      },
    },
  ],
};

// Mock Services

type SearchScenario =
  | 'results'
  | 'no-results'
  | 'loading'
  | 'error'
  | 'nearby'
  | 'routes';

function createMockTypesenseService(scenario: SearchScenario, delayMs = 0) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    search: (query: string) => {
      if (scenario === 'no-results') {
        return of({ results: [] }).pipe(delay(delayMs));
      }
      if (scenario === 'error') {
        return of({ results: [] }).pipe(delay(delayMs));
      }
      if (scenario === 'routes') {
        return of(MOCK_ROUTE_RESULTS).pipe(delay(delayMs));
      }
      return of(MOCK_SEARCH_RESULTS).pipe(delay(delayMs));
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    searchNearbyStops: (lat: number, lng: number, radius: number) => {
      if (scenario === 'nearby') {
        return of(MOCK_NEARBY_STOPS).pipe(delay(delayMs));
      }
      return of({ stops: [] }).pipe(delay(delayMs));
    },
    reindexData: () => of({ success: true, message: 'Reindex complete' }),
  };
}

function createMockGeographyService() {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getRoutesForStop: (stopId: string) => {
      // Return mock routes for any stop
      return of([
        { shortName: '477A', longName: 'Metrô Santana – Pinheiros' },
        { shortName: '775A', longName: 'Term. Pirituba – Pinheiros' },
      ]).pipe(delay(100));
    },
  };
}

// Provider Factory

function createProviders(scenario: SearchScenario, delayMs = 0) {
  return [
    {
      provide: MatDialogRef,
      useValue: {
        close: (result?: unknown) =>
          console.log('[story] dialog closed', result),
      },
    },
    {
      provide: TypesenseSearchService,
      useValue: createMockTypesenseService(scenario, delayMs),
    },
    {
      provide: GeographyGraphQLService,
      useValue: createMockGeographyService(),
    },
  ];
}

// Meta

const meta: Meta<SearchDialogComponent> = {
  title: 'Bus/SearchDialog',
  component: SearchDialogComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        MatDialogModule,
        MatButtonModule,
        MatInputModule,
        MatFormFieldModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatCardModule,
        MatChipsModule,
        MatTooltipModule,
      ],
    }),
  ],
  parameters: {
    docs: {
      description: {
        component: `
The SearchDialog component provides search functionality for stops and routes.
It includes:
- Text search with debouncing
- Nearby stops search using geolocation
- Results grouped by type (bus stops, subway stations, routes)
- Distance display for nearby results
- Route chips showing lines at each stop

The component uses Typesense for fast full-text search.
        `,
      },
    },
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<SearchDialogComponent>;

// Stories

/**
 * Empty state: Initial view before any search.
 */
export const Empty: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders('results'),
    }),
  ],
};

/**
 * With search results: Shows bus stops, subway stations, and routes.
 */
export const WithResults: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders('results', 500),
    }),
  ],
  play: async ({ canvasElement }) => {
    // Auto-trigger search for demo
    const input = canvasElement.querySelector('input') as HTMLInputElement;
    if (input) {
      input.value = 'Paulista';
      input.dispatchEvent(new Event('input'));
    }
  },
};

/**
 * Loading state: Shows spinner while searching.
 */
export const Loading: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders('results', 10000),
    }),
  ],
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector('input') as HTMLInputElement;
    if (input) {
      input.value = 'Loading test';
      input.dispatchEvent(new Event('input'));
    }
  },
};

/**
 * No results found.
 */
export const NoResults: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders('no-results'),
    }),
  ],
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector('input') as HTMLInputElement;
    if (input) {
      input.value = 'xyznonexistent';
      input.dispatchEvent(new Event('input'));
    }
  },
};

/**
 * Route search: Shows route results when searching by line number.
 */
export const RouteResults: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders('routes', 300),
    }),
  ],
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector('input') as HTMLInputElement;
    if (input) {
      input.value = '477';
      input.dispatchEvent(new Event('input'));
    }
  },
};

/**
 * Nearby search active (simulated).
 * Note: In Storybook, geolocation is not available.
 */
export const NearbySearchInfo: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders('nearby'),
    }),
  ],
  parameters: {
    docs: {
      description: {
        story: `
In the real app, clicking "Proximidades" would request geolocation access
and show nearby stops with distance indicators.

This story shows the search dialog in its initial state since geolocation
is not available in Storybook's iframe environment.
        `,
      },
    },
  },
};
