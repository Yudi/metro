import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

export class BikePricingPlanDto {
  @ApiProperty({ description: 'Pricing plan identifier' })
  planId!: string;

  @ApiProperty({ description: 'Human readable pricing plan name' })
  name!: string;

  @ApiProperty({ description: 'Currency code for prices', example: 'BRL' })
  currency!: string;

  @ApiProperty({ description: 'Initial price charged when renting a vehicle' })
  initialPrice!: number;

  @ApiProperty({ description: 'Formatted initial price for UI display' })
  initialPriceFormatted!: string;

  @ApiProperty({
    description:
      'Activation fee charged at the start of the ride (for EFIT bikes)',
    nullable: true,
    type: Number,
  })
  activationFee!: number | null;

  @ApiProperty({
    description: 'Formatted activation fee for UI display',
    nullable: true,
  })
  activationFeeFormatted!: string | null;

  @ApiProperty({
    description: 'Per-minute price charged after the grace period',
    nullable: true,
    type: Number,
  })
  perMinuteRate!: number | null;

  @ApiProperty({
    description: 'Formatted per-minute rate string (e.g., "R$ 0,40/min")',
    nullable: true,
  })
  perMinuteRateFormatted!: string | null;

  @ApiProperty({ description: 'Minute at which per-minute charging starts' })
  perMinuteChargingStartsAfterMinutes!: number;

  @ApiProperty({
    description: 'Maximum usage time in minutes',
    nullable: true,
    type: Number,
  })
  maxUsageMinutes!: number | null;
}

export class BikeVehicleAvailabilityDto {
  @ApiProperty({ description: 'Vehicle type identifier as provided by GBFS' })
  vehicleTypeId!: string;

  @ApiProperty({ description: 'Vehicle display name' })
  name!: string;

  @ApiProperty({ description: 'Vehicle form factor (e.g., bicycle, scooter)' })
  formFactor!: string;

  @ApiProperty({
    description: 'Vehicle propulsion type (e.g., human, electric_assist)',
  })
  propulsionType!: string;

  @ApiProperty({ description: 'Number of vehicles currently available' })
  count!: number;

  @ApiProperty({
    description: 'Maximum range in meters if provided by GBFS',
    nullable: true,
    type: Number,
  })
  maxRangeMeters!: number | null;

  @ApiProperty({
    description: 'Pricing plan details associated with this vehicle type',
    type: () => BikePricingPlanDto,
    nullable: true,
  })
  pricingPlan!: BikePricingPlanDto | null;
}

export class BikeStationDto {
  @ApiProperty({ description: 'Unique station identifier from the GBFS feed' })
  stationId!: string;

  @ApiProperty({ description: 'Station display name' })
  name!: string;

  @ApiProperty({ description: 'Station latitude in WGS84' })
  latitude!: number;

  @ApiProperty({ description: 'Station longitude in WGS84' })
  longitude!: number;

  @ApiProperty({ description: 'Station street address', required: false })
  address?: string | null;

  @ApiProperty({
    description: 'Total parking capacity of the station (docks)',
    nullable: true,
    type: Number,
  })
  capacity!: number | null;

  @ApiProperty({ description: 'Available bikes ready to rent' })
  numBikesAvailable!: number;

  @ApiProperty({ description: 'Unavailable bikes (maintenance/disabled)' })
  numBikesDisabled!: number;

  @ApiProperty({ description: 'Available docks to return bikes' })
  numDocksAvailable!: number;

  @ApiProperty({ description: 'Unavailable docks (maintenance/disabled)' })
  numDocksDisabled!: number;

  @ApiProperty({ description: 'Is the station installed in the field' })
  isInstalled!: boolean;

  @ApiProperty({ description: 'Is the station currently renting bikes' })
  isRenting!: boolean;

  @ApiProperty({ description: 'Is the station accepting bike returns' })
  isReturning!: boolean;

  @ApiProperty({
    description: 'Unix timestamp (seconds) when the station last reported',
  })
  lastReported!: number;

  @ApiProperty({ description: 'Station operating status (e.g., IN_SERVICE)' })
  status!: string;

  @ApiProperty({
    description: 'ISO timestamp derived from lastReported',
  })
  lastReportedIso!: string;

  @ApiProperty({
    description: 'Computed fallback capacity when GBFS provides null values',
  })
  effectiveCapacity!: number;

  @ApiProperty({
    description: 'Total number of electric-assist bikes currently available',
  })
  electricBikesAvailable!: number;

  @ApiProperty({
    description: 'Does the station currently have any electric-assist bikes',
  })
  hasElectricBikesAvailable!: boolean;

  @ApiProperty({
    description: 'Vehicle availability grouped by vehicle type',
    type: [BikeVehicleAvailabilityDto],
  })
  vehicleAvailability!: BikeVehicleAvailabilityDto[];
}

export class BikeStationsPayloadDto {
  @ApiProperty({ description: 'Unix timestamp (seconds) from GBFS feed' })
  lastUpdated!: number;

  @ApiProperty({ description: 'Time-to-live suggested by feed in seconds' })
  ttl!: number;

  @ApiProperty({ description: 'List of bike stations', type: [BikeStationDto] })
  stations!: BikeStationDto[];

  @ApiProperty({ description: 'Timestamp when backend fetched this data' })
  fetchedAt!: number;
}

@ObjectType()
export class BikeStationSummaryDto {
  @ApiProperty({ description: 'Unique station identifier from the GBFS feed' })
  @Field()
  stationId!: string;

