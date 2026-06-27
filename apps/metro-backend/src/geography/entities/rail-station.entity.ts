import { ObjectType, Field, ID } from '@nestjs/graphql';
import { GeometryData } from './geography.entity';

/**
 * Rail station from the mvt_rail_stations materialized view.
 * Represents a Metro or CPTM station from authoritative GeoSampa WFS data.
 */
@ObjectType({ description: 'Rail station from GeoSampa data (Metro or CPTM)' })
export class RailStation {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'Station name' })
  name!: string;

  @Field(() => [String], {
    nullable: true,
    description: 'Line name (e.g., AZUL, RUBI, L07)',
  })
  lines!: string[];

  @Field(() => [String], {
    description: 'Transit agency (METRO or CPTM)',
  })
  agencies!: string[];

  @Field({ nullable: true, description: 'Operation status (e.g., OPERANDO)' })
  status?: string;

  @Field(() => Number, { description: 'Latitude in WGS84' })
  latitude!: number;

  @Field(() => Number, { description: 'Longitude in WGS84' })
  longitude!: number;

  @Field(() => GeometryData, { nullable: true })
  geometry?: GeometryData;
}

/**
 * Merged Rail Station from merged_rail_stations table
 * Represents merged stations at the same physical location (e.g., "Pinheiros" Metro + CPTM)
 */
@ObjectType({
  description:
    'Merged rail station combining Metro and CPTM stations at the same location',
})
export class MergedRailStation {
  @Field(() => ID)
  id!: string;

  @Field(() => Number, {
    description: 'Primary station ID used for this merged station',
  })
  primaryId!: number;

  @Field(() => [Number], {
    description: 'All station IDs that were merged into this station',
  })
  mergedIds!: number[];

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
    description: 'Line names serving this station',
  })
  lines!: string[];
}
