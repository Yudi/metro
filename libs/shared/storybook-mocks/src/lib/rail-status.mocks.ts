/**
 * Shared mock data and utilities for rail-related Storybook stories.
 * Used by SubwayStationDialog, LineStatusGrid, and other rail components.
 */

import { of, delay } from 'rxjs';
import type {
  RailLineStatus,
  RailStatusCode,
  RailLinesStatusResponse,
} from '@metro/shared/utils';

// Types

export type FetchKind = 'normal' | 'issue' | 'unavailable' | 'error' | 'empty';

export interface MockRailServiceOptions {
  /** Pre-cached status response (null = no cache) */
  cached: RailLinesStatusResponse | null;
  /** Whether cache is considered fresh */
  isFresh: boolean;
  /** Kind of result to return from fetch */
  fetchKind: FetchKind;
  /** Artificial delay (ms) for fetch observable */
  fetchDelayMs: number;
}

export interface MockApiServiceOptions {
  /** Kind of result to return from getRailStatus */
  fetchKind: FetchKind;
  /** Artificial delay (ms) for fetch observable */
  fetchDelayMs: number;
}

// Line Status Mock Data: All São Paulo Metro/CPTM Lines

// L1 - Azul (Metro)
export const L1_NORMAL: RailLineStatus = {
  code: 1,
  colorName: 'Azul',
  colorHex: '#00529F',
  line: 'Linha 1 - Azul',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

export const L1_REDUCED: RailLineStatus = {
  code: 1,
  colorName: 'Azul',
  colorHex: '#00529F',
  line: 'Linha 1 - Azul',
  statusCode: 'VelocidadeReduzida',
  statusLabel: 'Velocidade Reduzida',
  statusColor: 'amarelo',
  description: 'Velocidade reduzida entre Paraíso e Jabaquara.',
};

export const L1_CLOSED: RailLineStatus = {
  code: 1,
  colorName: 'Azul',
  colorHex: '#00529F',
  line: 'Linha 1 - Azul',
  statusCode: 'OperacaoEncerrada',
  statusLabel: 'Operação Encerrada',
  statusColor: 'cinza',
  description: null,
};

export const L1_UNAVAILABLE: RailLineStatus = {
  code: 1,
  colorName: 'Azul',
  colorHex: '#00529F',
  line: 'Linha 1 - Azul',
  statusCode: 'DadosIndisponiveis',
  statusLabel: 'Dados Indisponíveis',
  statusColor: 'amarelo',
  description: null,
};

// L2 - Verde (Metro)
export const L2_NORMAL: RailLineStatus = {
  code: 2,
  colorName: 'Verde',
  colorHex: '#007449',
  line: 'Linha 2 - Verde',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

export const L2_STOPPED: RailLineStatus = {
  code: 2,
  colorName: 'Verde',
  colorHex: '#007449',
  line: 'Linha 2 - Verde',
  statusCode: 'Paralisada',
  statusLabel: 'Paralisada',
  statusColor: 'vermelho',
  description: 'Linha paralisada por falta de energia.',
};

// L3 - Vermelha (Metro)
export const L3_NORMAL: RailLineStatus = {
  code: 3,
  colorName: 'Vermelha',
  colorHex: '#E61B3B',
  line: 'Linha 3 - Vermelha',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

// L4 - Amarela (ViaQuatro)
export const L4_NORMAL: RailLineStatus = {
  code: 4,
  colorName: 'Amarela',
  colorHex: '#FCDF13',
  line: 'Linha 4 - Amarela',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

export const L4_PARTIAL: RailLineStatus = {
  code: 4,
  colorName: 'Amarela',
  colorHex: '#FCDF13',
  line: 'Linha 4 - Amarela',
  statusCode: 'OperacaoParcial',
  statusLabel: 'Operação Parcial',
  statusColor: 'amarelo',
  description: 'Circulação interrompida entre Luz e Paulista.',
};

// L5 - Lilás (ViaMobilidade)
export const L5_NORMAL: RailLineStatus = {
  code: 5,
  colorName: 'Lilás',
  colorHex: '#8552A1',
  line: 'Linha 5 - Lilás',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

// L7 - Rubi (CPTM)
export const L7_NORMAL: RailLineStatus = {
  code: 7,
  colorName: 'Rubi',
  colorHex: '#9D2A7F',
  line: 'Linha 7 - Rubi',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

// L8 - Diamante (ViaMobilidade)
export const L8_NORMAL: RailLineStatus = {
  code: 8,
  colorName: 'Diamante',
  colorHex: '#969696',
  line: 'Linha 8 - Diamante',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

// L9 - Esmeralda (ViaMobilidade)
export const L9_NORMAL: RailLineStatus = {
  code: 9,
  colorName: 'Esmeralda',
  colorHex: '#00A78E',
  line: 'Linha 9 - Esmeralda',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

export const L9_REDUCED: RailLineStatus = {
  code: 9,
  colorName: 'Esmeralda',
  colorHex: '#00A78E',
  line: 'Linha 9 - Esmeralda',
  statusCode: 'VelocidadeReduzida',
  statusLabel: 'Velocidade Reduzida',
  statusColor: 'amarelo',
  description: 'Velocidade reduzida entre Pinheiros e Osasco.',
};

// L10 - Turquesa (CPTM)
export const L10_NORMAL: RailLineStatus = {
  code: 10,
  colorName: 'Turquesa',
  colorHex: '#00A3A4',
  line: 'Linha 10 - Turquesa',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

// L11 - Coral (CPTM)
export const L11_NORMAL: RailLineStatus = {
  code: 11,
  colorName: 'Coral',
  colorHex: '#F35A22',
  line: 'Linha 11 - Coral',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

export const L11_STOPPED: RailLineStatus = {
  code: 11,
  colorName: 'Coral',
  colorHex: '#F35A22',
  line: 'Linha 11 - Coral',
  statusCode: 'Paralisada',
  statusLabel: 'Paralisada',
  statusColor: 'vermelho',
  description: 'Linha paralisada devido a problema na via.',
};

// L12 - Safira (CPTM)
export const L12_NORMAL: RailLineStatus = {
  code: 12,
  colorName: 'Safira',
  colorHex: '#003A77',
  line: 'Linha 12 - Safira',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

// L13 - Jade (CPTM)
export const L13_NORMAL: RailLineStatus = {
  code: 13,
  colorName: 'Jade',
  colorHex: '#00B067',
  line: 'Linha 13 - Jade',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

// L15 - Prata (Metro Monorail)
export const L15_NORMAL: RailLineStatus = {
  code: 15,
  colorName: 'Prata',
  colorHex: '#A8B3B0',
  line: 'Linha 15 - Prata',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

export const L17_NORMAL: RailLineStatus = {
  code: 17,
  colorName: 'Ouro',
  colorHex: '#FFD700',
  line: 'Linha 17 - Ouro',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Operação Normal',
  statusColor: 'verde',
  description: null,
};

// Preset Line Collections

/** All lines operating normally */
export const ALL_LINES_NORMAL: RailLineStatus[] = [
  L1_NORMAL,
  L2_NORMAL,
  L3_NORMAL,
  L4_NORMAL,
  L5_NORMAL,
  L7_NORMAL,
  L8_NORMAL,
  L9_NORMAL,
  L10_NORMAL,
  L11_NORMAL,
  L12_NORMAL,
  L13_NORMAL,
  L15_NORMAL,
  L17_NORMAL,
];

/** All lines closed (after hours) */
export const ALL_LINES_CLOSED: RailLineStatus[] = ALL_LINES_NORMAL.map(
  (line) => ({
    ...line,
    statusCode: 'OperacaoEncerrada' as RailStatusCode,
    statusLabel: 'Operação Encerrada',
    statusColor: 'cinza' as const,
  }),
);

/** Mixed status: some lines with issues */
export const LINES_WITH_ISSUES: RailLineStatus[] = [
  L1_REDUCED,
  L2_STOPPED,
  L3_NORMAL,
  L4_PARTIAL,
  L5_NORMAL,
  L7_NORMAL,
  L8_NORMAL,
  L9_REDUCED,
  L10_NORMAL,
  L11_STOPPED,
  L12_NORMAL,
  L13_NORMAL,
  L15_NORMAL,
  L17_NORMAL,
];

/** Some lines with unavailable data */
export const LINES_UNAVAILABLE: RailLineStatus[] = [
  L1_UNAVAILABLE,
  L2_NORMAL,
  L3_NORMAL,
  L4_NORMAL,
  L5_NORMAL,
  L7_NORMAL,
  L8_NORMAL,
  L9_NORMAL,
  L10_NORMAL,
  L11_NORMAL,
  L12_NORMAL,
  L13_NORMAL,
  L15_NORMAL,
  L17_NORMAL,
];

// Response Builders

export function createRailStatusResponse(
  lines: RailLineStatus[],
  options: { success?: boolean | null; errorMessage?: string | null } = {},
): RailLinesStatusResponse {
  return {
    lines,
    lastUpdated: new Date(),
    success: options.success ?? true,
    errorMessage: options.errorMessage ?? null,
  };
}

export function getLinesForKind(kind: FetchKind): RailLineStatus[] {
  switch (kind) {
    case 'normal':
      return ALL_LINES_NORMAL;
    case 'issue':
      return LINES_WITH_ISSUES;
    case 'unavailable':
      return LINES_UNAVAILABLE;
    case 'error':
    case 'empty':
    default:
      return [];
  }
}

// Mock Service Factories

/**
 * Creates a mock RailGraphqlService for Storybook stories.
 * Used by SubwayStationDialog and other components that use RailGraphqlService.
 */
export function createMockRailGraphqlService(opts: MockRailServiceOptions) {
  const fetchResult = (): RailLinesStatusResponse => {
    if (opts.fetchKind === 'error') {
      return createRailStatusResponse([], {
        success: false,
        errorMessage:
          'Não foi possível conectar ao servidor. Tente novamente mais tarde.',
      });
    }
    return createRailStatusResponse(getLinesForKind(opts.fetchKind));
  };

  return {
    getCachedStatus: () => opts.cached,
    isCacheFresh: () => opts.isFresh,
    fetchLinesStatus: () => {
      const result = fetchResult();
      return opts.fetchDelayMs > 0
        ? of(result).pipe(delay(opts.fetchDelayMs))
        : of(result);
    },
    getStatusColorClass: (statusCode: RailStatusCode) => {
      switch (statusCode) {
        case 'OperacaoNormal':
          return 'status-normal';
        case 'VelocidadeReduzida':
        case 'AtividadeProgramada':
        case 'OperacaoParcial':
        case 'DadosIndisponiveis':
          return 'status-warning';
        case 'Paralisada':
          return 'status-critical';
        case 'OperacaoEncerrada':
        default:
          return 'status-closed';
      }
    },
    hasIssue: (statusCode: RailStatusCode) =>
      [
        'VelocidadeReduzida',
        'OperacaoParcial',
        'Paralisada',
        'AtividadeProgramada',
      ].includes(statusCode),
    isUnavailable: (statusCode: RailStatusCode) =>
      statusCode === 'DadosIndisponiveis',
  };
}

/**
 * Creates a mock ApiService for Storybook stories.
 * Used by LineStatusGrid and other components that use ApiService.getRailStatus().
 */
export function createMockApiService(opts: MockApiServiceOptions) {
  const fetchResult = (): RailLinesStatusResponse => {
    if (opts.fetchKind === 'error') {
      return createRailStatusResponse([], {
        success: false,
        errorMessage:
          'Não foi possível conectar ao servidor. Tente novamente mais tarde.',
      });
    }
    if (opts.fetchKind === 'empty') {
      return createRailStatusResponse([], { success: null });
    }
    return createRailStatusResponse(getLinesForKind(opts.fetchKind));
  };

  return {
    getRailStatus: () => {
      const result = fetchResult();
      return opts.fetchDelayMs > 0
        ? of(result).pipe(delay(opts.fetchDelayMs))
        : of(result);
    },
  };
}
