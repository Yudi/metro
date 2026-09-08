import {
  Meta,
  StoryObj,
  moduleMetadata,
  applicationConfig,
} from '@storybook/angular';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { SubwayStationDialogComponent } from './subway-station-dialog.component';
import {
  L1_NORMAL,
  L1_CLOSED,
  L2_NORMAL,
  L13_NORMAL,
  L8_NORMAL,
  L9_NORMAL,
} from '@metro/storybook-mocks';
import {
  AEROMOVEL_GRU_CLOSED,
  AEROMOVEL_GRU_OPEN,
  AEROPORTO_GUARULHOS,
  PARAISO,
  JABAQUARA,
  SAO_JUDAS,
  SANTA_CRUZ,
  SANTANA,
  VILA_DAS_BELEZAS,
  PINHEIROS,
  PINHEIROS_TRAINS,
  OSASCO,
  OSASCO_L8_TRAINS,
  OSASCO_L9_TRAINS,
  createSubwayStationDialogProviders,
} from './subway-station-dialog.stories.fixtures';

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
      providers: createSubwayStationDialogProviders(PARAISO, {
        cached: null,
        isFresh: true,
        fetchKind: 'normal',
        fetchDelayMs: 0,
      }),
    }),
  ],
};

/**
 * Aeroporto-Guarulhos: Aeromóvel GRU operating normally, matching the home status card.
 */
export const AeromovelGruOpen: Story = {
  decorators: [
    applicationConfig({
      providers: createSubwayStationDialogProviders(AEROPORTO_GUARULHOS, {
        cached: {
          lines: [L13_NORMAL],
          specialLines: [AEROMOVEL_GRU_OPEN],
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
 * Aeroporto-Guarulhos: Aeromóvel GRU closed after operating hours.
 */
export const AeromovelGruClosed: Story = {
  decorators: [
    applicationConfig({
      providers: createSubwayStationDialogProviders(AEROPORTO_GUARULHOS, {
        cached: {
          lines: [L13_NORMAL],
          specialLines: [AEROMOVEL_GRU_CLOSED],
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
 * Aeroporto-Guarulhos: station status is available, but the Aeromóvel status is missing.
 */
export const AeromovelGruUnavailable: Story = {
  decorators: [
    applicationConfig({
      providers: createSubwayStationDialogProviders(AEROPORTO_GUARULHOS, {
        cached: {
          lines: [L13_NORMAL],
          specialLines: [],
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
 * Aeroporto-Guarulhos: shows the Aeromóvel status skeleton while status is loading.
 */
export const AeromovelGruLoading: Story = {
  decorators: [
    applicationConfig({
      providers: createSubwayStationDialogProviders(AEROPORTO_GUARULHOS, {
        cached: null,
        isFresh: false,
        fetchKind: 'normal',
        fetchDelayMs: 3000,
      }),
    }),
  ],
};

/**
 * Useful access note: restroom is in the free area at the bus terminal.
 */
export const BathroomWithAccessNote: Story = {
  decorators: [
    applicationConfig({
      providers: createSubwayStationDialogProviders(JABAQUARA, {
        cached: null,
        isFresh: true,
        fetchKind: 'normal',
        fetchDelayMs: 0,
      }),
    }),
  ],
};

/**
 * Restrooms available on both sides of the fare gates at an interchange.
 */
export const BathroomsInPaidAndFreeAreas: Story = {
  decorators: [
    applicationConfig({
      providers: createSubwayStationDialogProviders(SANTA_CRUZ, {
        cached: null,
        isFresh: true,
        fetchKind: 'normal',
        fetchDelayMs: 0,
      }),
    }),
  ],
};

/**
 * Known absence: the researched negative is shown instead of being hidden.
 */
export const WithoutBathrooms: Story = {
  decorators: [
    applicationConfig({
      providers: createSubwayStationDialogProviders(SAO_JUDAS, {
        cached: null,
        isFresh: true,
        fetchKind: 'normal',
        fetchDelayMs: 0,
      }),
    }),
  ],
};

/**
 * Confirmed restroom whose position relative to the fare gates is unknown.
 */
export const BathroomLocationUnknown: Story = {
  decorators: [
    applicationConfig({
      providers: createSubwayStationDialogProviders(SANTANA, {
        cached: null,
        isFresh: true,
        fetchKind: 'normal',
        fetchDelayMs: 0,
      }),
    }),
  ],
};

/**
 * Fully unknown existence: no restroom row is rendered.
 */
export const BathroomInfoUnknown: Story = {
  decorators: [
    applicationConfig({
      providers: createSubwayStationDialogProviders(VILA_DAS_BELEZAS, {
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
      providers: createSubwayStationDialogProviders(PARAISO, {
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
      providers: createSubwayStationDialogProviders(PARAISO, {
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
      providers: createSubwayStationDialogProviders(PARAISO, {
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
      providers: createSubwayStationDialogProviders(PARAISO, {
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
      providers: createSubwayStationDialogProviders(PARAISO, {
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
      providers: createSubwayStationDialogProviders(
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
      providers: createSubwayStationDialogProviders(PARAISO, {
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
      providers: createSubwayStationDialogProviders(PARAISO, {
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
      providers: createSubwayStationDialogProviders(
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
      providers: createSubwayStationDialogProviders(
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
      providers: createSubwayStationDialogProviders(
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
      providers: createSubwayStationDialogProviders(
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
