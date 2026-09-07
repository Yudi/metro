import type {
  ExtendedNextTrainLineCode,
  RailStatusCode,
} from '@metro/shared/utils';
import type { NextTrainArrivalDto } from '../dto/next-train.dto';

export type LineCode = ExtendedNextTrainLineCode;
export type PollBucket = 'line8Line9' | 'line4' | 'extended';
export type OffHoursOperationState = 'operating' | 'nonOperating' | 'unknown';

export interface StationCacheEntry {
  lineCode: LineCode;
  stationCode: string;
  stationName: string;
  trains: NextTrainArrivalDto[];
  hash: string;
  fetchedAt: number;
  hasError: boolean;
  operationClosed: boolean;
  outOfSchedule: boolean;
}

export interface StationDelta {
  lineCode: LineCode;
  stationCode: string;
  trains: NextTrainArrivalDto[];
  timestamp: number;
  hasError: boolean;
  operationClosed: boolean;
  outOfSchedule: boolean;
}

export type PollCompleteListener = (deltas: StationDelta[]) => void;

export const POLL_INTERVALS: Record<
  PollBucket,
  { normal: number; error: number }
> = {
  line8Line9: { normal: 30_000, error: 60_000 },
  line4: { normal: 30_000, error: 60_000 },
  extended: { normal: 30_000, error: 60_000 },
};

export const OFF_HOURS_STATUS_RECHECK_INTERVAL = 300_000;
export const MAX_CONCURRENT_STATION_POLLS = 8;
export const NON_OPERATING_STATUS_CODES = new Set<RailStatusCode>([
  'OperacaoEncerrada',
  'Paralisada',
]);
