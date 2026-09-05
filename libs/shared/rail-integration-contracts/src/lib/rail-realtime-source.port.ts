import {
  ActualCptmLineCode,
  TrackedRailLineCode,
  ExtendedNextTrainLineCode,
  SpecialRailService,
  TrainCarOccupancy,
} from '@metro/shared/utils';

export type TrainPositionStatus =
  | 'approaching'
  | 'at_station'
  | 'departing'
  | 'in_transit'
  | null;

export interface RailNextTrainArrival {
  destinationCode: string;
  destinationName: string;
  trainCurrentStationName: string;
  arrivalTime: string;
  isAtPlatform: boolean | null;
  isTrainStopped: boolean | null;
  trainPositionStatus?: TrainPositionStatus;
  trainNearStationName?: string | null;
  /** Last passed station, when unambiguous in the current position snapshot. */
  trainLastPassedStationName?: string | null;
  cars?: TrainCarOccupancy[];
}

export interface RailNextTrainFetchResult {
  success: boolean;
  trains: RailNextTrainArrival[];
  isApiError: boolean;
}

export interface RailStationLookupResult {
  stationCode: string;
  stationName: string;
  latitude: number;
  longitude: number;
}

export interface RailVehiclePosition {
  id: string;
  prefix: string;
  lat: number;
  lng: number;
  bearing: number;
  wheelchair: boolean;
  climatized: boolean;
  lastUpdate: number;
  averageSpeed: number;
  stopSequence: number;
  destination?: string;
  estimated?: boolean;
  validUntil?: number;
  /** Public station block used to project an estimated map position. */
  estimatedPositionDescription?: string;
}

/** Public network reference data supplied to the rail integration service. */
export interface RailVehicleMapContext {
  stations: Array<{ code: string; lat: number; lng: number }>;
  paths: Array<{ points: Array<{ lat: number; lng: number }> }>;
}

export const RAIL_MAP_CONTEXT_LIMITS = {
  stations: 500,
  paths: 2_000,
  points: 100_000,
} as const;

export interface RailHeadwayObservation {
  trainKey: string;
  directionName: string;
  secondsToStation: number;
}

export abstract class RailRealtimeSourcePort {
  abstract getAvailableSpecialRailServices(): Promise<SpecialRailService[]>;

  abstract fetchNextTrains(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ): Promise<RailNextTrainFetchResult>;

  abstract getStationName(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ): Promise<string | undefined>;

  abstract getStationCodes(
    lineCode: ExtendedNextTrainLineCode,
  ): Promise<string[]>;

  abstract getStationByName(
    lineCode: ActualCptmLineCode,
    stationName: string,
  ): Promise<RailStationLookupResult | undefined>;

  abstract getVehiclesForLine(
    lineCode: TrackedRailLineCode,
    mapContext?: RailVehicleMapContext,
  ): Promise<RailVehiclePosition[]>;

  abstract fetchHeadwayObservations(
    lineCode: ActualCptmLineCode,
    stationCode: string,
  ): Promise<RailHeadwayObservation[]>;
}
