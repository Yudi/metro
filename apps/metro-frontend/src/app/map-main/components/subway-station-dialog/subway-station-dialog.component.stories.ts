import {
  Meta,
  StoryObj,
  moduleMetadata,
  applicationConfig,
} from '@storybook/angular';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { SubwayStationDialogComponent } from './subway-station-dialog.component';
import { StationNameService } from '../../services/station-name.service';
import { LoggerService } from '@metro/shared/api';
import { RailGraphqlService, API_BASE_URL } from '@metro/shared/api';
import type { BusStopGraphQL } from '../../services/geography-graphql.service';
import {
  L1_NORMAL,
  L1_CLOSED,
  L2_NORMAL,
  L8_NORMAL,
  L9_NORMAL,
  createMockRailGraphqlService,
  type MockRailServiceOptions,
} from '@metro/storybook-mocks';
import {
  NextTrainWebsocketService,
  NextTrainArrival,
  StationTrainData,
} from '../../services/next-train-websocket.service';
import { signal } from '@angular/core';

// Mock Data: Paraíso Station (L1 Azul + L2 Verde)

const PARAISO: BusStopGraphQL = {
  id: 'paraiso-1',
  stopId: '99999',
  name: 'Paraíso',
  description:
    'Estação Paraíso do Metrô, ligação entre L1 (Azul) e L2 (Verde).',
  latitude: -23.578,
  longitude: -46.635,
  isSubwayStation: true,
  agencies: ['METRO'],
  routeShortNames: ['L1', 'L2'],
};

// Mock Data: Pinheiros Station (L9 Esmeralda) - has next train feature

const PINHEIROS: BusStopGraphQL = {
  id: 'pinheiros-1',
  stopId: '88888',
  name: 'Pinheiros',
  description: 'Estação Pinheiros da Linha 9 - Esmeralda (ViaMobilidade).',
  latitude: -23.567,
  longitude: -46.702,
  isSubwayStation: true,
  agencies: ['VIAMOBILIDADE'],
  routeShortNames: ['L9'],
};

// Mock next train data for Pinheiros (L9)
const PINHEIROS_TRAINS: NextTrainArrival[] = [
  {
    destinationCode: 'VAG',
    destinationName: 'Varginha',
    trainCurrentStationName: 'Villa Lobos–Jaguaré',
    arrivalTime: '21:04',
    isAtPlatform: false,
    isTrainStopped: false,
  },
  {
    destinationCode: 'OSA',
    destinationName: 'Osasco',
    trainCurrentStationName: 'Pinheiros',
    arrivalTime: '21:00',
    isAtPlatform: true,
    isTrainStopped: true,
  },
];

// Mock Data: Osasco Station (L8 Diamante + L9 Esmeralda) - multi-line station

const OSASCO: BusStopGraphQL = {
  id: 'osasco-1',
  stopId: '77777',
  name: 'Osasco',
  description:
    'Estação Osasco, servida pela Linha 8 - Diamante e Linha 9 - Esmeralda.',
  latitude: -23.532,
  longitude: -46.791,
  isSubwayStation: true,
  agencies: ['VIAMOBILIDADE'],
  routeShortNames: ['L8', 'L9'],
};

// Mock next train data for Osasco (L8 and L9)
const OSASCO_L8_TRAINS: NextTrainArrival[] = [
  {
    destinationCode: 'JPR',
    destinationName: 'Júlio Prestes',
    trainCurrentStationName: 'Comandante Sampaio',
    arrivalTime: '14:35',
    isAtPlatform: false,
    isTrainStopped: false,
  },
  {
    destinationCode: 'IPV',
    destinationName: 'Itapevi',
    trainCurrentStationName: 'Presidente Altino',
    arrivalTime: '14:38',
    isAtPlatform: false,
    isTrainStopped: true,
  },
];

const OSASCO_L9_TRAINS: NextTrainArrival[] = [
  {
    destinationCode: 'VAG',
    destinationName: 'Varginha',
    trainCurrentStationName: 'Presidente Altino',
    arrivalTime: '14:40',
    isAtPlatform: false,
    isTrainStopped: false,
  },
];

