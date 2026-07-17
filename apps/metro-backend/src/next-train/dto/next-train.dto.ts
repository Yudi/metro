import { ApiProperty } from '@nestjs/swagger';
import type {
  ExtendedNextTrainLineCode,
  DirectionHeadway,
  TrainCarOccupancy,
} from '@metro/shared/utils';

/**
 * Train position status relative to a station
 */
export type TrainPositionStatus =
  | 'approaching' // Within ~500m and prediction < 2min
  | 'at_station' // Within ~150m of station
  | 'departing' // Just left station (within ~500m, moving away)
  | 'in_transit' // Moving between stations
  | null; // Unknown

/**
 * DTO for next train arrival information (WebSocket)
 * Optimized to only include fields needed by frontend
 */
export class NextTrainArrivalDto {
  @ApiProperty({ example: 'VAG', description: 'Destination station code' })
  destinationCode!: string;

  @ApiProperty({ example: 'Varginha', description: 'Destination station name' })
  destinationName!: string;

  @ApiProperty({
    example: 'Villa Lobos–Jaguaré',
    description: 'Train current station name',
  })
  trainCurrentStationName!: string;

  @ApiProperty({ example: '21:04', description: 'Predicted arrival time' })
  arrivalTime!: string;

  @ApiProperty({
    example: false,
    description: 'Train is at the platform of this station',
  })
  isAtPlatform!: boolean | null;

  @ApiProperty({
    example: true,
    description:
      'Train is stopped at its current station (vs moving between stations)',
  })
  isTrainStopped!: boolean | null;

  // === Extended rail fields for live position tracking ===

  @ApiProperty({
    example: 'approaching',
    description:
      'Train position status: approaching, at_station, departing, in_transit',
    required: false,
  })
  trainPositionStatus?: TrainPositionStatus;

  @ApiProperty({
    example: 'Brás',
    description: 'Name of station train is near/at',
    required: false,
  })
  trainNearStationName?: string | null;

  @ApiProperty({
    description:
      'Per-car occupancy normalized from empty (0) to full (6), when supported by the provider',
    required: false,
    isArray: true,
  })
  cars?: TrainCarOccupancy[];
}

/**
 * DTO for station subscription request
 */
export class SubscribeStationDto {
  @ApiProperty({
    example: 'L9',
    description: 'Line code (L4, L8, L9, L10, L11, L12, L13)',
  })
  lineCode!: ExtendedNextTrainLineCode;

  @ApiProperty({ example: 'HBR', description: 'Station code' })
  stationCode!: string;
}

/**
 * DTO for WebSocket next train update (delta or full)
 */
export class NextTrainUpdateDto {
  @ApiProperty({ description: 'Type of update: full or delta' })
  type!: 'full' | 'delta';

  @ApiProperty({ description: 'Line code' })
  lineCode!: string;

  @ApiProperty({ description: 'Station code' })
  stationCode!: string;

  @ApiProperty({ description: 'Train arrivals data' })
  trains!: NextTrainArrivalDto[];

  @ApiProperty({ description: 'Server timestamp' })
  timestamp!: number;

  @ApiProperty({
    description: 'Whether API returned an error (vs no data available)',
    required: false,
  })
  hasError?: boolean;

  @ApiProperty({
    description: 'Whether the request is queued or currently being processed',
    required: false,
  })
  processing?: boolean;

  @ApiProperty({
    description:
      'Whether operation is closed and no station arrival data remains relevant',
    required: false,
  })
  operationClosed?: boolean;

  @ApiProperty({
    description:
      'Whether a special service has no scheduled departure within its operating margin',
    required: false,
  })
  outOfSchedule?: boolean;

  @ApiProperty({
    description: 'Average headway (time between trains) per direction',
    required: false,
  })
  headway?: DirectionHeadway[];
}

/**
 * Result from upstream fetch - distinguishes between success/empty and error
 */
export interface NextTrainFetchResult {
  success: boolean;
  trains: NextTrainArrivalDto[];
  /** True if the upstream source returned an error */
  isApiError: boolean;
}

/**
 * Hash of next train data for delta comparison
 */
export type NextTrainHash = string;
