// import { Resolver, ResolveField, Parent } from '@nestjs/graphql';
// import { SearchBusStop as SearchBusStop } from '../entities/search.entity';
// import { GraphQLLoaders } from '../../shared/graphql/loaders.service';
// import { Loaders } from '../../shared/graphql/loaders.decorator';

// @Resolver(() => SearchBusStop)
// export class BusStopResolver {
//   @ResolveField(() => [String])
//   async routes(
//     @Parent() stop: SearchBusStop,
//     @Loaders() loaders: GraphQLLoaders,
//   ): Promise<string[]> {
//     const stopId = stop.stop_id;

//     if (!stopId) {
//       return [];
//     }

//     // @ts-ignore
//     return loaders.routesLoader.load(stop.stop_id);
//   }
// }
