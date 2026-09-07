export interface IncidentHistoryLine {
  id: string;
  nome: string;
  codigo: string;
}

export interface IncidentHistoryAgency {
  id: number;
  nome: string;
  key?: string;
  badge?: string;
}

export interface IncidentHistoryClassification {
  tipo: string;
  label: string;
  conta_incidente: boolean;
}

export interface IncidentHistoryItem {
  id: number;
  externalId?: string;
  data_hora: string;
  linha: IncidentHistoryLine;
  empresa: IncidentHistoryAgency;
  situacao: string;
  descricao: string;
  classificacao: IncidentHistoryClassification;
}

export interface IncidentHistoryFilters {
  data_inicio: string;
  data_fim: string;
  empresa: string | null;
  linha: string | null;
  classificacao: string | null;
}

export interface IncidentHistoryCacheMeta {
  hit: boolean;
  cachedAt: string;
  expiresAt: string;
}

export interface IncidentHistoryMeta {
  versao: string;
  timestamp: string;
  filtros_aplicados: IncidentHistoryFilters;
  source?: string;
  cache?: IncidentHistoryCacheMeta;
}

export interface IncidentHistoryResponse {
  meta: IncidentHistoryMeta;
  ocorrencias: IncidentHistoryItem[];
  total: number;
  limit?: number;
}

export interface IncidentHistoryQuery {
  dataInicio: string;
  dataFim: string;
}
