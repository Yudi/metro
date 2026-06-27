import { provideRouter } from '@angular/router';
import {
  Meta,
  StoryObj,
  applicationConfig,
  componentWrapperDecorator,
} from '@storybook/angular';
import { of, delay, throwError } from 'rxjs';
import { ApiService, FavoritesService } from '@metro/shared/api';
import {
  ALL_LINES_CLOSED,
  ALL_LINES_NORMAL,
  LINES_WITH_ISSUES,
  createRailStatusResponse,
} from '@metro/storybook-mocks';
import { RailLinesStatusResponse, SpecialRailLineStatus } from '@metro/shared/utils';
import { Status } from './status';

const specialServices: SpecialRailLineStatus[] = [
  {
    code: 'EA',
    colorName: 'Preto',
    colorHex: '#111827',
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
];

function createStatusResponse(
  lines: RailLinesStatusResponse['lines'],
  includeSpecialServices = true,
): RailLinesStatusResponse {
  return {
    ...createRailStatusResponse(lines),
    specialLines: includeSpecialServices ? specialServices : [],
  };
}

function createApiService(
  response: RailLinesStatusResponse | null,
  delayMs = 0,
  shouldError = false,
) {
  return {
    getRailStatus: () => {
      if (shouldError) {
        return throwError(() => new Error('Erro simulado'));
      }

      if (!response) {
        return of(null).pipe(delay(10_000));
      }

      return delayMs > 0 ? of(response).pipe(delay(delayMs)) : of(response);
    },
  };
}

function createFavoritesService() {
  const favorites = new Set<string>(['EA']);

  return {
    isFavorite: (code: string) => favorites.has(code),
    addFavorite: (code: string) => favorites.add(code),
    removeFavorite: (code: string) => favorites.delete(code),
  };
}

const meta: Meta<Status> = {
  title: 'Lite/Status/Line status page',
  component: Status,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([{ path: '', component: Status }]),
        { provide: FavoritesService, useFactory: createFavoritesService },
      ],
    }),
    componentWrapperDecorator(
      (story) => `<main style="max-width: 720px; margin: 0 auto">${story}</main>`,
    ),
  ],
};

export default meta;
type Story = StoryObj<Status>;

export const Normal: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ApiService,
          useValue: createApiService(createStatusResponse(ALL_LINES_NORMAL)),
        },
      ],
    }),
  ],
};

export const ComOcorrencias: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ApiService,
          useValue: createApiService(createStatusResponse(LINES_WITH_ISSUES)),
        },
      ],
    }),
  ],
};

export const Encerrada: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ApiService,
          useValue: createApiService(
            createStatusResponse(ALL_LINES_CLOSED, false),
          ),
        },
      ],
    }),
  ],
};

export const Carregando: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ApiService,
          useValue: createApiService(null),
        },
      ],
    }),
  ],
};
