import {
  createUnionType,
  ObjectType,
  Field,
  ID,
  Int,
  Float,
  InterfaceType,
} from '@nestjs/graphql';

/**
 * Shared highlight snippet type
 */
@ObjectType()
export class SearchHighlight {
  @Field() field!: string;
  @Field() snippet!: string;
}

/**
 * Shared interface implemented by every concrete search result type.
 * Includes common metadata (score / highlights).
 */
@InterfaceType()
export abstract class SearchResult {
  @Field(() => ID)
  id!: string;

  @Field(() => Float, { nullable: true })
  score?: number;

  @Field(() => [SearchHighlight], { nullable: true })
  highlights?: SearchHighlight[] | null;
}

/**
 * Bus route
 */
@ObjectType({ implements: () => SearchResult })
export class SearchBusRoute implements SearchResult {
  // interface fields
  @Field(() => ID) id!: string;
  @Field(() => Float, { nullable: true }) score?: number;
  @Field(() => [SearchHighlight], { nullable: true }) highlights?:
    | SearchHighlight[]
    | null;

  // concrete fields
  @Field() type!: 'busRoute';
  @Field() route_id!: string;
  @Field() route_short_name!: string;
  @Field() route_long_name!: string;
  @Field(() => Int) route_type!: number;
  @Field({ nullable: true }) route_color?: string;
  @Field({ nullable: true }) route_text_color?: string;
}

/**
 * Bus stop
 *
 * Note: `routes` is full objects (optional) while `routeIds` is lightweight ID list.
 * You can implement a ResolveField('routes') in the resolver to load full objects on demand.
 */
@ObjectType({ implements: () => SearchResult })
export class SearchBusStop implements SearchResult {
  // interface fields
  @Field(() => ID) id!: string;
  @Field(() => Float, { nullable: true }) score?: number;
  @Field(() => [SearchHighlight], { nullable: true }) highlights?:
    | SearchHighlight[]
    | null;

  // concrete fields
  @Field() type!: 'busStop';
  @Field() stop_id!: string;
  @Field() stop_name!: string;
  @Field({ nullable: true }) stop_desc?: string;

  @Field(() => Float) stop_lat!: number;
  @Field(() => Float) stop_lon!: number;

  // full route objects (optional — resolved via ResolveField)
  @Field(() => [SearchBusRoute], {
    description: 'Resolved route objects (use ResolveField to populate)',
  })
  routes?: SearchBusRoute[];
}

/**
 * Rail line
 */
@ObjectType({ implements: () => SearchResult })
export class SearchRailLine implements SearchResult {
  // interface fields
  @Field(() => ID) id!: string;
  @Field(() => Float, { nullable: true }) score?: number;
  @Field(() => [SearchHighlight], { nullable: true }) highlights?:
    | SearchHighlight[]
    | null;

  // concrete fields
  @Field() type!: 'railLine';
  @Field() line_code!: string;
  @Field() line_fullname!: string;
  @Field() agency!: string;
}

/**
 * Rail station
 */
@ObjectType({ implements: () => SearchResult })
export class SearchRailStation implements SearchResult {
  // interface fields
  @Field(() => ID) id!: string;
  @Field(() => Float, { nullable: true }) score?: number;
  @Field(() => [SearchHighlight], { nullable: true }) highlights?:
    | SearchHighlight[]
    | null;

  // concrete fields
  @Field() type!: 'railStation';
  @Field() station_code!: string;
  @Field() station_name!: string;

  // always return an array from resolver (default to [])
  @Field(() => [String], { nullable: true })
  station_aliases?: string[] | null = [];

  @Field(() => Float, { nullable: true }) latitude?: number | null;
  @Field(() => Float, { nullable: true }) longitude?: number | null;
}

/**
 * Bike station
 */
@ObjectType({ implements: () => SearchResult })
export class SearchBikeStation implements SearchResult {
  // interface fields
  @Field(() => ID) id!: string;
  @Field(() => Float, { nullable: true }) score?: number;
  @Field(() => [SearchHighlight], { nullable: true }) highlights?:
    | SearchHighlight[]
    | null;

  // concrete fields
  @Field() type!: 'bikeStation';
  @Field() station_id!: string;
  @Field() station_name!: string;
  @Field(() => Float) latitude!: number;
  @Field(() => Float) longitude!: number;
}

/**
 * Union of all concrete search result types.
 *
 * Note: we provide a resolveType function so you may return plain objects from resolvers.
 */
export const SearchResultUnion = createUnionType({
  name: 'SearchResultUnion', // GraphQL type name
  types: () =>
    [
      SearchBusRoute,
      SearchBusStop,
      SearchRailLine,
      SearchRailStation,
      SearchBikeStation,
    ] as const,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolveType(value: any) {
    // expect your resolver objects to contain a `type` discriminator
    if (!value || typeof value !== 'object') return null;

    switch (value.type) {
      case 'busRoute':
        return SearchBusRoute;
      case 'busStop':
        return SearchBusStop;
      case 'railLine':
        return SearchRailLine;
      case 'railStation':
        return SearchRailStation;
      case 'bikeStation':
        return SearchBikeStation;
      default:
        return null;
    }
  },
});
