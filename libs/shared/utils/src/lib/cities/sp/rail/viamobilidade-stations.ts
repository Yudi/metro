import {
  getApi1RailStationName,
  isValidApi1RailStationCode,
  isSpecialCptmLine,
} from './cptm-stations';
import {
  L4_STATIONS as STATIC_L4_STATIONS,
  L8_STATIONS as STATIC_L8_STATIONS,
  L9_STATIONS as STATIC_L9_STATIONS,
  getStaticRailStationsByLine,
  type StaticRailStation,
} from './stations/rail-stations.entity';

/**
 * Station data for lines with real-time next train information.
 * - L4 (Amarela): Motiva
 * - L8 (Diamante): ViaMobilidade
 * - L9 (Esmeralda): ViaMobilidade
 */

/**
 * Station information for next-train enabled lines
 */
export type NextTrainStation = Pick<
  StaticRailStation,
  'code' | 'name' | 'alternativeNames'
>;

/**
 * Line 4 - Amarela stations (Luz → Vila Sônia)
 * Order: Terminal 1 (LUZ) to Terminal 2 (VLS)
 * Operated by Motiva
 */
export const L4_STATIONS: NextTrainStation[] = STATIC_L4_STATIONS;

/**
 * Line 8 - Diamante stations (Júlio Prestes → Amador Bueno)
 * Order: Terminal 1 (JPR) to Terminal 2 (ABU)
 *
 * The list includes the four additional stations beyond Itapevi that
 * were previously maintained only in the backend copy. Keeping a single
 * source prevents duplication and ensures both frontend and backend
 * reference the same information.
 */
export const L8_STATIONS: NextTrainStation[] = STATIC_L8_STATIONS;

/**
 * Line 9 - Esmeralda stations (Osasco → Varginha)
 * Order: Terminal 1 (OSA) to Terminal 2 (VAG)
 */
export const L9_STATIONS: NextTrainStation[] = STATIC_L9_STATIONS;

/**
 * Line code type for lines with next-train data
 */
export type NextTrainLineCode = 'L4' | 'L8' | 'L9';

/**
 * Lines supported by live arrivals or published service schedules.
 */
export type ExtendedNextTrainLineCode =
  | NextTrainLineCode
  | 'L1'
  | 'L2'
  | 'L3'
  | 'L5'
  | 'L6'
  | 'L7'
  | 'L10'
  | 'L11'
  | 'L12'
  | 'L13'
  | 'L15'
  | 'L17'
  | 'EA'
  | '10X';

/** Schedule availability does not enable a line's live integration. */
export function hasNextTrainInformation(
  lineCode: string,
): lineCode is ExtendedNextTrainLineCode {
  return (
    isSpecialCptmLine(lineCode) ||
    (/^L(?:[1-9]|1[0-3]|15|17)$/.test(lineCode) &&
      getStaticRailStationsByLine(lineCode) !== undefined)
  );
}

export function isValidNextTrainStation(
  lineCode: string,
  stationCode: string,
): boolean {
  if (!hasNextTrainInformation(lineCode)) return false;
  return isSpecialCptmLine(lineCode)
    ? isValidApi1RailStationCode(lineCode, stationCode)
    : (getStaticRailStationsByLine(lineCode) ?? []).some(
        (station) => station.code === stationCode,
      );
}

export function getNextTrainStationName(
  lineCode: string,
  stationCode: string,
): string | undefined {
  if (!hasNextTrainInformation(lineCode)) return undefined;
  return isSpecialCptmLine(lineCode)
    ? getApi1RailStationName(lineCode, stationCode)
    : getStaticRailStationsByLine(lineCode)?.find(
        (station) => station.code === stationCode,
      )?.name;
}

/**
 * Map of line code to stations for next-train enabled lines
 */
export const NEXT_TRAIN_LINES: Record<NextTrainLineCode, NextTrainStation[]> = {
  L4: L4_STATIONS,
  L8: L8_STATIONS,
  L9: L9_STATIONS,
};

interface BranchedTerminalConfig {
  enabled: boolean;
  splitStationCode: string;
}

/**
 * Optional terminal overrides for branched lines.
 *
 * L8 operates as a main segment (Júlio Prestes ↔ Itapevi) plus an extension
 * (Itapevi ↔ Amador Bueno).
 */
const BRANCHED_TERMINAL_CONFIG: Partial<
  Record<NextTrainLineCode, BranchedTerminalConfig>
> = {
  L8: {
    enabled: true,
    splitStationCode: 'IPV',
  },
};

/**
 * Get station name by code for a specific line
 */
export function getStationName(
  lineCode: NextTrainLineCode,
  stationCode: string,
): string | undefined {
  const stations = NEXT_TRAIN_LINES[lineCode];
  return stations.find((s) => s.code === stationCode)?.name;
}

/**
 * Get station index (position in the line) by code
 * Returns -1 if station not found
 */
export function getStationIndex(
  lineCode: NextTrainLineCode,
  stationCode: string,
): number {
  const stations = NEXT_TRAIN_LINES[lineCode];
  return stations.findIndex((s) => s.code === stationCode);
}

