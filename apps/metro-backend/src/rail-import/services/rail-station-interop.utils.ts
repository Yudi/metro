import {
  getCanonicalRailStationName,
  hardNormalizeString,
  normalizeStationName,
  shouldMergeStations,
} from '@metro/shared/utils';
import { haversineDistanceKm } from '../../common/utils/geo-distance.util';
import {
  RAIL_DATASETS,
  type RailLineDatasetConfig,
  type RailDatasetSource,
} from '../config/rail-datasets.config';

const MAX_STATION_MATCH_DISTANCE_METRES = 500;

/** One normalized station record per stop and rail line. */
export interface DatasetRailStation {
  id: number;
  name: string;
  line: string;
  lineCode: number | null;
  latitude: number;
  longitude: number;
  mergedIds?: number[];
}

interface StationGroup {
  readonly stations: DatasetRailStation[];
  readonly representative: DatasetRailStation;
}

interface StationMatch {
  readonly selectedIndex: number;
  readonly counterpartIndex: number;
  readonly distanceMetres: number;
}

/** Select one source per line, falling back only when it has no rows. Matched
 * stations retain the selected source's details and GeoSampa's stable ID.
 */
export function selectRailStations(
  geosampa: readonly DatasetRailStation[],
  sptrans: readonly DatasetRailStation[],
  configuration: readonly RailLineDatasetConfig[] = RAIL_DATASETS,
): DatasetRailStation[] {
  const selectedStations: DatasetRailStation[] = [];

  for (const lineConfiguration of configuration) {
    const geosampaLine = geosampa.filter(
      (station) => station.lineCode === lineConfiguration.lineCode,
    );
    const sptransLine = sptrans.filter(
      (station) => station.lineCode === lineConfiguration.lineCode,
    );

    const selectedSource: RailDatasetSource =
      lineConfiguration.source === 'geosampa'
        ? geosampaLine.length > 0
          ? 'geosampa'
          : 'sptrans'
        : sptransLine.length > 0
          ? 'sptrans'
          : 'geosampa';
    const selectedRows =
      selectedSource === 'geosampa' ? geosampaLine : sptransLine;
    const counterpartRows =
      selectedSource === 'geosampa' ? sptransLine : geosampaLine;

    const selectedGroups = groupEquivalentStations(
      selectedRows,
      lineConfiguration.lineCode,
    );
    const counterpartGroups = groupEquivalentStations(
      counterpartRows,
      lineConfiguration.lineCode,
    );
    const matches = matchStationGroups(
      selectedGroups,
      counterpartGroups,
      lineConfiguration.lineCode,
    );
    const matchedCounterparts = new Set(
      matches.map((match) => match.counterpartIndex),
    );

    for (const [selectedIndex, selectedGroup] of selectedGroups.entries()) {
      const match = matches.find(
        (candidate) => candidate.selectedIndex === selectedIndex,
      );
      const counterpart = match
        ? counterpartGroups[match.counterpartIndex]
        : undefined;
      selectedStations.push(
        toSelectedStation(
          selectedGroup,
          counterpart,
          selectedSource,
          lineConfiguration.lineCode,
        ),
      );
    }

    if (
      selectedSource === 'geosampa' &&
      lineConfiguration.supplementalStationNames?.length
    ) {
      const supplementalNames = new Set(
        lineConfiguration.supplementalStationNames.map((name) =>
          canonicalStationName(name, lineConfiguration.lineCode),
        ),
      );

      for (const [counterpartIndex, counterpartGroup] of
        counterpartGroups.entries()) {
        if (matchedCounterparts.has(counterpartIndex)) continue;

        const counterpart = counterpartGroup.representative;
        if (
          !supplementalNames.has(
            canonicalStationName(counterpart.name, lineConfiguration.lineCode),
          )
        ) {
          continue;
        }

        selectedStations.push(toSelectedStation(counterpartGroup));
      }
    }
  }

  return selectedStations;
}

function groupEquivalentStations(
  stations: readonly DatasetRailStation[],
  lineCode: number,
): StationGroup[] {
  const groups: StationGroup[] = [];

  for (const station of stations) {
    const group = groups.find((candidate) =>
      candidate.stations.every(
        (existing) =>
          equivalentStationNames(station.name, existing.name, lineCode) &&
          stationDistanceMetres(station, existing) <=
            MAX_STATION_MATCH_DISTANCE_METRES,
      ),
    );

    if (group) {
      group.stations.push(station);
    } else {
      groups.push({ stations: [station], representative: station });
    }
  }

  return groups;
}

