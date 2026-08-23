import { Field, InputType, Int } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { HistoricalIncidentEventType } from '../entities/historical-data.entity';

@InputType()
export class HistoricalDataFilterInput {
  @Field(() => Date, {
    nullable: true,
    description: 'Include rows observed at or after this timestamp',
  })
  @IsOptional()
  @IsDate()
  from?: Date;

  @Field(() => Date, {
    nullable: true,
    description: 'Include rows observed at or before this timestamp',
  })
  @IsOptional()
  @IsDate()
  to?: Date;

  @Field(() => [HistoricalIncidentEventType], {
    nullable: true,
    description: 'Incident event types to include',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsEnum(HistoricalIncidentEventType, { each: true })
  eventTypes?: HistoricalIncidentEventType[];

  @Field(() => [String], {
    nullable: true,
    description: 'Logical sources to include, such as rail_status',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  sources?: string[];

  @Field(() => [String], {
    nullable: true,
    description: 'Rail line codes to include, such as L9',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  lineCodes?: string[];

  @Field(() => [Int], {
    nullable: true,
    description: 'Numeric rail line codes to include',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsInt({ each: true })
  lineNumbers?: number[];

  @Field(() => [String], {
    nullable: true,
    description: 'Station codes to include for headway snapshots',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  stationCodes?: string[];

  @Field(() => [String], {
    nullable: true,
    description: 'Station names to include for headway snapshots',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  stationNames?: string[];

  @Field(() => [String], {
    nullable: true,
    description: 'Directions to include for headway snapshots',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  directions?: string[];

  @Field(() => [String], {
    nullable: true,
    description: 'Rail status codes to include for incident events',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  statusCodes?: string[];

  @Field(() => Boolean, {
    nullable: true,
    description: 'Whether incident events should be included',
  })
  @IsOptional()
  @IsBoolean()
  includeIncidents?: boolean;

  @Field(() => Boolean, {
    nullable: true,
    description: 'Whether headway snapshots should be included',
  })
  @IsOptional()
  @IsBoolean()
  includeHeadway?: boolean;
}
