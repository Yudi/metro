import {
  type ActualCptmLineCode,
  findApi1RailStationByName,
  hasExternalRailNextTrain,
} from './cptm-stations';
import {
  L4_STATIONS as STATIC_L4_STATIONS,
  L8_STATIONS as STATIC_L8_STATIONS,
  L9_STATIONS as STATIC_L9_STATIONS,
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
 * Extended line code type including CPTM lines (L10-L13)
 */
export type ExtendedNextTrainLineCode =
  | NextTrainLineCode
  | 'L10'
  | 'L11'
  | 'L12'
  | 'L13'
  | 'EA'
  | '10X';

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
 * (Itapevi ↔ Amador Bueno). Keeping this config isolated makes the behavior
 * easy to disable or remove if service patterns change in the future.
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

/**
 * Find all next-train station codes for a stop by name and line codes
 * Checks if the line codes include L4 (4), L8 (8), L9 (9), or CPTM lines (10-13)
 * Returns array of { lineCode, stationCode } for each match
 * For CPTM lines (10-13), stationCode comes from the shared static station list
 */
export function findNextTrainStations(
  stationName: string,
  lineCodes: number[],
): { lineCode: ExtendedNextTrainLineCode; stationCode: string }[] {
  const results: {
    lineCode: ExtendedNextTrainLineCode;
    stationCode: string;
  }[] = [];
  const normalizedName = normalizeStationName(stationName);

  // Check if L4 is in the line codes
  if (lineCodes.includes(4)) {
    for (const station of L4_STATIONS) {
      if (matchesStationName(station, normalizedName)) {
        results.push({ lineCode: 'L4', stationCode: station.code });
        break;
      }
    }
  }

  // Check if L8 is in the line codes
  if (lineCodes.includes(8)) {
    for (const station of L8_STATIONS) {
      if (matchesStationName(station, normalizedName)) {
        results.push({ lineCode: 'L8', stationCode: station.code });
        break;
      }
    }
  }

  // Check if L9 is in the line codes
  if (lineCodes.includes(9)) {
    for (const station of L9_STATIONS) {
      if (matchesStationName(station, normalizedName)) {
        results.push({ lineCode: 'L9', stationCode: station.code });
        break;
      }
    }
  }

  const cptmLineCodes: Array<[number, ActualCptmLineCode]> = [
    [10, 'L10'],
    [11, 'L11'],
    [12, 'L12'],
    [13, 'L13'],
  ];

  for (const [numericLineCode, lineCode] of cptmLineCodes) {
    if (
      !lineCodes.includes(numericLineCode) ||
      !hasExternalRailNextTrain(lineCode)
    ) {
      continue;
    }

    const station = findApi1RailStationByName(lineCode, stationName);
    if (station) {
      results.push({ lineCode, stationCode: station.code });
    }
  }

  return results;
}
