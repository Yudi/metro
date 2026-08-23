import { InputType, Field } from '@nestjs/graphql';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'orderedBoundingBox', async: false })
class OrderedBoundingBoxConstraint implements ValidatorConstraintInterface {
  validate(_value: number, args: ValidationArguments): boolean {
    const bounds = args.object as BoundingBoxInput;
    return args.property === 'maxLat'
      ? bounds.minLat <= bounds.maxLat
      : bounds.minLng <= bounds.maxLng;
  }

  defaultMessage(args: ValidationArguments): string {
    return args.property === 'maxLat'
      ? 'minLat must be less than or equal to maxLat'
      : 'minLng must be less than or equal to maxLng; antimeridian-crossing boxes are not supported';
  }
}

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
  @Validate(OrderedBoundingBoxConstraint)
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
  @Validate(OrderedBoundingBoxConstraint)
  maxLng!: number;
}

@InputType()
export class StopSearchInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
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
