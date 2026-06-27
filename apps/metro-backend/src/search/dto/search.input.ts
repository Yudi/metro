import { InputType, Field, Int, Float } from '@nestjs/graphql';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  SearchTypes,
  SearchTypesEnum,
  StopsAndStations,
  StopsAndStationsValues,
} from '@metro/shared/utils';

import { registerEnumType } from '@nestjs/graphql';

registerEnumType(SearchTypesEnum, { name: 'SearchType' });

@InputType()
export class SearchInput {
  @Field()
  @IsString()
  query!: string;

  @Field(() => SearchTypesEnum, { nullable: true })
  @IsOptional()
  @IsIn(SearchTypes)
  type?: SearchTypes;

  @Field(() => Int, { nullable: true, defaultValue: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@InputType()
export class SearchFiltersInput {
  @Field()
  @IsString()
  query!: string;

  @Field(() => Boolean, { nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  includeBusRoutes?: boolean;

  @Field(() => Boolean, { nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  includeBusStops?: boolean;

  @Field(() => Boolean, { nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  includeRailLines?: boolean;

  @Field(() => Boolean, { nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  includeRailStations?: boolean;

  @Field(() => Boolean, { nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  includeBikeStations?: boolean;

  @Field(() => Int, { nullable: true, defaultValue: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@InputType()
export class NearbyStopsInput {
  @Field(() => Float)
  @IsLatitude()
  latitude!: number;

  @Field(() => Float)
  @IsLongitude()
  longitude!: number;

  @Field(() => Int, { nullable: true, defaultValue: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50_000)
  radiusMeters?: number;

  @Field(() => SearchTypesEnum, { nullable: true })
  @IsOptional()
  @IsIn(StopsAndStationsValues)
  type?: StopsAndStations;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
