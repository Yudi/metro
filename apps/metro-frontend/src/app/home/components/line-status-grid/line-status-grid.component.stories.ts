import {
  Meta,
  StoryObj,
  moduleMetadata,
  applicationConfig,
} from '@storybook/angular';
import { MatDialogModule } from '@angular/material/dialog';
import { LineStatusGridComponent } from './line-status-grid.component';
import { ApiService } from '@metro/shared/api';
import { of } from 'rxjs';
import {
  createMockApiService,
  ALL_LINES_NORMAL,
  ALL_LINES_CLOSED,
  createRailStatusResponse,
  type MockApiServiceOptions,
} from '@metro/storybook-mocks';
import {
  RailLinesStatusResponse,
  SpecialRailInfoCardStatus,
  SpecialRailLineStatus,
} from '@metro/shared/utils';

// Provider Factory

function createProviders(serviceOpts: MockApiServiceOptions) {
  return [
    {
      provide: ApiService,
      useValue: createMockApiService(serviceOpts),
    },
  ];
}

function createFixedResponseProviders(response: RailLinesStatusResponse) {
  return [
    {
      provide: ApiService,
      useValue: {
        getRailStatus: () => of(response),
      },
    },
  ];
}

const SPECIAL_LINES_SCHEDULED: SpecialRailLineStatus[] = [
  {
    code: 'EA',
    colorName: 'Preto',
    colorHex: '#000000',
    line: 'Expresso Aeroporto',
    statusCode: 'OperacaoNormal',
    statusLabel: 'Operação Normal',
    statusColor: 'verde',
    nextDepartures: [{ label: 'Próxima partida', time: '15:00' }],
    issues: [],
  },
  {
    code: '10X',
    colorName: 'Turquesa',
    colorHex: '#00A3A4',
    line: 'Expresso Linha 10',
    statusCode: 'OperacaoNormal',
    statusLabel: 'Operação Normal',
    statusColor: 'verde',
    nextDepartures: [
      { label: 'Santo André', time: '16:10' },
      { label: 'Tamanduateí', time: '16:20' },
    ],
    issues: [],
  },
  {
    code: 'GRU',
    colorName: 'Azul',
    colorHex: '#186dbf',
    line: 'Aeromóvel GRU',
    statusCode: 'OperacaoNormal',
    statusLabel: 'Aberto',
    statusColor: 'verde',
    nextDepartures: [],
    issues: [],
  },
];

const SPECIAL_LINES_WITH_ALERTS: SpecialRailLineStatus[] = [
  {
    code: 'EA',
    colorName: 'Preto',
    colorHex: '#000000',
    line: 'Expresso Aeroporto',
    statusCode: 'OperacaoComImpactoPontual',
    statusLabel: 'Alterações',
    statusColor: 'amarelo',
    nextDepartures: [],
    issues: [
      {
        code: 13,
        line: 'Linha 13 - Jade',
        description:
          'Operação do Expresso Aeroporto com intervalos irregulares.',
      },
    ],
  },
  {
    code: '10X',
    colorName: 'Turquesa',
    colorHex: '#00A3A4',
    line: 'Expresso Linha 10',
    statusCode: 'OperacaoComImpactoPontual',
    statusLabel: 'Alterações',
    statusColor: 'amarelo',
    nextDepartures: [],
    issues: [
      {
        code: 10,
        line: 'Linha 10 - Turquesa',
        description: 'Serviço expresso com operação parcial no pico da tarde.',
      },
    ],
  },
  {
    code: 'GRU',
    colorName: 'Azul',
    colorHex: '#186dbf',
    line: 'Aeromóvel GRU',
    statusCode: 'OperacaoEncerrada',
    statusLabel: 'Operação Encerrada',
    statusColor: 'cinza',
    nextDepartures: [],
    issues: [],
  },
];

const TRANSFER_INFO_CARD: SpecialRailInfoCardStatus = {
  id: 'transfer-cptm-metro',
  title: 'Transf. CPTM e Metrô',
  subtitle: 'Tatuapé e Itaquera',
  badgeIcon: 'transit_ticket',
  badgeColorHex: '#E61B3B',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Gratuita',
};

// Meta

const meta: Meta<LineStatusGridComponent> = {
  title: 'Home/LineStatusGrid',
  component: LineStatusGridComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [MatDialogModule],
    }),
  ],
};

export default meta;

type Story = StoryObj<LineStatusGridComponent>;

// Stories

/**
 * Default view: All lines operating normally.
 */
export const AllNormal: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        fetchKind: 'normal',
        fetchDelayMs: 0,
      }),
    }),
  ],
};

/**
 * Loading state: Shows skeleton placeholders while fetching.
 */
export const Loading: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        fetchKind: 'empty',
        fetchDelayMs: 10000,
      }),
    }),
  ],
};

/**
 * Mixed issues: Some lines with reduced speed, partial operation, or stopped.
 */
export const WithIssues: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        fetchKind: 'issue',
        fetchDelayMs: 0,
      }),
    }),
  ],
};

/**
 * All lines closed (after hours).
 */
export const AllClosed: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ApiService,
          useValue: {
            getRailStatus: () => of(createRailStatusResponse(ALL_LINES_CLOSED)),
          },
        },
      ],
    }),
  ],
};

/**
 * API error: Failed to fetch status.
 */
export const FetchError: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        fetchKind: 'error',
        fetchDelayMs: 500,
      }),
    }),
  ],
};

/**
 * Slow loading: Shows skeleton then loads data after delay.
 */
export const SlowLoading: Story = {
  decorators: [
    applicationConfig({
      providers: createProviders({
        fetchKind: 'normal',
        fetchDelayMs: 3000,
      }),
    }),
  ],
};

/**
 * Shows all new special services with schedule rendering.
 */
export const WithSpecialSchedules: Story = {
  decorators: [
    applicationConfig({
      providers: createFixedResponseProviders({
        ...createRailStatusResponse(ALL_LINES_NORMAL),
        specialLines: SPECIAL_LINES_SCHEDULED,
        specialInfoCards: [],
      }),
    }),
  ],
};

/**
 * Shows special services in "Alterações" state with clickable issue dialogs.
 */
export const WithSpecialAlerts: Story = {
  decorators: [
    applicationConfig({
      providers: createFixedResponseProviders({
        ...createRailStatusResponse(ALL_LINES_NORMAL),
        specialLines: SPECIAL_LINES_WITH_ALERTS,
        specialInfoCards: [],
      }),
    }),
  ],
};

/**
 * Shows transfer informational card with material icon and status badge.
 */
export const WithTransferInfoCard: Story = {
  decorators: [
    applicationConfig({
      providers: createFixedResponseProviders({
        ...createRailStatusResponse(ALL_LINES_NORMAL),
        specialLines: SPECIAL_LINES_SCHEDULED,
        specialInfoCards: [TRANSFER_INFO_CARD],
      }),
    }),
  ],
};