function matchStationGroups(
  selectedGroups: readonly StationGroup[],
  counterpartGroups: readonly StationGroup[],
  lineCode: number,
): StationMatch[] {
  const candidates: StationMatch[] = [];

  for (const [selectedIndex, selectedGroup] of selectedGroups.entries()) {
    for (const [counterpartIndex, counterpartGroup] of
      counterpartGroups.entries()) {
      const selected = selectedGroup.representative;
      const counterpart = counterpartGroup.representative;
      if (
        !equivalentStationNames(selected.name, counterpart.name, lineCode)
      ) {
        continue;
      }

      const distanceMetres = stationDistanceMetres(selected, counterpart);
      if (distanceMetres <= MAX_STATION_MATCH_DISTANCE_METRES) {
        candidates.push({
          selectedIndex,
          counterpartIndex,
          distanceMetres,
        });
      }
    }
  }

  candidates.sort(
    (left, right) =>
      left.distanceMetres - right.distanceMetres ||
      left.selectedIndex - right.selectedIndex ||
      left.counterpartIndex - right.counterpartIndex,
  );

  const selectedMatches = new Set<number>();
  const counterpartMatches = new Set<number>();
  const matches: StationMatch[] = [];

  for (const candidate of candidates) {
    if (
      selectedMatches.has(candidate.selectedIndex) ||
      counterpartMatches.has(candidate.counterpartIndex)
    ) {
      continue;
    }

    selectedMatches.add(candidate.selectedIndex);
    counterpartMatches.add(candidate.counterpartIndex);
    matches.push(candidate);
  }

  return matches;
}

function equivalentStationNames(
  left: string,
  right: string,
  lineCode: number,
): boolean {
  if (isDistinctMorumbiStationPair(left, right)) return false;

  const leftCanonical = canonicalStationName(left, lineCode);
  const rightCanonical = canonicalStationName(right, lineCode);
  if (leftCanonical === rightCanonical) return true;

  // Fall back to shared name matching when no static alias matches.
  return shouldMergeStations(left, right);
}

function canonicalStationName(name: string, lineCode: number): string {
  const canonicalName = getCanonicalRailStationName(name, [lineCode]);
  return hardNormalizeString(normalizeStationName(canonicalName));
}

function isDistinctMorumbiStationPair(left: string, right: string): boolean {
  const leftName = hardNormalizeString(normalizeStationName(left));
  const rightName = hardNormalizeString(normalizeStationName(right));
  const leftIsSaoPauloMorumbi =
    leftName.includes('morumbi') && leftName.includes('saopaulo');
  const rightIsSaoPauloMorumbi =
    rightName.includes('morumbi') && rightName.includes('saopaulo');

  return (
    leftName.includes('morumbi') &&
    rightName.includes('morumbi') &&
    leftIsSaoPauloMorumbi !== rightIsSaoPauloMorumbi
  );
}

function stationDistanceMetres(
  left: DatasetRailStation,
  right: DatasetRailStation,
): number {
  return (
    haversineDistanceKm(
      left.latitude,
      left.longitude,
      right.latitude,
      right.longitude,
    ) * 1000
  );
}

function toSelectedStation(
  selectedGroup: StationGroup,
  counterpartGroup?: StationGroup,
  selectedSource?: RailDatasetSource,
  lineCode?: number,
): DatasetRailStation {
  const representative = selectedGroup.representative;
  const allIds = new Set<number>();
  for (const station of [
    ...selectedGroup.stations,
    ...(counterpartGroup?.stations ?? []),
  ]) {
    allIds.add(station.id);
    for (const mergedId of station.mergedIds ?? []) allIds.add(mergedId);
  }

  const geosampaId =
    selectedSource === 'geosampa'
      ? selectedGroup.representative.id
      : counterpartGroup?.representative.id;
  const primaryId = geosampaId ?? representative.id;
  allIds.add(primaryId);
  const mergedIds = Array.from(allIds).sort((left, right) => left - right);

  return {
    ...representative,
    id: primaryId,
    ...(mergedIds.length > 1 ? { mergedIds } : {}),
    ...(lineCode === undefined ? {} : { lineCode }),
  };
}
