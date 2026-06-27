import { WFSSourceType } from '../config/wfs.config';

export type { WFSSourceType };

export type ImportStatus =
  | 'idle'
  | 'downloading'
  | 'processing'
  | 'completed'
  | 'error';

export interface ImportProgress {
  status: ImportStatus;
  progress: number;
  message: string;
  currentSource?: string;
  totalSources?: number;
  processedSources?: number;
}

export interface WFSProcessingResult {
  success: boolean;
  sourcesProcessed: number;
  recordsImported: number;
  skippedSources: string[];
  errors: string[];
}

export interface WFSDatasetMetadata {
  source: WFSSourceType;
  fileHash: string;
  fileSize: number;
}

export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

export interface WFSFeature {
  type: 'Feature';
  id?: string;
  geometry: GeoJsonGeometry | null;
  properties: Record<string, unknown> | null;
}

export interface WFSFeatureCollection {
  type: 'FeatureCollection';
  features: WFSFeature[];
  crs?: {
    type?: string;
    properties?: {
      name?: string;
    };
  };
}
