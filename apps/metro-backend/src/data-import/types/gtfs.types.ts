export interface GTFSFileInfo {
  fileName: string;
  fileHash: string;
  fileSize: number;
  recordCount?: number;
}

export interface GTFSDatasetInfo {
  fileHash: string;
  fileSize: number;
  version?: string;
  downloadedAt: Date;
  files: GTFSFileInfo[];
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
}

export type GTFSFileType =
  | 'agency.txt'
  | 'calendar.txt'
  | 'fare_attributes.txt'
  | 'fare_rules.txt'
  | 'frequencies.txt'
  | 'routes.txt'
  | 'shapes.txt'
  | 'stop_times.txt'
  | 'stops.txt'
  | 'trips.txt';

// Type-safe interfaces for GTFS records
export interface StopRecord {
  stop_id: string;
  stop_name: string;
  stop_desc?: string;
  stop_lat: number;
  stop_lon: number;
}

export interface ValidationResult<T> {
  valid: T[];
  invalid: Array<{ record: Record<string, unknown>; errors: string[] }>;
}

export const GTFS_EXPECTED_FILES: GTFSFileType[] = [
  'agency.txt',
  'calendar.txt',
  'fare_attributes.txt',
  'fare_rules.txt',
  'frequencies.txt',
  'routes.txt',
  'shapes.txt',
  'stop_times.txt',
  'stops.txt',
  'trips.txt',
];

export const GTFS_RUST_PROCESSED_FILES: GTFSFileType[] = ['shapes.txt'];

export const GTFS_CSV_PROCESSED_FILES: GTFSFileType[] = [
  'agency.txt',
  'calendar.txt',
  'fare_attributes.txt',
  'fare_rules.txt',
  'frequencies.txt',
  'routes.txt',
  'stop_times.txt',
  'stops.txt',
  'trips.txt',
];