// Mock NextTrainWebsocketService Factory

type SubscriptionKey = `${string}:${string}`;

interface MockNextTrainEntry {
  lineCode: string;
  stationCode: string;
  trains: NextTrainArrival[];
}

function createMockNextTrainService(
  entries: MockNextTrainEntry[],
): Partial<NextTrainWebsocketService> {
  const dataMap = new Map<SubscriptionKey, StationTrainData>();

  for (const entry of entries) {
    const key: SubscriptionKey = `${entry.lineCode}:${entry.stationCode}`;
    dataMap.set(key, {
      trains: entry.trains,
      hasError: false,
      dataReceived: true,
      processing: false,
      operationClosed: false,
      outOfSchedule: false,
    });
  }

  return {
    connected: signal(true),
    lastUpdate: signal(Date.now()),
    stationData: signal(dataMap),
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    subscribe: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    unsubscribe: () => {},
    getTrains: (lineCode: 'L8' | 'L9', stationCode: string) => {
      const key: SubscriptionKey = `${lineCode}:${stationCode}`;
      return dataMap.get(key)?.trains ?? [];
    },
  };
}

// Provider Factory

function createProviders(
  stop: BusStopGraphQL,
  serviceOpts: MockRailServiceOptions,
  nextTrainData: MockNextTrainEntry[] = [],
) {
  return [
    {
      provide: MatDialogRef,
      useValue: { close: () => console.log('dialog closed') },
    },
    {
      provide: MAT_DIALOG_DATA,
      useValue: { stop },
    },
    {
      provide: StationNameService,
      useValue: {
        normalizeStationName: (name: string) => name,
        formatStationName: (name: string) => name,
      },
    },
    {
      provide: LoggerService,
      useValue: {
        debug: (...logArgs: unknown[]) => console.debug('[story] ', ...logArgs),
        error: (...logArgs: unknown[]) => console.error('[story] ', ...logArgs),
      },
    },
    {
      provide: API_BASE_URL,
      useValue: 'http://localhost',
    },
    {
      provide: RailGraphqlService,
      useValue: createMockRailGraphqlService(serviceOpts),
    },
    {
      provide: NextTrainWebsocketService,
      useValue: createMockNextTrainService(nextTrainData),
    },
  ];
}

// Meta

const meta: Meta<SubwayStationDialogComponent> = {
  title: 'Bus/SubwayStationDialog',
  component: SubwayStationDialogComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
      ],
    }),
  ],
};

export default meta;

type Story = StoryObj<SubwayStationDialogComponent>;

// Stories

/**
 * Default view: No cache, normal fetch result, Lines 1 & 2 operating normally.
 */
export const Default: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(PARAISO, {
        cached: null,
        isFresh: true,
        fetchKind: 'normal',
        fetchDelayMs: 0,
      }),
    }),
  ],
};

/**
 * Loading state: Simulates skeleton loading while fetching status.
 * Wait 3 seconds to see the skeleton then the loaded state.
 */
export const Loading: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(PARAISO, {
        cached: null,
        isFresh: false,
        fetchKind: 'normal',
        fetchDelayMs: 3000,
      }),
    }),
  ],
};

/**
 * Cached data: Uses pre-cached status, shows instant result without fetch.
 */
export const WithCachedData: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(PARAISO, {
        cached: {
          lines: [L1_NORMAL, L2_NORMAL],
          lastUpdated: new Date(),
          success: true,
          errorMessage: null,
        },
        isFresh: true,
        fetchKind: 'normal',
        fetchDelayMs: 0,
      }),
    }),
  ],
};

/**
 * Issue state: L1 with reduced speed, L2 stopped.
 */
export const WithIssues: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(PARAISO, {
        cached: null,
        isFresh: true,
        fetchKind: 'issue',
        fetchDelayMs: 0,
      }),
    }),
  ],
};

/**
 * Partial unavailable: L1 data unavailable, L2 normal.
 */
export const StatusUnavailable: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(PARAISO, {
        cached: null,
        isFresh: true,
        fetchKind: 'unavailable',
        fetchDelayMs: 0,
      }),
    }),
  ],
};

