import { InputType, Field } from '@nestjs/graphql';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

@InputType()
export class BoundingBoxInput {
  @Field(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  minLat!: number;

  @Field(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  maxLat!: number;

  @Field(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  minLng!: number;

  @Field(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  maxLng!: number;
}

@InputType()
export class StopSearchInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  searchTerm?: string;

  @Field(() => BoundingBoxInput, { nullable: true })
  @IsOptional()
  bounds?: BoundingBoxInput;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(25_000)
  limit?: number;
}
