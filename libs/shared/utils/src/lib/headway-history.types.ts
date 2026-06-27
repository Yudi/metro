export interface HistoricalHeadwaySnapshot {
  id: string;
  observedAt: string;
  lineCode: string;
  stationCode?: string;
  stationName?: string | null;
  direction: string;
  averageSeconds?: number | null;
  sampleCount?: number | null;
  bucket?: string | null;
  bucketLabel?: string | null;
  isFallback: boolean;
  samples?: unknown;
  source: string;
  errors?: unknown;
  metadata?: unknown;
  createdAt: string;
}

export interface HistoricalHeadwayFilter {
  from?: string;
  to?: string;
  lineCodes?: string[];
  stationCodes?: string[];
  stationNames?: string[];
  directions?: string[];
  sources?: string[];
  includeIncidents?: boolean;
  includeHeadway?: boolean;
}

export interface HistoricalHeadwayQuery {
  filter?: HistoricalHeadwayFilter;
  limit?: number;
  offset?: number;
}
