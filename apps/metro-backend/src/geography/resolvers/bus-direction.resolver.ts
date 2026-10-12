import { Args, Context, ID, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { GeometryData } from '../entities/geography.entity';
import { BusRouteDirection } from '../entities/bus-route-direction.entity';
import { BusDirectionService } from '../services/bus-direction.service';
import { validateIdentifier, validateIdentifiers } from './geography-resolver.utils';
import { GraphQLLoaders } from '../../common/graphql/loaders.service';

interface BusDirectionGraphQLContext {
  loaders: Pick<GraphQLLoaders, 'busDirectionGeometryLoader'>;
}

@Resolver(() => BusRouteDirection)
export class BusDirectionResolver {
  constructor(private readonly directions: BusDirectionService) {}

  @Query(() => [BusRouteDirection])
  busStopDirections(@Args('stopId', { type: () => ID }) stopId: string): Promise<BusRouteDirection[]> {
    return this.directions.forStop(validateIdentifier(stopId, 'stopId'));
  }

  @ResolveField(() => GeometryData, { nullable: true })
  geometry(
    @Parent() direction: BusRouteDirection,
    @Context() context: BusDirectionGraphQLContext,
  ): Promise<GeometryData | null> {
    return context.loaders.busDirectionGeometryLoader.load(direction.shapeIds);
  }

  @Query(() => [BusRouteDirection], { description: 'Bus services presented individually by destination' })
  busRouteDirections(
    @Args('ids', { type: () => [ID] }) ids: string[],
    @Args('stopId', { type: () => ID, nullable: true }) stopId?: string,
  ): Promise<BusRouteDirection[]> {
    return this.directions.forRoutes(
      validateIdentifiers(ids, 'ids'),
      stopId === undefined ? undefined : validateIdentifier(stopId, 'stopId'),
    );
  }

  @Query(() => [BusRouteDirection], { description: 'Resolve stable direction favorites and expand legacy line favorites' })
  favoriteBusDirections(
    @Args('codes', { type: () => [String] }) codes: string[],
  ): Promise<BusRouteDirection[]> {
    return this.directions.forFavorites(validateIdentifiers(codes, 'codes'));
  }
}
