import { BusInformationService } from '../bus-information/bus-information.service';
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
import { GeographyGraphQLService } from '../../geography/geography-graphql.service';
import {
  BusStopDialogComponent,
  type BusStopDialogData,
} from './bus-stop-dialog.component';
import { LoggerService } from '@metro/shared/api';
import { RealtimeWebsocketService } from '../../realtime/realtime-websocket.service';
import type {
  BusStopGraphQL,
  BusRouteGraphQL,
} from '../../geography/geography-graphql.service';
import {
  PINHEIROS_BUS_STOP,
  CONSOLACAO_BUS_STOP,
  EMPTY_BUS_STOP,
  ROUTE_477A,
  ROUTE_775A,
  ROUTE_177H,
  ROUTE_875A,
  ROUTE_875I,
  ARTESP_ONLY_BUS_STOP,
  ROUTE_ARTESP_001,
  ROUTE_ARTESP_WITHOUT_FARE,
  SCHEDULED_ARTESP_DEPARTURES,
  SHARED_SPTRANS_ARTESP_BUS_STOP,
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
      provide: BusInformationService,
      useValue: {
        notices: () =>
          of({
            status: 'AVAILABLE',
            lastUpdated: '2026-09-07T07:30:00Z',
            notices: [
              {
                sourceId: '1',
                sourceUrl:
                  'https://www.sptrans.com.br/informativos/oeste/desvios-de-itinerarios-na-regiao-da-av-paulista/71116/',
                title: 'Exemplo: desvio na região da Av. Paulista',
                periodText: '07/09/2026, das 9h às 20h.',
                description:
                  '07/09/2026, das 9h às 20h.\nMotivo: exemplo ilustrativo de evento.\n477A-10 Pinheiros\nIda: exemplo de desvio pela via alternativa.\nVolta: sem alteração.\n875A-10 Outro destino\nIda: instrução de outra linha.',
                routes: ['477A-10', '875A-10'],
                listing: 'RECENT',
                listedDate: '7 de setembro de 2026',
              },
            ],
          }),
      },
    },
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
        getScheduledBusDepartures: () => of(SCHEDULED_ARTESP_DEPARTURES),
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
          new Set([ROUTE_477A.routeId, ROUTE_177H.routeId]),
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
          new Set([ROUTE_477A.routeId, ROUTE_775A.routeId, ROUTE_177H.routeId]),
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
          new Set([ROUTE_875A.routeId]),
        ),
        realtimeKind: 'arrivals',
      }),
    }),
  ],
};

export const SharedSptransArtespStop: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        dialogData: createDialogData(SHARED_SPTRANS_ARTESP_BUS_STOP, [
          ROUTE_477A,
          ROUTE_ARTESP_001,
        ]),
        realtimeKind: 'arrivals',
      }),
    }),
  ],
};

export const ArtespScheduledOnly: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        dialogData: createDialogData(ARTESP_ONLY_BUS_STOP, [
          ROUTE_ARTESP_001,
          ROUTE_ARTESP_WITHOUT_FARE,
        ]),
        realtimeKind: 'no-arrivals',
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
