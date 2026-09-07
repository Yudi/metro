import { haversineDistanceKm } from '../../common/utils/geo-distance.util';
import {
  SAO_PAULO_CITY_CENTER,
  extractLineCodeFromAgency,
  getRailLineByCode,
  getStationDisplayName,
  isStationMergeException,
  normalizeStationName,
  shouldMergeStations,
} from '@metro/shared/utils';

export interface RawStation {
  id: number;
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  agencies: string[];
  route_short_names: string[];
}

export interface ProcessedStation {
  stopId: string;
  mergedStopIds: string[];
  name: string;
  originalName: string;
  latitude: number;
  longitude: number;
  agencies: string[];
  lines: string[];
  routeShortNames: string[];
}

/**
 * Merge raw rail stops into the station records consumed by the vector tile
 * views. This is kept pure so the grouping rules can evolve independently of
 * the database lifecycle and MVT view management.
 */
export function mergeSubwayStations(
  stations: RawStation[],
): ProcessedStation[] {
  const stationGroups = new Map<string, RawStation[]>();

  for (const station of stations) {
    const normalizedName = normalizeStationName(
      station.stop_name,
    ).toLowerCase();

    if (isStationMergeException(station.stop_name)) {
      const groupKey = `${normalizedName}::line:${
        getPrimaryRouteLineCode(station.route_short_names || []) ?? 'unknown'
      }`;
      addToGroup(stationGroups, groupKey, station);
      continue;
    }

    let groupKey: string | null = null;
    for (const [existingKey, existingGroup] of stationGroups.entries()) {
      if (shouldMergeStations(station.stop_name, existingGroup[0].stop_name)) {
        groupKey = existingKey;
        break;
      }
    }

    if (!groupKey) {
      groupKey = normalizedName;
      if (stationGroups.has(groupKey)) {
        let suffix = 2;
        while (stationGroups.has(`${normalizedName}::${suffix}`)) {
          suffix += 1;
        }
        groupKey = `${normalizedName}::${suffix}`;
      }
    }

    addToGroup(stationGroups, groupKey, station);
  }

  return Array.from(stationGroups.values()).map((group) =>
    group.length === 1
      ? processSingleStation(group[0])
      : mergeStationGroup(group),
  );
}

function addToGroup(
  groups: Map<string, RawStation[]>,
  key: string,
  station: RawStation,
): void {
  const group = groups.get(key);
  if (group) {
    group.push(station);
  } else {
    groups.set(key, [station]);
  }
}

function processSingleStation(station: RawStation): ProcessedStation {
  const routeShortNames = station.route_short_names || [];
  return {
    stopId: station.stop_id,
    mergedStopIds: [station.stop_id],
    name: getStationDisplayName(
      station.stop_name,
      getPrimaryRouteLineCode(routeShortNames),
    ),
    originalName: station.stop_name,
    latitude: station.stop_lat,
    longitude: station.stop_lon,
    agencies: station.agencies || [],
    lines: getLineNames(routeShortNames),
    routeShortNames,
  };
}

function mergeStationGroup(group: RawStation[]): ProcessedStation {
  const primaryStation = group.reduce((closest, current) => {
    const closestDistance = stationDistanceFromCenter(closest);
    const currentDistance = stationDistanceFromCenter(current);
    return currentDistance < closestDistance ? current : closest;
  });

  const allAgencies = new Set<string>();
  const allRouteShortNames = new Set<string>();
  for (const station of group) {
    for (const agency of station.agencies || []) {
      allAgencies.add(agency);
    }
    for (const name of station.route_short_names || []) {
      allRouteShortNames.add(name);
    }
  }

  const routeShortNames = Array.from(allRouteShortNames).sort();
  return {
    stopId: primaryStation.stop_id,
    mergedStopIds: group.map((station) => station.stop_id),
    name: getStationDisplayName(
      primaryStation.stop_name,
      getPrimaryRouteLineCode(primaryStation.route_short_names || []),
    ),
    originalName: primaryStation.stop_name,
    latitude: primaryStation.stop_lat,
    longitude: primaryStation.stop_lon,
    agencies: Array.from(allAgencies).sort(),
    lines: getLineNames(routeShortNames),
    routeShortNames,
  };
}

function stationDistanceFromCenter(station: RawStation): number {
  return haversineDistanceKm(
    station.stop_lat,
    station.stop_lon,
    SAO_PAULO_CITY_CENTER.latitude,
    SAO_PAULO_CITY_CENTER.longitude,
  );
}

function getPrimaryRouteLineCode(
  routeShortNames: string[],
): number | undefined {
  const lineCodes = routeShortNames
    .map((routeShortName) => extractLineCodeFromAgency(routeShortName))
    .filter((lineCode): lineCode is number => lineCode !== undefined)
    .sort((left, right) => left - right);

  return lineCodes[0];
}

function getLineNames(routeShortNames: string[]): string[] {
  return routeShortNames
    .map((routeShortName) => {
      const lineCode = extractLineCodeFromAgency(routeShortName);
      return lineCode
        ? (getRailLineByCode(lineCode)?.colorName ?? routeShortName)
        : routeShortName;
    })
    .sort();
}
