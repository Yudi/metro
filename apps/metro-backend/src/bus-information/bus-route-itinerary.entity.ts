import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { BusRoute } from '../geography/entities/geography.entity';

@ObjectType()
export class BusRouteItineraryStop {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => Int)
  sequence!: number;

  @Field(() => Number)
  latitude!: number;

  @Field(() => Number)
  longitude!: number;

  @Field(() => String, { nullable: true })
  platformCode!: string | null;

  @Field(() => String, { nullable: true })
  arrivalTime!: string | null;

  @Field(() => String, { nullable: true })
  departureTime!: string | null;
}

@ObjectType()
export class BusRouteItineraryFrequencyWindow {
  @Field()
  startTime!: string;

  @Field()
  endTime!: string;

  @Field(() => Int)
  headwaySeconds!: number;

  @Field(() => Boolean)
  exactTimes!: boolean;
}

@ObjectType()
export class BusRouteItineraryPattern {
  @Field(() => ID)
  id!: string;

  @Field(() => Int, { nullable: true })
  directionId!: number | null;

  @Field()
  headsign!: string;

  @Field(() => String, { nullable: true })
  shapeId!: string | null;

  @Field(() => [BusRouteItineraryStop])
  stops!: BusRouteItineraryStop[];

  /** Exact origin departures from trips without a frequency template. */
  @Field(() => [String])
  departures!: string[];

  /** GTFS frequency templates measured at the first stop of the pattern. */
  @Field(() => [BusRouteItineraryFrequencyWindow])
  intervals!: BusRouteItineraryFrequencyWindow[];

  @Field(() => Int, { nullable: true })
  durationMinutes!: number | null;
}

/** Route metadata plus the agency identity published by agency.txt. */
@ObjectType()
export class BusRouteItineraryRoute extends BusRoute {
  @Field(() => String, { nullable: true })
  operatorId!: string | null;

  @Field(() => String, { nullable: true })
  operatorName!: string | null;

  @Field(() => String, { nullable: true })
  operatorUrl!: string | null;

  @Field(() => String, { nullable: true })
  operatorPhone!: string | null;
}

@ObjectType()
export class BusRouteItinerary {
  @Field()
  status!: string;

  @Field()
  serviceDate!: string;

  @Field(() => String, { nullable: true })
  operatorName!: string | null;

  @Field(() => BusRouteItineraryRoute, { nullable: true })
  route!: BusRouteItineraryRoute | null;

  @Field(() => [BusRouteItineraryPattern])
  patterns!: BusRouteItineraryPattern[];
}

export interface ItineraryRouteRow {
  id: string;
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
  source_agency: string;
  source_id: string;
  fares: unknown;
  operator_id: string | null;
  operator_name: string | null;
  operator_url: string | null;
  operator_phone: string | null;
}

export interface ItineraryTripPatternRow {
  tripId: string;
  serviceId: string;
  headsign: string;
  directionId: number | null;
  shapeId: string | null;
  stopIds: string[];
  stopSequences: number[];
  firstDeparture: string | null;
  lastArrival: string | null;
}

export interface ItineraryStopRow {
  tripId: string;
  id: string;
  name: string;
  description: string | null;
  platformCode: string | null;
  sequence: number;
  latitude: number;
  longitude: number;
  arrivalTime: string | null;
  departureTime: string | null;
}

export interface ItineraryFrequencyRow {
  tripId: string;
  startTime: string;
  endTime: string;
  headwaySeconds: number;
}