function getTerminalStationCodes(
  lineCode: NextTrainLineCode,
  stationCode?: string,
): [string, string] {
  const stations = NEXT_TRAIN_LINES[lineCode];
  const defaultTerminalCodes: [string, string] = [
    stations[0].code,
    stations[stations.length - 1].code,
  ];
  const branchConfig = BRANCHED_TERMINAL_CONFIG[lineCode];

  if (!branchConfig?.enabled || !stationCode) {
    return defaultTerminalCodes;
  }

  const stationIndex = getStationIndex(lineCode, stationCode);
  const splitIndex = getStationIndex(lineCode, branchConfig.splitStationCode);

  if (stationIndex === -1 || splitIndex === -1 || stationIndex === splitIndex) {
    return defaultTerminalCodes;
  }

  if (stationIndex < splitIndex) {
    return [defaultTerminalCodes[0], branchConfig.splitStationCode];
  }

  return [branchConfig.splitStationCode, defaultTerminalCodes[1]];
}

/**
 * Get terminal station names for a line
 * Returns [terminal1, terminal2]
 */
export function getTerminalStations(
  lineCode: NextTrainLineCode,
  stationCode?: string,
): [string, string] {
  const [terminal1Code, terminal2Code] = getTerminalStationCodes(
    lineCode,
    stationCode,
  );

  return [
    getStationName(lineCode, terminal1Code) ?? terminal1Code,
    getStationName(lineCode, terminal2Code) ?? terminal2Code,
  ];
}

/**
 * Determine which terminal a train is heading towards based on destination.
 * Compares the destination station index to the viewing station index.
 * Returns the terminal name the train is heading towards.
 */
export function getTerminalForDestination(
  lineCode: NextTrainLineCode,
  stationCode: string,
  destinationCode: string,
): string {
  const terminals = getTerminalStations(lineCode, stationCode);
  const stationIndex = getStationIndex(lineCode, stationCode);
  const destIndex = getStationIndex(lineCode, destinationCode);

  // If destination index is greater, train is heading towards terminal 2
  // If destination index is smaller, train is heading towards terminal 1
  if (destIndex > stationIndex) {
    return terminals[1]; // Second terminal (e.g., Varginha for L9)
  }
  return terminals[0]; // First terminal (e.g., Osasco for L9)
}

/**
 * Check if a station code is valid for a given line
 */
export function isValidStation(
  lineCode: NextTrainLineCode,
  stationCode: string,
): boolean {
  const stations = NEXT_TRAIN_LINES[lineCode];
  return stations.some((s) => s.code === stationCode);
}

/**
 * Get all station codes for a line
 */
export function getStationCodes(lineCode: NextTrainLineCode): string[] {
  return NEXT_TRAIN_LINES[lineCode].map((s) => s.code);
}

/**
 * Find station code by name (fuzzy match)
 * Useful when only the station name is known
 * Returns { lineCode, stationCode } or null if not found
 */
export function findStationByName(
  name: string,
): { lineCode: NextTrainLineCode; stationCode: string } | null {
  const normalizedName = normalizeStationName(name);

  // Check L4 first (higher priority)
  for (const station of L4_STATIONS) {
    if (matchesStationName(station, normalizedName)) {
      return { lineCode: 'L4', stationCode: station.code };
    }
  }

  // Check L8
  for (const station of L8_STATIONS) {
    if (matchesStationName(station, normalizedName)) {
      return { lineCode: 'L8', stationCode: station.code };
    }
  }

  // Check L9
  for (const station of L9_STATIONS) {
    if (matchesStationName(station, normalizedName)) {
      return { lineCode: 'L9', stationCode: station.code };
    }
  }

  return null;
}

/**
 * Normalize station name for comparison.
 * This includes stripping "(linha X)" suffixes used in GTFS data
 * to distinguish stations like Lapa L7 vs Lapa L8.
 */
function normalizeStationName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[-–—/]/g, ' ') // Replace separators with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\s*\(linha\s*\d+\)\s*/gi, '') // Remove "(linha X)" suffix
    .trim();
}

function matchesStationName(
  station: NextTrainStation,
  normalizedName: string,
): boolean {
  return [station.name, ...(station.alternativeNames ?? [])].some(
    (candidateName) => normalizeStationName(candidateName) === normalizedName,
  );
}

/** Resolve canonical station codes for live or scheduled rail information. */
export function findNextTrainStations(
  stationName: string,
  lineCodes: number[],
): { lineCode: ExtendedNextTrainLineCode; stationCode: string }[] {
  const results: {
    lineCode: ExtendedNextTrainLineCode;
    stationCode: string;
  }[] = [];
  const normalizedName = normalizeStationName(stationName);

  for (const numericLineCode of [...new Set(lineCodes)].sort((a, b) => a - b)) {
    const lineCode = `L${numericLineCode}`;
    if (!hasNextTrainInformation(lineCode)) continue;

    const station = getStaticRailStationsByLine(lineCode)?.find((candidate) =>
      matchesStationName(candidate, normalizedName),
    );
    if (station) {
      results.push({ lineCode, stationCode: station.code });
    }
  }

  return results;
}
