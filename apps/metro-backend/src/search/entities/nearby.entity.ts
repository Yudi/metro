import { ObjectType, Field, Float } from '@nestjs/graphql';
import {
  SearchBusRoute,
  SearchBusStop,
  SearchRailLine,
  SearchRailStation,
  SearchBikeStation,
  SearchHighlight,
} from './search.entity';

@ObjectType('NearbyResultItem')
export class NearbyResultItem {
  @Field()
  type!: string;

  @Field(() => SearchBusRoute, { nullable: true })
  busRoute?: SearchBusRoute;

  @Field(() => SearchBusStop, { nullable: true })
  busStop?: SearchBusStop;

  @Field(() => SearchRailLine, { nullable: true })
  railLine?: SearchRailLine;

  @Field(() => SearchRailStation, { nullable: true })
  railStation?: SearchRailStation;

  @Field(() => SearchBikeStation, { nullable: true })
  bikeStation?: SearchBikeStation;

  @Field(() => [SearchHighlight], { nullable: true })
  highlights?: SearchHighlight[];

  @Field(() => Float, { nullable: true })
  score?: number;
}
