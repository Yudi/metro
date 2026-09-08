import { Field, Int, ObjectType } from '@nestjs/graphql';
import { BusRoute } from '../geography/entities/geography.entity';

@ObjectType()
export class BusPublishedStreet {
  @Field()
  name!: string;

  @Field()
  number!: string;

  @Field(() => [String])
  notices!: string[];
}

@ObjectType()
export class BusPublishedTravelTime {
  @Field()
  period!: string;

  @Field(() => Int)
  minutes!: number;
}

@ObjectType()
export class BusPublishedDirection {
  @Field()
  id!: string;

  @Field()
  headsign!: string;

  @Field(() => [String])
  departures!: string[];

  @Field(() => [BusPublishedStreet])
  streets!: BusPublishedStreet[];

  @Field(() => [BusPublishedTravelTime])
  travelTimes!: BusPublishedTravelTime[];

  @Field(() => String, { nullable: true })
  startTime!: string | null;

  @Field(() => String, { nullable: true })
  endTime!: string | null;
}

@ObjectType()
export class BusPublishedServiceDay {
  @Field()
  kind!: string;

  @Field(() => [BusPublishedDirection])
  directions!: BusPublishedDirection[];
}

@ObjectType()
export class BusPublishedRouteInformation {
  @Field()
  status!: string;

  @Field()
  routeCode!: string;

  @Field(() => String, { nullable: true })
  lastUpdated!: string | null;

  @Field(() => String, { nullable: true })
  operatorName!: string | null;

  @Field(() => String, { nullable: true })
  consortiumName!: string | null;

  @Field(() => [BusPublishedServiceDay])
  days!: BusPublishedServiceDay[];

  @Field(() => BusRoute, { nullable: true })
  route!: BusRoute | null;
}
