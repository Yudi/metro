import type {
  ExtendedNextTrainLineCode,
  HeadwayBucketId,
  StationHeadway,
} from '@metro/shared/utils';
import type {
  NextTrainArrivalDto,
  TrainPositionStatus,
} from '../dto/next-train.dto';
import type { HeadwayCalculationSamples } from '../../historical/historical.service';

export interface TrainSnapshot {
  destinationCode: string;
  destinationName: string;
  arrivalTime: string;
  isAtPlatform: boolean | null;
  trainPositionStatus?: TrainPositionStatus;
  trainCurrentStationName: string;
}

export interface StationSnapshot {
  trains: TrainSnapshot[];
  fetchedAt: number;
}

export interface CalculatedStationHeadway {
  headway: StationHeadway | null;
  samplesByDirection: Map<string, HeadwayCalculationSamples>;
  insufficientDirections: {
    direction: string;
    sampleCount: number;
  }[];
}

export interface SaoPauloDateParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}

export interface HeadwayPassageDetection {
  lineCode: ExtendedNextTrainLineCode;
  stationCode: string;
  previous: StationSnapshot;
  currentTrains: NextTrainArrivalDto[];
  fetchedAt: number;
  recordPassage: (
    lineCode: string,
    stationCode: string,
    direction: string,
    timestamp: number,
    trainId?: string,
  ) => Promise<void>;
}

export const MIN_PASSAGE_INTERVAL = 60_000;
export const DUPLICATE_COOLDOWN = 90_000;

export type { HeadwayBucketId };
