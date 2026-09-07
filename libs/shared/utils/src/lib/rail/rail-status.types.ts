/**
 * Shared rail status types between frontend and backend
 */

import type { SpecialRailLineCode } from './rail-special-lines.config';

/**
 * Normalized rail status codes (without accents/spaces)
 * These are the canonical status codes used internally
 */
export type RailStatusCode =
  | 'AtividadeProgramada'
  | 'OperacaoNormal'
  | 'OperacaoTransitoria'
  | 'OperacaoEspecial'
  | 'OperacaoDiferenciada'
  | 'OperacaoEncerrada'
  | 'OperacaoComImpactoPontual'
  | 'VelocidadeReduzida'
  | 'CirculacaoDeTrens'
  | 'OperacaoParcial'
  | 'MaioresIntervalos'
  | 'Paralisada'
  | 'StatusDesconhecido'
  | 'DadosIndisponiveis';

/**
 * Status color indicators from API
 */
export type RailStatusColor = 'verde' | 'amarelo' | 'vermelho' | 'cinza';

/**
 * Individual rail line status
 */
export interface RailLineStatus {
  code: number;
  colorName: string;
  colorHex: string;
  line: string;
  statusCode: RailStatusCode;
  statusLabel: string;
  statusColor: RailStatusColor;
  description: string | null;
  incidentCategory?: string | null;
  detail?: string | null;
}

export interface SpecialRailDeparture {
  label: string;
  time: string;
}

export interface SpecialRailIssue {
  code: number;
  line: string;
  description: string;
}

export interface SpecialRailLineStatus {
  code: SpecialRailLineCode;
  colorName: string;
  colorHex: string;
  line: string;
  statusCode: RailStatusCode;
  statusLabel: string;
  statusColor: RailStatusColor;
  nextDepartures: SpecialRailDeparture[];
  issues: SpecialRailIssue[];
}

export interface SpecialRailInfoCardStatus {
  id: string;
  title: string;
  subtitle: string;
  badgeIcon: string;
  badgeColorHex: string;
  statusCode: RailStatusCode;
  statusLabel: string;
}

/**
 * Rail lines status response
 */
export interface RailLinesStatusResponse {
  lines: RailLineStatus[];
  specialLines?: SpecialRailLineStatus[];
  specialInfoCards?: SpecialRailInfoCardStatus[];
  lastUpdated: Date;
  success: boolean | null;
  errorMessage: string | null;
}

/**
 * Status label to normalized code mapping
 * Handles variations in API responses
 */
export const STATUS_LABEL_TO_CODE: Record<string, RailStatusCode> = {
  // Normalized (no accents/spaces)
  operacaonormal: 'OperacaoNormal',
  operacaotransitoria: 'OperacaoTransitoria',
  operacaoespecial: 'OperacaoEspecial',
  operacaodiferenciada: 'OperacaoDiferenciada',
  operacaocomimpactopontual: 'OperacaoComImpactoPontual',
  atividadeprogramada: 'AtividadeProgramada',
  operacaoencerrada: 'OperacaoEncerrada',
  velocidadereduzida: 'VelocidadeReduzida',
  circulacaodetrens: 'CirculacaoDeTrens',
  operacaoparcial: 'OperacaoParcial',
  maioresintervalos: 'MaioresIntervalos',
  paralisada: 'Paralisada',
  operacaoparalisada: 'Paralisada',
  statusdesconhecido: 'StatusDesconhecido',
  dadosindisponiveis: 'DadosIndisponiveis',
};

/**
 * Status display labels in Portuguese
 */
export const STATUS_CODE_TO_LABEL: Record<RailStatusCode, string> = {
  OperacaoNormal: 'Operação Normal',
  OperacaoTransitoria: 'Operação Transitória',
  OperacaoEspecial: 'Operação Especial',
  OperacaoDiferenciada: 'Operação Diferenciada',
  OperacaoComImpactoPontual: 'Operação com Impacto Pontual',
  AtividadeProgramada: 'Atividade Programada',
  VelocidadeReduzida: 'Velocidade Reduzida',
  CirculacaoDeTrens: 'Circulação de Trens',
  OperacaoParcial: 'Operação Parcial',
  MaioresIntervalos: 'Maiores Intervalos',
  Paralisada: 'Paralisada',
  OperacaoEncerrada: 'Operação Encerrada',
  StatusDesconhecido: 'Status Desconhecido',
  DadosIndisponiveis: 'Dados Indisponíveis',
};

/**
 * Status color mapping for each code
 */
export const STATUS_CODE_TO_COLOR: Record<RailStatusCode, RailStatusColor> = {
  OperacaoNormal: 'verde',
  OperacaoTransitoria: 'amarelo',
  OperacaoEspecial: 'verde',
  OperacaoDiferenciada: 'verde',
  OperacaoComImpactoPontual: 'amarelo',
  AtividadeProgramada: 'amarelo',
  VelocidadeReduzida: 'amarelo',
  CirculacaoDeTrens: 'amarelo',
  OperacaoParcial: 'amarelo',
  MaioresIntervalos: 'amarelo',
  Paralisada: 'vermelho',
  OperacaoEncerrada: 'cinza',
  StatusDesconhecido: 'amarelo',
  DadosIndisponiveis: 'amarelo',
};

/**
 * Normalize a status string by removing accents and spaces
 * @param status - Raw status string from API
 * @returns Lowercase string without accents or spaces
 */
export function normalizeStatusString(status: string): string {
  return status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/\s+/g, '') // Remove spaces
    .toLowerCase();
}

/**
 * Convert a raw status label to normalized status code
 * @param label - Raw status label from API
 * @returns Normalized RailStatusCode
 */
export function getStatusCodeFromLabel(label: string): RailStatusCode {
  const normalized = normalizeStatusString(label);
  return STATUS_LABEL_TO_CODE[normalized] ?? 'DadosIndisponiveis';
}

/**
 * Check if a status code indicates the line data is unavailable
 */
export function isStatusUnavailable(statusCode: RailStatusCode): boolean {
  return statusCode === 'DadosIndisponiveis';
}

/**
 * Check if a status code indicates an issue
 */
export function hasStatusIssue(statusCode: RailStatusCode): boolean {
  return (
    statusCode === 'VelocidadeReduzida' ||
    statusCode === 'OperacaoParcial' ||
    statusCode === 'Paralisada' ||
    statusCode === 'AtividadeProgramada'
  );
}

export function getStatusColorClass(statusCode: RailStatusCode): string {
  const statusColor = STATUS_CODE_TO_COLOR[statusCode];

  if (statusCode === 'OperacaoEncerrada') {
    return 'status-closed';
  }

  switch (statusColor) {
    case 'verde':
      return 'status-normal';
    case 'amarelo':
      return 'status-warning';
    case 'vermelho':
      return 'status-critical';
    case 'cinza':
    default:
      return 'status-closed';
  }
}

export function isStatusClickable(statusCode: RailStatusCode): boolean {
  return (
    statusCode === 'OperacaoEspecial' ||
    !(
      STATUS_CODE_TO_COLOR[statusCode] === 'verde' ||
      STATUS_CODE_TO_COLOR[statusCode] === 'cinza' ||
      statusCode === 'DadosIndisponiveis'
    )
  );
}

export function hasDashboardStatusIssue(statusCode: RailStatusCode): boolean {
  return !(
    statusCode === 'OperacaoNormal' || statusCode === 'OperacaoEncerrada'
  );
}
