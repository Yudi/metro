import type { GTFSFeed } from '../config/gtfs.config';

export interface GTFSFileInfo {
  fileName: string;
  fileHash: string;
  fileSize: number;
  recordCount?: number;
}

export interface ImportProgress {
  status: 'idle' | 'downloading' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  currentFile?: string;
  totalFiles?: number;
  processedFiles?: number;
}

export interface GTFSProcessingResult {
  success: boolean;
  filesProcessed: number;
  recordsImported: number;
  skippedFiles: string[];
  errors: string[];
  dataChanged?: boolean;
  sourceSignature?: string;
  feed?: GTFSFeed;
  changedFeeds?: GTFSFeed[];
}

// Type-safe interfaces for GTFS records
export interface StopRecord {
  stop_id: string;
  stop_name: string;
  stop_desc?: string;
  platform_code?: string;
  stop_lat: number;
  stop_lon: number;
}

export interface ValidationResult<T> {
  valid: T[];
  invalid: Array<{ record: Record<string, unknown>; errors: string[] }>;
}
