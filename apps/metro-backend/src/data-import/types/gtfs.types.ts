import type { GTFSFeed } from '../config/gtfs.config';

export interface GTFSFileInfo {
  fileName: string;
  fileHash: string;
  fileSize: number;
  recordCount?: number;
}

export interface GTFSDatasetInfo {
  feed?: GTFSFeed;
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
  dataChanged?: boolean;
  sourceSignature?: string;
  feed?: GTFSFeed;
  changedFeeds?: GTFSFeed[];
}

export type GTFSFileType =
  | 'agency.txt'
  | 'calendar.txt'
  | 'calendar_dates.txt'
  | 'fare_attributes.txt'
  | 'fare_rules.txt'
  | 'frequencies.txt'
  | 'feed_info.txt'
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
  platform_code?: string;
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
  'calendar_dates.txt',
  'fare_attributes.txt',
  'fare_rules.txt',
  'frequencies.txt',
  'feed_info.txt',
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
  'calendar_dates.txt',
  'fare_attributes.txt',
  'fare_rules.txt',
  'frequencies.txt',
  'feed_info.txt',
  'routes.txt',
  'stop_times.txt',
  'stops.txt',
  'trips.txt',
];
