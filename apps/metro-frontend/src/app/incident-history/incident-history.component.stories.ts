import { HttpErrorResponse } from '@angular/common/http';
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { NEVER, Observable, delay, of, throwError } from 'rxjs';
import { IncidentHistoryService } from '@metro/shared/api';
import {
  IncidentHistoryItem,
  IncidentHistoryResponse,
} from '@metro/shared/utils';
import { IncidentHistoryComponent } from './incident-history.component';

type StoryState =
  | 'loaded'
  | 'loading'
  | 'empty'
  | 'backend-down'
  | 'upstream-error'
  | 'bad-request';

interface IncidentHistoryStoryArgs {
  state: StoryState;
  rowCount: number;
  includeDescriptions: boolean;
  incidentMode: 'mixed' | 'all' | 'none';
  networkDelayMs: number;
  rows: IncidentHistoryItem[];
}

const MOCK_ROWS: IncidentHistoryItem[] = [
  {
    id: 61573,
    data_hora: '2026-06-10T00:02:53.622067',
    linha: { id: '5', nome: 'Linha 9-Esmeralda', codigo: '9' },
    empresa: {
      id: 1,
      nome: 'Monitoramento das linhas',
      badge: 'LINHAS',
    },
    situacao: 'Operação com velocidade reduzida',
    descricao:
      'Trens circularam com maiores intervalos entre Osasco e Bruno Covas/Mendes-Vila Natal.',
    classificacao: {
      tipo: 'RAIL_STATUS_INCIDENT',
      label: 'Incidente',
      conta_incidente: true,
    },
  },
  {
    id: 61572,
    data_hora: '2026-06-10T00:02:53.622063',
    linha: { id: '4', nome: 'Linha 8-Diamante', codigo: '8' },
    empresa: {
      id: 1,
      nome: 'Monitoramento das linhas',
      badge: 'LINHAS',
    },
    situacao: 'Operação Normal',
    descricao: 'Operação recuperada após falha operacional anterior.',
    classificacao: {
      tipo: 'RAIL_STATUS_RECOVERED',
      label: 'Normalização',
      conta_incidente: false,
    },
  },
  {
    id: 61571,
    data_hora: '2026-06-10T00:02:53.622057',
    linha: { id: 'SYSTEM', nome: 'Backend', codigo: 'SYSTEM' },
    empresa: {
      id: 2,
      nome: 'Backend',
      badge: 'SISTEMA',
    },
    situacao: 'Backend possivelmente ficou offline',
    descricao:
      'O processo anterior não registrou um desligamento limpo antes desta inicialização.',
    classificacao: {
      tipo: 'BACKEND_OFFLINE_DETECTED',
      label: 'Indisponibilidade detectada',
      conta_incidente: true,
    },
  },
  {
    id: 61570,
    data_hora: '2026-06-09T18:44:20.000000',
    linha: { id: '15', nome: 'Linha 15-Prata', codigo: '15' },
    empresa: {
      id: 1,
      nome: 'Monitoramento das linhas',
      badge: 'LINHAS',
    },
    situacao: 'Operação com velocidade reduzida',
    descricao:
      'Trens circularam com maior intervalo entre Vila Prudente e Jardim Colonial.',
    classificacao: {
      tipo: 'RAIL_STATUS_INCIDENT',
      label: 'Incidente',
      conta_incidente: true,
    },
  },
  {
    id: 61569,
    data_hora: '2026-06-09T17:12:00.000000',
    linha: { id: '3', nome: 'Linha 3-Vermelha', codigo: '3' },
    empresa: {
      id: 1,
      nome: 'Monitoramento das linhas',
      badge: 'LINHAS',
    },
    situacao: 'Operação Normal',
    descricao: 'Operação normalizada após interferência na via.',
    classificacao: {
      tipo: 'RAIL_STATUS_RECOVERED',
      label: 'Normalização',
      conta_incidente: false,
    },
  },
  {
    id: 61568,
    data_hora: '2026-06-09T07:35:00.000000',
    linha: { id: 'SYSTEM', nome: 'Sistema', codigo: 'SYSTEM' },
    empresa: {
      id: 3,
      nome: 'Coleta de dados',
    },
    situacao: 'Falha na recuperação de dados externos',
    descricao:
      'A recuperação de dados externos falhou temporariamente e foi registrada no histórico local.',
    classificacao: {
      tipo: 'RETRIEVAL_ISSUE',
      label: 'Falha de coleta',
      conta_incidente: true,
    },
  },
];

