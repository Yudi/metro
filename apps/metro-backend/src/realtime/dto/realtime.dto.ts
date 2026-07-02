import { ApiProperty } from '@nestjs/swagger';

/**
 * Real-time vehicle position from OlhoVivo API
 */
export class VehiclePosition {
  @ApiProperty({ description: 'Vehicle prefix/identifier' })
  p!: number;

  @ApiProperty({ description: 'Is accessible for people with disabilities' })
  a!: boolean;

  @ApiProperty({
    description: 'Timestamp when location was captured (ISO 8601)',
  })
  ta!: string;

  @ApiProperty({ description: 'Latitude' })
  py!: number;

  @ApiProperty({ description: 'Longitude' })
  px!: number;

  @ApiProperty({
    description: 'Predicted arrival time (only in arrival predictions)',
    required: false,
  })
  t?: string;

  @ApiProperty({
    description: 'Heading in radians (added by backend, null if unknown)',
    required: false,
    type: 'number',
    nullable: true,
  })
  heading?: number | null;
}

/**
 * Line with vehicle positions
 */
export class LineWithVehicles {
  @ApiProperty({ description: 'Full route code (e.g., "5015-10")' })
  c!: string;

  @ApiProperty({ description: 'Line identifier code used by SPTrans API' })
  cl!: number;

  @ApiProperty({
    description:
      'Direction: 1 = Main Terminal to Secondary, 2 = Secondary to Main',
  })
  sl!: number;

  @ApiProperty({ description: 'Destination terminal' })
  lt0!: string;

  @ApiProperty({ description: 'Origin terminal' })
  lt1!: string;

  @ApiProperty({ description: 'Number of vehicles' })
  qv!: number;

  @ApiProperty({
    description: 'List of vehicle positions',
    type: [VehiclePosition],
  })
  vs!: VehiclePosition[];
}

/**
 * Line search result from /Linha/Buscar endpoint
 */
export interface LineSearchResult {
  cl: number; // Line code (código da linha)
  lc: boolean; // Circular (linha circular)
  lt: string; // Line sign (letreiro)
  sl: number; // Direction (sentido): 1 or 2
  tp: string; // Type (tipo de linha)
  ts: string; // Description (descrição)
}

/**
 * Response from position endpoints
 */
export class PositionResponse {
  @ApiProperty({ description: 'Reference time' })
  hr!: string;

  @ApiProperty({ description: 'Lines with vehicles', type: [LineWithVehicles] })
  l!: LineWithVehicles[];
}

/**
 * Response from /Posicao/Linha endpoint (returns vehicles directly, not wrapped in lines)
 */
export class LinePositionResponse {
  @ApiProperty({ description: 'Reference time' })
  hr!: string;

  @ApiProperty({ description: 'Vehicle positions', type: [VehiclePosition] })
  vs!: VehiclePosition[];
}

/**
 * Stop with arrival predictions
 */
export class StopWithPredictions {
  @ApiProperty({ description: 'Stop code' })
  cp!: number;

  @ApiProperty({ description: 'Stop name' })
  np!: string;

  @ApiProperty({ description: 'Stop latitude' })
  py!: number;

  @ApiProperty({ description: 'Stop longitude' })
  px!: number;

  @ApiProperty({
    description: 'Lines serving this stop',
    type: [LineWithVehicles],
  })
  l!: LineWithVehicles[];
}

/**
 * Minimal stop info for line predictions
 */
export class StopWithPredictionsMinimal {
  @ApiProperty({ description: 'Stop code' })
  cp!: number;

  @ApiProperty({ description: 'Stop name' })
  np!: string;

  @ApiProperty({ description: 'Stop latitude' })
  py!: number;

  @ApiProperty({ description: 'Stop longitude' })
  px!: number;

  @ApiProperty({
    description: 'Vehicles arriving at this stop',
    type: [VehiclePosition],
  })
  vs!: VehiclePosition[];
}

/**
 * Response from arrival prediction for a stop
 */
export class StopArrivalResponse {
  @ApiProperty({ description: 'Reference time' })
  hr!: string;

  @ApiProperty({ description: 'Stop with predictions', nullable: true })
  p!: StopWithPredictions | null;
}

/**
 * Response from arrival predictions for a line
 */
export class LineArrivalResponse {
  @ApiProperty({ description: 'Reference time' })
  hr!: string;

  @ApiProperty({
    description: 'Stops with predictions',
    type: [StopWithPredictionsMinimal],
  })
  ps!: StopWithPredictionsMinimal[];
}

/**
 * Internal DTO for tracking what data to fetch
 */
export class RealtimeSubscription {
  routeShortNames: Set<string> = new Set();
  stopCodes: Set<string> = new Set();
}

/**
 * WebSocket message types
 */
export enum RealtimeMessageType {
  SUBSCRIBE_ROUTE = 'subscribe_route',
  UNSUBSCRIBE_ROUTE = 'unsubscribe_route',
  SUBSCRIBE_STOP = 'subscribe_stop',
  UNSUBSCRIBE_STOP = 'unsubscribe_stop',
  VEHICLE_POSITIONS = 'vehicle_positions',
  ARRIVAL_PREDICTIONS = 'arrival_predictions',
  ERROR = 'error',
}

/**
 * WebSocket message payload
 */
export interface RealtimeMessage {
  type: RealtimeMessageType;
  data: unknown;
}

/**
 * Canonical WebSocket payload for vehicle positions.
 */
export interface VehiclePositionUpdate {
  routeShortName: string;
  hr: string;
  l: LineWithVehicles[];
  cacheTimestamp: number;
}

/**
 * Canonical WebSocket payload for stop arrival predictions.
 */
export interface StopArrivalUpdate extends StopArrivalResponse {
  stopCode: string;
  cacheTimestamp: number;
}

/**
 * Subscription request
 */
export interface SubscriptionRequest {
  routeShortName?: string;
  stopCode?: string;
}