  @ApiProperty({ description: 'Station latitude in WGS84' })
  @Field(() => Float)
  latitude!: number;

  @ApiProperty({ description: 'Station longitude in WGS84' })
  @Field(() => Float)
  longitude!: number;

  @ApiProperty({
    description: 'Total parking capacity of the station (docks)',
    nullable: true,
    type: Number,
  })
  @Field(() => Int, { nullable: true })
  capacity!: number | null;

  @ApiProperty({
    description: 'Computed fallback capacity when GBFS provides null values',
  })
  @Field(() => Int)
  effectiveCapacity!: number;

  @ApiProperty({ description: 'Available bikes ready to rent' })
  @Field(() => Int)
  numBikesAvailable!: number;

  @ApiProperty({
    description: 'Total number of electric-assist bikes currently available',
  })
  @Field(() => Int)
  electricBikesAvailable!: number;
}

@ObjectType()
export class BikeStationsSummaryPayloadDto {
  @ApiProperty({ description: 'Unix timestamp (seconds) from GBFS feed' })
  @Field(() => Int)
  lastUpdated!: number;

  @ApiProperty({ description: 'Time-to-live suggested by feed in seconds' })
  @Field(() => Int)
  ttl!: number;

  @ApiProperty({
    description: 'List of bike stations',
    type: [BikeStationSummaryDto],
  })
  @Field(() => [BikeStationSummaryDto])
  stations!: BikeStationSummaryDto[];

  @ApiProperty({ description: 'Timestamp when backend fetched this data' })
  @Field(() => Float, {
    description:
      'Unix timestamp in milliseconds when backend fetched this data',
  })
  fetchedAt!: number;
}

export class BikeStationDetailsRequestDto {
  @ApiProperty({ description: 'Station id to request details for' })
  stationId!: string;
}

/**
 * Delta update for a single station - only includes changed dynamic fields.
 * `stationId` is always present to identify the station.
 */
export class BikeStationDeltaDto {
  @ApiProperty({ description: 'Unique station identifier from the GBFS feed' })
  stationId!: string;

  @ApiProperty({
    description: 'Available bikes ready to rent (if changed)',
    required: false,
  })
  numBikesAvailable?: number;

  @ApiProperty({
    description:
      'Total number of electric-assist bikes currently available (if changed)',
    required: false,
  })
  electricBikesAvailable?: number;

  @ApiProperty({
    description:
      'Computed fallback capacity when GBFS provides null values (if changed)',
    required: false,
  })
  effectiveCapacity?: number;

  @ApiProperty({
    description: 'Total parking capacity of the station (if changed)',
    nullable: true,
    required: false,
  })
  capacity?: number | null;
}

/**
 * Unified payload for bike station updates.
 * Uses a type discriminator to distinguish between full and delta updates.
 * - 'full': Contains all stations (sent on initial connection)
 * - 'delta': Contains only changes since last update (sent on subsequent broadcasts)
 */
export class BikeStationsUpdatePayloadDto {
  @ApiProperty({
    description: 'Update type: full for initial load, delta for incremental',
    enum: ['full', 'delta'],
  })
  type!: 'full' | 'delta';

  @ApiProperty({ description: 'Unix timestamp (seconds) from GBFS feed' })
  lastUpdated!: number;

  @ApiProperty({ description: 'Time-to-live suggested by feed in seconds' })
  ttl!: number;

  @ApiProperty({ description: 'Timestamp when backend fetched this data' })
  fetchedAt!: number;

  // Full payload fields (present when type === 'full')
  @ApiProperty({
    description: 'All stations (present when type is full)',
    type: [BikeStationSummaryDto],
    required: false,
  })
  stations?: BikeStationSummaryDto[];

  // Delta payload fields (present when type === 'delta')
  @ApiProperty({
    description: 'Stations that have been added (present when type is delta)',
    type: [BikeStationSummaryDto],
    required: false,
  })
  added?: BikeStationSummaryDto[];

  @ApiProperty({
    description:
      'Stations with changed dynamic fields (present when type is delta)',
    type: [BikeStationDeltaDto],
    required: false,
  })
  updated?: BikeStationDeltaDto[];

  @ApiProperty({
    description:
      'Station IDs that have been removed (present when type is delta)',
    type: [String],
    required: false,
  })
  removed?: string[];
}

export class BikeStationDetailsEventStationDto extends OmitType(
  BikeStationDto,
  [
    'address',
    'lastReported',
    'lastReportedIso',
    'status',
    'effectiveCapacity',
  ] as const,
) {
  @ApiProperty({ description: 'Station street address', nullable: true })
  address!: string | null;

  @ApiProperty({
    description: 'Unix timestamp (seconds) when the station last reported',
    nullable: true,
    type: Number,
  })
  lastReported!: number | null;

  @ApiProperty({
    description: 'ISO timestamp derived from lastReported',
    nullable: true,
  })
  lastReportedIso!: string | null;
}

export class BikeStationDetailsEventPayloadDto {
  @ApiProperty({ description: 'Station id requested' })
  stationId!: string;

  @ApiProperty({
    description: 'Station details if found',
    nullable: true,
    type: () => BikeStationDetailsEventStationDto,
  })
  station!: BikeStationDetailsEventStationDto | null;

  @ApiProperty({
    description: 'Unix timestamp (seconds) from GBFS feed',
    nullable: true,
    type: Number,
  })
  lastUpdated!: number | null;

  @ApiProperty({
    description: 'Timestamp when backend fetched this data',
    nullable: true,
    type: Number,
  })
  fetchedAt!: number | null;
}
