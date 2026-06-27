import DataLoader from 'dataloader';
import { GeographyServiceOptimized } from '../../geography/services/geography-optimized.service';
import { SearchBusRoute } from '../entities/search.entity';

export function createRoutesLoader(
  geographyService: GeographyServiceOptimized,
) {
  return new DataLoader<string, SearchBusRoute[]>(async (stopIds) => {
    const routesMap = await geographyService.getRoutesForMultipleStops(
      stopIds as string[],
    );

    return stopIds.map((stopId) => {
      const routes = routesMap.get(stopId) ?? [];
      return routes.map(
        (route) =>
          ({
            type: 'busRoute' as const,
            id: route.id,
            route_id: route.routeId,
            route_short_name: route.shortName ?? '',
            route_long_name: route.longName ?? '',
            route_type: route.routeType,
            route_color: route.color ?? '',
            route_text_color: route.textColor ?? '',
          }) as SearchBusRoute,
      );
    });
  });
}
