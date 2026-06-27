import { Field, Float, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Train arrival status enum
 */
export enum TrainStatus {
  /** Train is in transit */
  MOVING = 'deslocamento',
  /** Train is at platform */
  AT_PLATFORM = 'plataforma',
}

registerEnumType(TrainStatus, {
  name: 'TrainStatus',
  description: 'Current status of the train',
});

/**
 * Represents next train arrival information
 */
@ObjectType({ description: 'Next train arrival information' })
export class NextTrainArrival {
  @Field(() => String, { description: 'Line code (e.g., L8, L9)' })
  @ApiProperty({ example: 'L9', description: 'Line code' })
  lineCode!: string;

  @Field(() => String, {
    description: 'Station code where train is arriving',
  })
  @ApiProperty({ example: 'HBR', description: 'Station code' })
  stationCode!: string;

  @Field(() => String, { description: 'Destination station code' })
  @ApiProperty({
    example: 'VAG',
    description: 'Destination station code (terminal)',
  })
  destinationCode!: string;

  @Field(() => String, { description: 'Destination station name' })
  @ApiProperty({ example: 'Varginha', description: 'Destination station name' })
  destinationName!: string;

  @Field(() => String, {
    description: 'Current station code where the train is',
  })
  @ApiProperty({
    example: 'JAG',
    description: 'Station code where train is currently',
  })
  trainCurrentStationCode!: string;

  @Field(() => String, {
    description: 'Current station name where the train is',
  })
  @ApiProperty({
    example: 'Villa Lobos–Jaguaré',
    description: 'Station name where train is currently',
  })
  trainCurrentStationName!: string;

  @Field(() => String, { description: 'Predicted arrival time (HH:MM format)' })
  @ApiProperty({ example: '21:04', description: 'Predicted arrival time' })
  arrivalTime!: string;

  @Field(() => Boolean, { description: 'Whether train is at the platform' })
  @ApiProperty({ example: false, description: 'Train is at the platform' })
  isAtPlatform!: boolean | null;

  @Field(() => String, { description: 'Last update timestamp from source' })
  @ApiProperty({
    example: '2026-02-02 20:58:54.178266',
    description: 'Source update timestamp',
  })
  updatedAt!: string;
}

/**
 * Headway (time between trains) for a single direction
 */
@ObjectType({ description: 'Average headway for a direction' })
export class DirectionHeadwayEntity {
  @Field(() => String, { description: 'Terminal/destination name' })
  direction!: string;

  @Field(() => Float, { description: 'Average headway in seconds' })
  averageSeconds!: number;

  @Field(() => Int, { description: 'Number of interval samples used' })
  sampleCount!: number;

  @Field(() => String, {
    nullable: true,
    description: 'Time-of-day bucket id (e.g. am_peak, evening)',
  })
  bucket?: string;

  @Field(() => String, {
    nullable: true,
    description: 'Display label for the bucket (Portuguese)',
  })
  bucketLabel?: string;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'True when showing data from a previous bucket (insufficient current data)',
  })
  isFallback?: boolean;
}

/**
 * Container for next train arrivals at a station
 */
@ObjectType({ description: 'Next trains arriving at a station' })
export class StationNextTrains {
  @Field(() => String, { description: 'Station code' })
  stationCode!: string;

  @Field(() => String, { description: 'Station name' })
  stationName!: string;

  @Field(() => String, { description: 'Line code (L4, L8, or L9)' })
  lineCode!: string;

  @Field(() => [NextTrainArrival], { description: 'List of arriving trains' })
  trains!: NextTrainArrival[];

  @Field(() => Boolean, {
    nullable: true,
    description:
      'Whether operation is closed and no station arrival data remains relevant',
  })
  operationClosed?: boolean;

  @Field(() => Date, {
    nullable: true,
    description: 'When the data was last fetched',
  })
  fetchedAt?: Date;

  @Field(() => [DirectionHeadwayEntity], {
    nullable: true,
    description: 'Average headway per direction (if available)',
  })
  headway?: DirectionHeadwayEntity[];
}

/**
 * CPTM station information from the shared public station list.
 */
@ObjectType({ description: 'CPTM station from the public station list' })
export class CptmStationInfo {
  @Field(() => String, { description: 'Public station code' })
  @ApiProperty({ example: 'LUZ', description: 'Public station code' })
  stationCode!: string;

  @Field(() => String, { description: 'Station name' })
  @ApiProperty({ example: 'Brás', description: 'Station name' })
  stationName!: string;

  @Field(() => String, { description: 'Line code (L10, L11, L12, L13)' })
  @ApiProperty({ example: 'L10', description: 'CPTM Line code' })
  lineCode!: string;

  @Field(() => Number, { description: 'Latitude' })
  @ApiProperty({ description: 'Latitude' })
  latitude!: number;

  @Field(() => Number, { description: 'Longitude' })
  @ApiProperty({ description: 'Longitude' })
  longitude!: number;
}
