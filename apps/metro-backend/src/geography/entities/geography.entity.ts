import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

@ObjectType()
export class GeometryData {
  @Field()
  type!: string;

  @Field(() => [[Number]])
  coordinates!: number[][];
}

@ObjectType()
export class BusStop {
  @Field(() => ID)
  id!: string;

  @Field()
  stopId!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Number)
  latitude!: number;

  @Field(() => Number)
  longitude!: number;

  @Field(() => GeometryData, { nullable: true })
  geometry?: GeometryData;

  @Field(() => Boolean)
  isSubwayStation!: boolean;

  @Field(() => [String], {
    nullable: true,
    description: 'Normalized agency identifiers (metro, cptm) for icon display',
  })
  agencies?: string[];

  @Field(() => [String], {
    nullable: true,
    description: 'Raw route short names (METRÔ L1-AZUL) containing line codes',
  })
  routeShortNames?: string[];
}

@ObjectType()
export class BusRoute {
  @Field(() => ID)
  id!: string;

  @Field()
  routeId!: string;

  @Field()
  shortName!: string;

  @Field()
  longName!: string;

  @Field(() => Int)
  routeType!: number;

  @Field()
  color!: string;

  @Field()
  textColor!: string;

  @Field(() => GeometryData, { nullable: true })
  geometry?: GeometryData;
}

@ObjectType()
export class BusShape {
  @Field(() => ID)
  id!: string;

  @Field()
  shapeId!: string;

  @Field(() => GeometryData)
  geometry!: GeometryData;
}

@ObjectType()
export class Trip {
  @Field(() => ID)
  id!: string;

  @Field()
  routeId!: string;

  @Field()
  serviceId!: string;

  @Field()
  tripId!: string;

  @Field()
  tripHeadsign!: string;

  @Field(() => Int)
  directionId!: number;

  @Field()
  shapeId!: string;
}

@ObjectType()
export class BoundingBox {
  @Field(() => Number)
  minLat!: number;

  @Field(() => Number)
  maxLat!: number;

  @Field(() => Number)
  minLng!: number;

  @Field(() => Number)
  maxLng!: number;
}

@ObjectType()
export class StopRoutes {
  @Field()
  stopId!: string;

  @Field(() => [String])
  routeShortNames!: string[];
}

/**
 * Merged subway station entity for vector tile click interactions.
 * Represents stations that have been merged (e.g., "Pinheiros Metro" + "Pinheiros CPTM").
 */
@ObjectType()
export class MergedSubwayStation {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'Primary stop ID used for this merged station' })
  stopId!: string;

  @Field(() => [String], {
    description: 'All stop IDs that were merged into this station',
  })
  mergedStopIds!: string[];

  @Field({ description: 'Normalized station name (without Metro/CPTM suffix)' })
  name!: string;

  @Field({ description: 'Original name of the primary station' })
  originalName!: string;

  @Field(() => Number)
  latitude!: number;

  @Field(() => Number)
  longitude!: number;

  @Field(() => [String], {
    description: 'Transit agencies serving this station (METRO, CPTM)',
  })
  agencies!: string[];

  @Field(() => [String], {
    description: 'Route short names (e.g., METRÔ L1-AZUL, CPTM L07)',
  })
  routeShortNames!: string[];
}

/**
 * Combined route data for efficient single-request loading.
 * Contains all data needed to display a route: route info, trips, shapes, and stops.
 */
@ObjectType()
export class RouteFullData {
  @Field(() => BusRoute, { description: 'The route information' })
  route!: BusRoute;

  @Field(() => [Trip], { description: 'All trips for this route' })
  trips!: Trip[];

  @Field(() => [BusShape], { description: 'All shapes for this route' })
  shapes!: BusShape[];

  @Field(() => [BusStop], { description: 'All stops along this route' })
  stops!: BusStop[];
}

/**
 * Combined data for multiple routes, typically returned when loading a stop.
 * Reduces N+1 queries when loading routes passing through a stop.
 */
@ObjectType()
export class StopFullData {
  @Field(() => BusStop, { description: 'The stop information' })
  stop!: BusStop;

  @Field(() => [RouteFullData], {
    description: 'Full data for all routes passing through this stop',
  })
  routes!: RouteFullData[];
}

@ObjectType()
export class RouteRailConnectionStation {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => [String])
  agencies!: string[];

  @Field(() => [String])
  lines!: string[];

  @Field(() => Number)
  distanceMeters!: number;

  @Field()
  nearStopId!: string;

  @Field()
  nearStopName!: string;

  @Field(() => Int)
  stopSequence!: number;
}

@ObjectType()
export class RouteRailConnectionDirection {
  @Field(() => Int)
  directionId!: number;

  @Field()
  headsign!: string;

  @Field(() => [RouteRailConnectionStation])
  stations!: RouteRailConnectionStation[];
}

@ObjectType()
export class RouteRailConnection {
  @Field()
  routeId!: string;

  @Field()
  routeShortName!: string;

  @Field()
  routeLongName!: string;

  @Field(() => [RouteRailConnectionDirection])
  directions!: RouteRailConnectionDirection[];
}
