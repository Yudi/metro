import { Field, Int, ObjectType } from '@nestjs/graphql';
import { BusRoute } from './geography.entity';

@ObjectType()
export class BusRouteDirection extends BusRoute {
  @Field()
  favoriteCode!: string;

  @Field({ description: 'The lookup code, including the legacy whole-line code during expansion' })
  requestedCode!: string;

  @Field()
  destination!: string;

  @Field(() => Int)
  directionId!: number;

  originLatitude!: number;
  originLongitude!: number;
  destinationLatitude!: number;
  destinationLongitude!: number;
  viaLatitude!: number;
  viaLongitude!: number;
  shapeIds!: string[];
}
