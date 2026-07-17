import {
  getCanonicalRailStationName,
  getLineCodesFromColorNames,
} from './rail-line.utils';
import { toTitleCase } from './station-name.utils';
import { TRIVIATRENS_LIVE_DATA_ENABLED } from './transit-agency.utils';

export type SearchTypes =
  | 'busRoute'
  | 'busStop'
  | 'railLine'
  | 'railStation'
  | 'bikeStation';
export const SearchTypes = [
  'busRoute',
  'busStop',
  'railLine',
  'railStation',
  'bikeStation',
] as const;

export enum SearchTypesEnum {
  BusRoute = 'busRoute',
  BusStop = 'busStop',
  RailLine = 'railLine',
  RailStation = 'railStation',
  BikeStation = 'bikeStation',
}

export type StopsAndStations = Exclude<
  SearchTypesEnum,
  SearchTypesEnum.BusRoute | SearchTypesEnum.RailLine
>;

export const StopsAndStationsValues = Object.values(SearchTypesEnum).filter(
  (v) => v !== SearchTypesEnum.BusRoute && v !== SearchTypesEnum.RailLine,
);

export type TransitSearchStopType =
  | 'bus_stop'
  | 'subway_station'
  | 'bike_station';
export type TransitSearchStopSource = 'gtfs' | 'gpkg' | 'bike';
export type LiveTrainTrackingApiId = 'api1' | 'api2' | 'api3';

export interface TypesenseTransitStopLike {
  stop_id: string;
  stop_name: string;
  stop_desc?: string | null;
  stop_lat: number;
  stop_lon: number;
  source?: string | null;
  is_subway_station?: boolean | null;
}

export interface TransitSearchStopResult {
  id: string;
  name: string;
  type: TransitSearchStopType;
  description?: string;
  routes: string[];
  latitude: number;
  longitude: number;
  source: TransitSearchStopSource;
  lineCodes?: number[];
  liveTrainTrackingApiIds: LiveTrainTrackingApiId[];
}

export interface MapTransitStopOptions {
  gpkgStationRequiresSubwayFlag?: boolean;
  skipGtfsRailStations?: boolean;
  inferGtfsSubwayStation?: (stop: TypesenseTransitStopLike) => boolean;
  extractGtfsLineCodesFromName?: boolean;
}

export function extractLineNamesFromDescription(
  description: string | null | undefined,
): string[] {
  if (!description) {
    return [];
  }

  const parts = description.split(' - ');
  if (parts.length < 2) {
    return [];
  }

  return parts[parts.length - 1]
    .split(',')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function extractLineCodesFromRouteNames(routes: string[]): number[] {
  const lineCodes = new Set<number>();

  for (const route of routes) {
    const matches = route.matchAll(/(?:linha\s*|l)(\d+)/gi);

    for (const match of matches) {
      const code = parseInt(match[1], 10);
      if (code >= 1 && code <= 15) {
        lineCodes.add(code);
      }
    }
  }

  return [...lineCodes].sort((a, b) => a - b);
}

const LIVE_TRAIN_TRACKING_API_ORDER: LiveTrainTrackingApiId[] = [
  'api3',
  'api2',
  'api1',
];

const LIVE_TRAIN_TRACKING_APIS_BY_LINE_CODE: Partial<
  Record<number, LiveTrainTrackingApiId[]>
> = {
  4: ['api3', 'api1'],
  8: ['api2'],
  9: ['api2'],
  10: ['api1'],
  11: TRIVIATRENS_LIVE_DATA_ENABLED ? ['api1'] : [],
  12: TRIVIATRENS_LIVE_DATA_ENABLED ? ['api1'] : [],
  13: TRIVIATRENS_LIVE_DATA_ENABLED ? ['api1'] : [],
};

export function getLiveTrainTrackingApiIds(
  lineCodes: number[],
): LiveTrainTrackingApiId[] {
  const apiIds = new Set<LiveTrainTrackingApiId>();

  for (const lineCode of lineCodes) {
    const lineApiIds = LIVE_TRAIN_TRACKING_APIS_BY_LINE_CODE[lineCode] ?? [];
    for (const apiId of lineApiIds) {
      apiIds.add(apiId);
    }
  }

  return [...apiIds].sort(
    (a, b) =>
      LIVE_TRAIN_TRACKING_API_ORDER.indexOf(a) -
      LIVE_TRAIN_TRACKING_API_ORDER.indexOf(b),
  );
}

export function hasLiveTrainTrackingLine(lineCodes: number[]): boolean {
  return getLiveTrainTrackingApiIds(lineCodes).length > 0;
}

export function mapTypesenseStopToTransitSearchResult(
  stop: TypesenseTransitStopLike,
  options: MapTransitStopOptions = {},
): TransitSearchStopResult | null {
  const source =
    stop.source === 'gpkg' || stop.source === 'bike' ? stop.source : 'gtfs';

  if (source === 'bike') {
    return {
      id: stop.stop_id,
      name: stop.stop_name,
      type: 'bike_station',
      description: stop.stop_desc || undefined,
      routes: [],
      latitude: stop.stop_lat,
      longitude: stop.stop_lon,
      source,
      lineCodes: [],
      liveTrainTrackingApiIds: [],
    };
  }

  const requiresSubwayFlag = options.gpkgStationRequiresSubwayFlag ?? true;
  const isGpkgRailStation =
    source === 'gpkg' &&
    (!requiresSubwayFlag || stop.is_subway_station === true);

  if (isGpkgRailStation) {
    const lineNames = extractLineNamesFromDescription(stop.stop_desc);
    const lineCodes = getLineCodesFromColorNames(lineNames);

    return {
      id: stop.stop_id,
      name: toTitleCase(
        getCanonicalRailStationName(stop.stop_name, lineCodes),
      ),
      type: 'subway_station',
      description: stop.stop_desc || undefined,
      routes: lineNames,
      latitude: stop.stop_lat,
      longitude: stop.stop_lon,
      source: 'gpkg',
      lineCodes,
      liveTrainTrackingApiIds: getLiveTrainTrackingApiIds(lineCodes),
    };
  }

  if ((options.skipGtfsRailStations ?? true) && stop.is_subway_station === true) {
    return null;
  }

  const lineCodes = options.extractGtfsLineCodesFromName
    ? extractLineCodesFromRouteNames([stop.stop_name])
    : [];
  const isSubwayStation = options.inferGtfsSubwayStation?.(stop) ?? false;

  return {
    id: stop.stop_id,
    name: stop.stop_name,
    type: isSubwayStation ? 'subway_station' : 'bus_stop',
    description: stop.stop_desc || undefined,
    routes: [],
    latitude: stop.stop_lat,
    longitude: stop.stop_lon,
    source: 'gtfs',
    lineCodes,
    liveTrainTrackingApiIds: getLiveTrainTrackingApiIds(lineCodes),
  };
}
