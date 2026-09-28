import type { SearchResult } from '../map-main/components/search-dialog/search-result-card/search-result-card.component';

export type OmniboxResultKind =
  | 'bus-route'
  | 'rail-line'
  | 'bus-stop'
  | 'rail-station'
  | 'bike-station';

export function resultKind(result: SearchResult): OmniboxResultKind {
  switch (result.type) {
    case 'route':
      return result.routeData?.source === 'rail' ? 'rail-line' : 'bus-route';
    case 'subway_station':
      return 'rail-station';
    case 'bike_station':
      return 'bike-station';
    case 'bus_stop':
      return 'bus-stop';
  }
}

export function resultQueryParams(result: SearchResult, query: string) {
  const hasCoordinates =
    result.type === 'subway_station' || result.type === 'bike_station';
  return {
    q: query.trim() || undefined,
    name: hasCoordinates ? result.name : undefined,
    lat: hasCoordinates ? result.latitude : undefined,
    lon: hasCoordinates ? result.longitude : undefined,
    lines: result.type === 'subway_station'
      ? result.routes?.join(',')
      : undefined,
  };
}