function createMockIncidentHistoryService(
  args: IncidentHistoryStoryArgs,
): Partial<IncidentHistoryService> {
  return {
    fetchIncidents: () => createMockFetchResponse(args),
  };
}

function createMockFetchResponse(
  args: IncidentHistoryStoryArgs,
): Observable<IncidentHistoryResponse> {
  switch (args.state) {
    case 'loading':
      return NEVER;
    case 'backend-down':
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 0,
            statusText: 'Unknown Error',
            error: new ProgressEvent('error'),
          }),
      );
    case 'upstream-error':
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 502,
            statusText: 'Bad Gateway',
            error: {
              message: 'Não foi possível consultar o histórico armazenado.',
            },
          }),
      );
    case 'bad-request':
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'Bad Request',
            error: {
              message: 'O intervalo máximo permitido é de 365 dias.',
            },
          }),
      );
    case 'empty':
      return of(createResponse(args, [])).pipe(delay(args.networkDelayMs));
    case 'loaded':
      return of(createResponse(args, createRows(args))).pipe(
        delay(args.networkDelayMs),
      );
  }
}

function createResponse(
  args: IncidentHistoryStoryArgs,
  ocorrencias: IncidentHistoryItem[],
): IncidentHistoryResponse {
  return {
    meta: {
      versao: '1.0.0',
      timestamp: '2026-06-10T01:18:57.691711',
      filtros_aplicados: {
        data_inicio: '2026-06-01',
        data_fim: '2026-06-10',
        empresa: null,
        linha: null,
        classificacao: null,
      },
      source: '',
    },
    ocorrencias,
    total: ocorrencias.length,
  };
}

function createRows(args: IncidentHistoryStoryArgs): IncidentHistoryItem[] {
  const sourceRows = args.rows.length > 0 ? args.rows : MOCK_ROWS;

  return Array.from({ length: args.rowCount }, (_, index) => {
    const source = sourceRows[index % sourceRows.length];
    const dayOffset = Math.floor(index / sourceRows.length);
    const date = new Date(`${source.data_hora.replace(/\.\d+$/, '')}-03:00`);

    date.setMinutes(date.getMinutes() - index * 7);
    date.setDate(date.getDate() - dayOffset);

    const contaIncidente =
      args.incidentMode === 'all' ||
      (args.incidentMode === 'mixed' && source.classificacao.conta_incidente);

    return {
      ...source,
      id: source.id + index,
      data_hora: date.toISOString().replace('Z', ''),
      descricao: args.includeDescriptions ? source.descricao : '',
      classificacao: {
        ...source.classificacao,
        label: contaIncidente ? source.classificacao.label : 'Ignorar',
        conta_incidente: contaIncidente,
      },
    };
  });
}

const defaultArgs: IncidentHistoryStoryArgs = {
  state: 'loaded',
  rowCount: 8,
  includeDescriptions: true,
  incidentMode: 'mixed',
  networkDelayMs: 0,
  rows: MOCK_ROWS,
};

const meta: Meta<IncidentHistoryStoryArgs> = {
  title: 'History/IncidentHistory',
  component: IncidentHistoryComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [IncidentHistoryComponent],
    }),
  ],
  argTypes: {
    state: {
      control: 'select',
      options: [
        'loaded',
        'loading',
        'empty',
        'backend-down',
        'upstream-error',
        'bad-request',
      ],
    },
    rowCount: {
      control: { type: 'number', min: 0, max: 90, step: 1 },
    },
    includeDescriptions: {
      control: 'boolean',
    },
    incidentMode: {
      control: 'select',
      options: ['mixed', 'all', 'none'],
    },
    networkDelayMs: {
      control: { type: 'number', min: 0, max: 5000, step: 250 },
    },
    rows: {
      control: 'object',
    },
  },
  render: (args) => ({
    props: args,
    applicationConfig: {
      providers: [
        {
          provide: IncidentHistoryService,
          useValue: createMockIncidentHistoryService(args),
        },
      ],
    },
    template: '<app-incident-history />',
  }),
};

export default meta;

type Story = StoryObj<IncidentHistoryStoryArgs>;

export const Playground: Story = {
  args: defaultArgs,
};

export const Empty: Story = {
  args: {
    ...defaultArgs,
    state: 'empty',
    rowCount: 0,
  },
};

export const Loading: Story = {
  args: {
    ...defaultArgs,
    state: 'loading',
  },
};

export const BackendDown: Story = {
  args: {
    ...defaultArgs,
    state: 'backend-down',
  },
};

export const UpstreamError: Story = {
  args: {
    ...defaultArgs,
    state: 'upstream-error',
  },
};
