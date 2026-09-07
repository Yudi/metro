import {
  getBusAgencyOrder,
  mapTypesenseStopToTransitSearchResult,
  normalizeStationName,
  shouldMergeStations,
  toTitleCase,
} from '@metro/shared/utils';
import type {
  TypesenseRoute,
  TypesenseSearchResult,
  TypesenseStop,
} from '../../../search/typesense-search.service';
import {
  SearchResult,
  SearchResultType,
} from './search-result-card/search-result-card.component';

export function mapTypesenseResult(
  result: TypesenseSearchResult,
): SearchResult | null {
  const document = result.document;
  if (result.type === 'route') {
    const route = document as TypesenseRoute;
    const isRailLine = route.source === 'rail';
    return {
      id: route.id,
      name: isRailLine ? route.route_long_name : route.route_short_name,
      type: 'route' as SearchResultType,
      description: isRailLine ? route.route_short_name : route.route_long_name,
      routeData: route,
      latitude: undefined,
      longitude: undefined,
      source: route.source || 'gtfs',
    };
  }

  const stopResult = mapTypesenseStopToTransitSearchResult(
    document as TypesenseStop,
  );
  return stopResult
    ? { ...stopResult, type: stopResult.type as SearchResultType }
    : null;
}

export function mapNearbyStop(stop: TypesenseStop): SearchResult | null {
  const stopResult = mapTypesenseStopToTransitSearchResult(stop);
  return stopResult
    ? { ...stopResult, type: stopResult.type as SearchResultType }
    : null;
}

export function orderSearchResults(results: SearchResult[]): SearchResult[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      if (a.result.type !== 'route' || b.result.type !== 'route') {
        return a.index - b.index;
      }

      const aRoute = a.result.routeData;
      const bRoute = b.result.routeData;
      if (!aRoute || !bRoute) return a.index - b.index;

      return (
        getBusAgencyOrder({
          routeId: aRoute.route_id,
          sourceAgency: aRoute.sourceAgency,
        }) -
          getBusAgencyOrder({
            routeId: bRoute.route_id,
            sourceAgency: bRoute.sourceAgency,
          }) || a.index - b.index
      );
    })
    .map(({ result }) => result);
}

export function mergeSubwayStationResults(
  results: SearchResult[],
): SearchResult[] {
  const subwayStations = results.filter(
    (result) => result.type === 'subway_station',
  );
  if (subwayStations.length === 0) return results;

  const stationGroups: SearchResult[][] = [];
  for (const station of subwayStations) {
    const group = stationGroups.find((items) =>
      shouldMergeStations(station.name, items[0].name),
    );
    if (group) group.push(station);
    else stationGroups.push([station]);
  }

  const mergedStationByFirstId = new Map<string, SearchResult>();
  const duplicateStationIds = new Set<string>();
  for (const stations of stationGroups) {
    const base = stations[0];
    const allRoutes = new Set<string>();
    stations.forEach((station, index) => {
      station.routes?.forEach((route) => allRoutes.add(route));
      if (index > 0) duplicateStationIds.add(station.id);
    });
    mergedStationByFirstId.set(base.id, {
      ...base,
      name: toTitleCase(normalizeStationName(base.name)),
      routes: Array.from(allRoutes).sort(),
    });
  }

  return results
    .map((result) => {
      if (result.type !== 'subway_station') return result;
      if (duplicateStationIds.has(result.id)) return null;
      return mergedStationByFirstId.get(result.id) ?? result;
    })
    .filter((result): result is SearchResult => result !== null);
}
