import { Field, ObjectType } from '@nestjs/graphql';
import type { SpecialRailService as SpecialRailServiceData } from '@metro/shared/utils';

@ObjectType({ description: 'Station served by a runtime-discovered special service' })
export class SpecialRailServiceStation {
  @Field()
  stationCode!: string;

  @Field()
  name!: string;

  @Field()
  latitude!: number;

  @Field()
  longitude!: number;
}

@ObjectType({
  description: 'Special rail service currently available from the upstream provider',
})
export class SpecialRailService implements SpecialRailServiceData {
  @Field()
  code!: 'EA' | '10X';

  @Field()
  name!: string;

  @Field()
  colorHex!: string;

  @Field()
  textColorHex!: string;

  @Field(() => [SpecialRailServiceStation])
  stations!: SpecialRailServiceStation[];
}
