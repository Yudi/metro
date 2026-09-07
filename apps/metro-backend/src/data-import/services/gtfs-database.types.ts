export interface FeedDatasetRow {
  source: string;
  file_hash: string;
  file_size: number;
  version: string | null;
  last_updated: Date;
  completed: boolean;
}

export interface FeedFileRow {
  file_name: string;
  record_count: number | null;
}
