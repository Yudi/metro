import type {
  DirectionHeadway,
  TrackedRailLineCode,
  TrackedRailVehicle,
  TrainCarOccupancy,
} from '@metro/shared/utils';

/**
 * Train position status relative to a station
 */
export type TrainPositionStatus =
  | 'approaching'
  | 'at_station'
  | 'departing'
  | 'in_transit'
  | null;

/**
 * Next train arrival data from backend
 * Optimized to only include fields needed for display
 */
export interface NextTrainArrival {
  destinationCode: string;
  destinationName: string;
  trainCurrentStationName: string;
  arrivalTime: string;
  isAtPlatform: boolean | null;
  isTrainStopped: boolean | null;
  // CPTM-specific fields for live position tracking
  trainPositionStatus?: TrainPositionStatus;
  trainNearStationName?: string | null;
  /** Last passed station, when unambiguous in the current position snapshot. */
  trainLastPassedStationName?: string | null;
  cars?: TrainCarOccupancy[];
}

/**
 * WebSocket update payload
 */
export interface NextTrainUpdate {
  type: 'full' | 'delta';
  lineCode: string;
  stationCode: string;
  trains: NextTrainArrival[];
  timestamp: number;
  /** True if API returned an error (vs no data available) */
  hasError?: boolean;
  /** True while the backend request is queued or running */
  processing?: boolean;
  /** True when operation is closed and no station arrival data remains relevant */
  operationClosed?: boolean;
  outOfSchedule?: boolean;
  headway?: DirectionHeadway[];
}

/**
 * Station data with error state
 */
export interface StationTrainData {
  trains: NextTrainArrival[];
  hasError: boolean;
  /** True once we've received data from backend (even if trains array is empty) */
  dataReceived: boolean;
  /** True while the backend request is queued or running */
  processing: boolean;
  /** True when operation is closed and no station arrival data remains relevant */
  operationClosed: boolean;
  outOfSchedule: boolean;
  headway?: DirectionHeadway[];
}

/**
 * CPTM vehicle update payload from backend
 */
export interface CptmVehicleUpdate {
  type: 'full' | 'delta';
  lineCode: TrackedRailLineCode;
  vehicles: TrackedRailVehicle[];
  timestamp: number;
}
