import { ObjectType, Field, Int } from '@nestjs/graphql';
import type { RailStatusCode, RailStatusColor } from '@metro/shared/utils';

@ObjectType({ description: 'Next departure data for a special rail service' })
export class SpecialRailDeparture {
  @Field({ description: 'Departure origin label' })
  label!: string;

  @Field({ description: 'Departure time in HH:mm format' })
  time!: string;
}

@ObjectType({
  description: 'Related rail line issue affecting a special service',
})
export class SpecialRailIssue {
  @Field(() => Int, { description: 'Regular rail line code' })
  code!: number;

  @Field({ description: 'Regular rail line display name' })
  line!: string;

  @Field({ description: 'Issue description from the regular line status' })
  description!: string;
}

@ObjectType({ description: 'Special rail service status item' })
export class SpecialRailLine {
  @Field(() => String, {
    description: 'Special service code (EA, 10X, GRU)',
  })
  code!: string;

  @Field(() => String, { description: 'Service color name' })
  colorName!: string;

  @Field(() => String, { description: 'Service color in hex format' })
  colorHex!: string;

  @Field(() => String, { description: 'Service display name' })
  line!: string;

  @Field(() => String, { description: 'Current operation status code' })
  statusCode!: RailStatusCode;

  @Field(() => String, { description: 'Human-readable status label' })
  statusLabel!: string;

  @Field(() => String, { description: 'Status indicator color' })
  statusColor!: RailStatusColor;

  @Field(() => [SpecialRailDeparture], {
    description: 'Next departures for services with fixed schedules',
  })
  nextDepartures!: SpecialRailDeparture[];

  @Field(() => [SpecialRailIssue], {
    description: 'Detected issue descriptions affecting this service',
  })
  issues!: SpecialRailIssue[];
}
