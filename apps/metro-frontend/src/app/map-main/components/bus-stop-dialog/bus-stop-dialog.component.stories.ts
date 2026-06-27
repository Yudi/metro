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
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GeographyGraphQLService } from '../../services/geography-graphql.service';
import {
  BusStopDialogComponent,
  type BusStopDialogData,
} from './bus-stop-dialog.component';
import { LoggerService } from '@metro/shared/api';
import { RealtimeWebsocketService } from '../../services/realtime-websocket.service';
import type {
  BusStopGraphQL,
  BusRouteGraphQL,
} from '../../services/geography-graphql.service';
import {
  PINHEIROS_BUS_STOP,
  CONSOLACAO_BUS_STOP,
  EMPTY_BUS_STOP,
  ROUTE_477A,
  ROUTE_775A,
  ROUTE_177H,
  ROUTE_875A,
  ROUTE_875I,
  MOCK_ROUTE_RAIL_CONNECTIONS,
  createMockArrivals,
  createMockRealtimeService,
  createMockLoggerService,
} from '@metro/storybook-mocks';
import { of } from 'rxjs';

// Helper Functions

function createDialogData(
  stop: BusStopGraphQL,
  routes: BusRouteGraphQL[],
  selectedRoutes: Set<string> = new Set(),
): BusStopDialogData {
  return { stop, routes, selectedRoutes };
}

// Provider Factory

interface ProviderOptions {
  dialogData: BusStopDialogData;
  realtimeKind?: 'arrivals' | 'no-arrivals' | 'loading';
}

function createProviders(opts: ProviderOptions) {
  const { dialogData, realtimeKind = 'arrivals' } = opts;

  // Create arrivals map for the stop
  const arrivalsMap = new Map();
  if (realtimeKind === 'arrivals' && dialogData.stop.stopId) {
    arrivalsMap.set(
      dialogData.stop.stopId,
      createMockArrivals(dialogData.stop.stopId),
    );
  }

  return [
    {
      provide: MatDialogRef,
      useValue: {
        close: (result?: unknown) =>
          console.log('[story] dialog closed', result),
      },
    },
    {
      provide: MAT_DIALOG_DATA,
      useValue: dialogData,
    },
    {
      provide: LoggerService,
      useValue: createMockLoggerService(),
    },
    {
      provide: GeographyGraphQLService,
      useValue: {
        getRouteRailConnectionsForStop: () => of(MOCK_ROUTE_RAIL_CONNECTIONS),
      },
    },
    {
      provide: RealtimeWebsocketService,
      useValue: createMockRealtimeService({
        fetchKind: realtimeKind,
        arrivals: arrivalsMap,
      }),
    },
  ];
}

// Meta

const meta: Meta<BusStopDialogComponent> = {
  title: 'Bus/BusStopDialog',
  component: BusStopDialogComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
        MatChipsModule,
        MatTooltipModule,
      ],
    }),
  ],
  parameters: {
    docs: {
      description: {
        component: `
The BusStopDialog component displays information about a bus stop (not subway stations).
It shows:
- Stop name and ID
- Real-time arrival predictions
- Routes serving this stop
- Options to select routes for the map

This is a simpler variant of StopInfoDialog focused only on bus stops.
        `,
      },
    },
  },
};

export default meta;

type Story = StoryObj<BusStopDialogComponent>;

// Stories

/**
 * Default state: Bus stop with real-time arrivals and multiple routes.
 */
export const Default: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        dialogData: createDialogData(PINHEIROS_BUS_STOP, [
          ROUTE_477A,
          ROUTE_775A,
          ROUTE_177H,
          ROUTE_875A,
        ]),
        realtimeKind: 'arrivals',
      }),
    }),
  ],
};

/**
 * Some routes already selected on the map.
 */
export const WithSelectedRoutes: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        dialogData: createDialogData(
          PINHEIROS_BUS_STOP,
          [ROUTE_477A, ROUTE_775A, ROUTE_177H],
          new Set(['477A', '177H']),
        ),
        realtimeKind: 'arrivals',
      }),
    }),
  ],
};

/**
 * All routes are already selected.
 */
export const AllRoutesSelected: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        dialogData: createDialogData(
          PINHEIROS_BUS_STOP,
          [ROUTE_477A, ROUTE_775A, ROUTE_177H],
          new Set(['477A', '775A', '177H']),
        ),
        realtimeKind: 'arrivals',
      }),
    }),
  ],
};

/**
 * Bus stop with many routes (5+).
 */
export const ManyRoutes: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        dialogData: createDialogData(
          CONSOLACAO_BUS_STOP,
          [ROUTE_477A, ROUTE_775A, ROUTE_177H, ROUTE_875A, ROUTE_875I],
          new Set(['875A']),
        ),
        realtimeKind: 'arrivals',
      }),
    }),
  ],
};

/**
 * No arrival predictions available.
 */
export const NoArrivals: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        dialogData: createDialogData(PINHEIROS_BUS_STOP, [
          ROUTE_477A,
          ROUTE_775A,
          ROUTE_177H,
        ]),
        realtimeKind: 'no-arrivals',
      }),
    }),
  ],
};

/**
 * Loading arrival predictions.
 */
export const LoadingArrivals: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        dialogData: createDialogData(PINHEIROS_BUS_STOP, [
          ROUTE_477A,
          ROUTE_775A,
          ROUTE_177H,
        ]),
        realtimeKind: 'loading',
      }),
    }),
  ],
};

/**
 * Bus stop with no routes (edge case).
 */
export const NoRoutes: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        dialogData: createDialogData(EMPTY_BUS_STOP, []),
        realtimeKind: 'no-arrivals',
      }),
    }),
  ],
};

/**
 * Bus stop with description.
 */
export const WithDescription: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        dialogData: createDialogData(
          {
            ...PINHEIROS_BUS_STOP,
            description:
              'Ponto localizado em frente ao Shopping Eldorado, com acesso à estação Pinheiros do Metrô.',
          },
          [ROUTE_477A, ROUTE_775A],
        ),
        realtimeKind: 'arrivals',
      }),
    }),
  ],
};
