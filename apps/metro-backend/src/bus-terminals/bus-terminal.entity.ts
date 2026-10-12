import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('BusTerminalSummary')
export class BusTerminalSummaryEntity {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => [String]) aliases!: string[];
  @Field(() => Float) latitude!: number;
  @Field(() => Float) longitude!: number;
  @Field(() => [String]) stopIds!: string[];
  @Field(() => [String]) platformCodes!: string[];
}

@ObjectType('BusTerminalStop')
export class BusTerminalStopEntity {
  @Field() stopId!: string;
  @Field() name!: string;
  @Field({ nullable: true }) description?: string;
  @Field(() => Float) latitude!: number;
  @Field(() => Float) longitude!: number;
  @Field() sourceAgency!: string;
  @Field() sourceId!: string;
  @Field({ nullable: true }) platformCode?: string;
  @Field(() => [String]) mergedStopIds!: string[];
  @Field(() => Boolean) boardingAllowed!: boolean;
}

@ObjectType('BusTerminalRoute')
export class BusTerminalRouteEntity {
  @Field() routeId!: string;
  @Field() shortName!: string;
  @Field() longName!: string;
  @Field() sourceAgency!: string;
  @Field() sourceId!: string;
  @Field(() => Boolean) supportsRealtime!: boolean;
  @Field({ nullable: true }) color?: string;
  @Field({ nullable: true }) textColor?: string;
  @Field({ nullable: true }) destination?: string;
  @Field(() => Int, { nullable: true }) directionId?: number;
  @Field({ nullable: true }) favoriteCode?: string;
  @Field(() => Boolean, { nullable: true }) isCircular?: boolean;
  @Field(() => [String]) stopIds!: string[];
}

@ObjectType('BusTerminalDetail')
export class BusTerminalDetailEntity extends BusTerminalSummaryEntity {
  @Field(() => [BusTerminalStopEntity]) stops!: BusTerminalStopEntity[];
  @Field(() => [BusTerminalRouteEntity]) routes!: BusTerminalRouteEntity[];
}