/**
 * API error: Fetch fails entirely, shows error banner.
 */
export const FetchError: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(PARAISO, {
        cached: null,
        isFresh: false,
        fetchKind: 'error',
        fetchDelayMs: 500,
      }),
    }),
  ],
};

/**
 * Empty lines: API returns no lines for this station.
 */
export const NoLinesFound: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(
        { ...PARAISO, routeShortNames: [] },
        {
          cached: null,
          isFresh: true,
          fetchKind: 'empty',
          fetchDelayMs: 0,
        },
      ),
    }),
  ],
};

/**
 * Operation closed: Both lines closed (after hours).
 */
export const OperationClosed: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(PARAISO, {
        cached: {
          lines: [
            L1_CLOSED,
            {
              ...L2_NORMAL,
              statusCode: 'OperacaoEncerrada',
              statusLabel: 'Operação Encerrada',
              statusColor: 'cinza',
            },
          ],
          lastUpdated: new Date(),
          success: true,
          errorMessage: null,
        },
        isFresh: true,
        fetchKind: 'normal',
        fetchDelayMs: 0,
      }),
    }),
  ],
};

/**
 * Stale cache with background refresh: Shows cached data immediately while refreshing in background.
 */
export const StaleCacheRefreshing: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(PARAISO, {
        cached: {
          lines: [L1_NORMAL, L2_NORMAL],
          lastUpdated: new Date(Date.now() - 5 * 60 * 1000),
          success: true,
          errorMessage: null,
        },
        isFresh: false,
        fetchKind: 'issue',
        fetchDelayMs: 2000,
      }),
    }),
  ],
};

// L9 Stories with Next Train Feature

/**
 * L9 Station with Next Train: Pinheiros station showing real-time train arrivals
 */
export const L9WithNextTrain: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(
        PINHEIROS,
        {
          cached: {
            lines: [L9_NORMAL],
            lastUpdated: new Date(),
            success: true,
            errorMessage: null,
          },
          isFresh: true,
          fetchKind: 'normal',
          fetchDelayMs: 0,
        },
        [{ lineCode: 'L9', stationCode: 'PIN', trains: PINHEIROS_TRAINS }],
      ),
    }),
  ],
};

/**
 * L9 with Train at Platform: Shows the "Trem na plataforma" state
 */
export const L9TrainAtPlatform: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(
        PINHEIROS,
        {
          cached: {
            lines: [L9_NORMAL],
            lastUpdated: new Date(),
            success: true,
            errorMessage: null,
          },
          isFresh: true,
          fetchKind: 'normal',
          fetchDelayMs: 0,
        },
        [
          {
            lineCode: 'L9',
            stationCode: 'PIN',
            trains: [PINHEIROS_TRAINS[1]],
          },
        ], // Only the train at platform
      ),
    }),
  ],
};

/**
 * L9 Loading Next Train: Shows the next train loading state
 */
export const L9LoadingNextTrain: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(
        PINHEIROS,
        {
          cached: {
            lines: [L9_NORMAL],
            lastUpdated: new Date(),
            success: true,
            errorMessage: null,
          },
          isFresh: true,
          fetchKind: 'normal',
          fetchDelayMs: 0,
        },
        [], // No trains yet - will show loading
      ),
    }),
  ],
};

/**
 * Multi-Line Station (Osasco): Shows L8 and L9 next train cards with line names
 * This demonstrates how stations served by multiple ViaMobilidade lines
 * display the full line name to differentiate the cards.
 */
export const MultiLineStationOsasco: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders(
        OSASCO,
        {
          cached: {
            lines: [L8_NORMAL, L9_NORMAL],
            lastUpdated: new Date(),
            success: true,
            errorMessage: null,
          },
          isFresh: true,
          fetchKind: 'normal',
          fetchDelayMs: 0,
        },
        [
          { lineCode: 'L8', stationCode: 'OSA', trains: OSASCO_L8_TRAINS },
          { lineCode: 'L9', stationCode: 'OSA', trains: OSASCO_L9_TRAINS },
        ],
      ),
    }),
  ],
};
