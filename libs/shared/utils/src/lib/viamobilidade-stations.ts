import {
  type ActualCptmLineCode,
  findApi1RailStationByName,
} from './cptm-stations';

/**
 * Station data for lines with real-time next train information.
 * - L4 (Amarela): Motiva
 * - L8 (Diamante): ViaMobilidade
 * - L9 (Esmeralda): ViaMobilidade
 */

/**
 * Station information for next-train enabled lines
 */
export interface NextTrainStation {
  /** 3-letter station code (e.g., "OSA", "PIN") */
  code: string;
  /** Display name (e.g., "Osasco", "Pinheiros") */
  name: string;
}

/**
 * Line 4 - Amarela stations (Luz → Vila Sônia)
 * Order: Terminal 1 (LUZ) to Terminal 2 (VSO)
 * Operated by Motiva
 */
export const L4_STATIONS: NextTrainStation[] = [
  { code: 'LUZ', name: 'Luz' },
  { code: 'REP', name: 'República' },
  { code: 'HGN', name: 'Higienópolis-Mackenzie' },
  { code: 'PAU', name: 'Paulista' },
  { code: 'OCR', name: 'Oscar Freire' },
  { code: 'FRD', name: 'Fradique Coutinho' },
  { code: 'FLM', name: 'Faria Lima' },
  { code: 'PIH', name: 'Pinheiros' },
  { code: 'BUT', name: 'Butantã' },
  { code: 'SPM', name: 'São Paulo-Morumbi' },
  { code: 'VLS', name: 'Vila Sônia' },
];

/**
 * Line 8 - Diamante stations (Júlio Prestes → Amador Bueno)
 * Order: Terminal 1 (JPR) to Terminal 2 (ABU)
 *
 * The list includes the four additional stations beyond Itapevi that
 * were previously maintained only in the backend copy. Keeping a single
 * source prevents duplication and ensures both frontend and backend
 * reference the same information.
 */
export const L8_STATIONS: NextTrainStation[] = [
  { code: 'JPR', name: 'Júlio Prestes' },
  { code: 'BFU', name: 'Palmeiras–Barra Funda' },
  { code: 'LAB', name: 'Lapa' },
  { code: 'DMO', name: 'Domingos de Moraes' },
  { code: 'ILE', name: 'Imperatriz Leopoldina' },
  { code: 'PAL', name: 'Presidente Altino' },
  { code: 'OSA', name: 'Osasco' },
  { code: 'CSA', name: 'Comandante Sampaio' },
  { code: 'QTU', name: 'Quitaúna' },
  { code: 'GMC', name: 'General Miguel Costa' },
  { code: 'CPB', name: 'Carapicuíba' },
  { code: 'STE', name: 'Santa Terezinha' },
  { code: 'AJO', name: 'Antônio João' },
  { code: 'BRU', name: 'Barueri' },
  { code: 'JBE', name: 'Jardim Belval' },
  { code: 'JSI', name: 'Jardim Silveira' },
  { code: 'JDI', name: 'Jandira' },
  { code: 'SCO', name: 'Sagrado Coração' },
  { code: 'ECD', name: 'Engenheiro Cardoso' },
  { code: 'IPV', name: 'Itapevi' },
  { code: 'SRT', name: 'Santa Rita' },
  { code: 'AMB', name: 'Ambuitá' },
  { code: 'ABU', name: 'Amador Bueno' },
];

/**
 * Line 9 - Esmeralda stations (Osasco → Varginha)
 * Order: Terminal 1 (OSA) to Terminal 2 (VAG)
 */
export const L9_STATIONS: NextTrainStation[] = [
  { code: 'OSA', name: 'Osasco' },
  { code: 'PAL', name: 'Presidente Altino' },
  { code: 'CEA', name: 'Ceasa' },
  { code: 'JAG', name: 'Villa Lobos–Jaguaré' },
  { code: 'USP', name: 'Cidade Universitária' },
  { code: 'PIN', name: 'Pinheiros' },
  { code: 'HBR', name: 'Hebraica–Rebouças' },
  { code: 'CJD', name: 'Cidade Jardim' },
  { code: 'VOL', name: 'Vila Olímpia' },
  { code: 'BRR', name: 'Berrini' },
  { code: 'MRB', name: 'Morumbi' },
  { code: 'GJT', name: 'Granja Julieta' },
  { code: 'JOD', name: 'João Dias' },
  { code: 'SAM', name: 'Santo Amaro' },
  { code: 'SOC', name: 'Socorro' },
  { code: 'JUR', name: 'Jurubatuba' },
  { code: 'AUT', name: 'Autódromo' },
  { code: 'INT', name: 'Primavera–Interlagos' },
  { code: 'GRA', name: 'Grajaú' },
  { code: 'MVN', name: 'Bruno Covas/Mendes–Vila Natal' },
  { code: 'VAG', name: 'Varginha' },
];

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
 * Check if station code belongs to a next-train enabled line
 * Returns the line code if found, undefined otherwise
 */
export function findLineForStation(
  stationCode: string,
): NextTrainLineCode | undefined {
  if (L4_STATIONS.some((s) => s.code === stationCode)) {
    return 'L4';
  }
  if (L8_STATIONS.some((s) => s.code === stationCode)) {
    return 'L8';
  }
  if (L9_STATIONS.some((s) => s.code === stationCode)) {
    return 'L9';
  }
  return undefined;
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
    if (normalizeStationName(station.name) === normalizedName) {
      return { lineCode: 'L4', stationCode: station.code };
    }
  }

  // Check L8
  for (const station of L8_STATIONS) {
    if (normalizeStationName(station.name) === normalizedName) {
      return { lineCode: 'L8', stationCode: station.code };
    }
  }

  // Check L9
  for (const station of L9_STATIONS) {
    if (normalizeStationName(station.name) === normalizedName) {
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
    .replace(/[-–—]/g, ' ') // Replace dashes with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\s*\(linha\s*\d+\)\s*/gi, '') // Remove "(linha X)" suffix
    .trim();
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
      if (normalizeStationName(station.name) === normalizedName) {
        results.push({ lineCode: 'L4', stationCode: station.code });
        break;
      }
    }
  }

  // Check if L8 is in the line codes
  if (lineCodes.includes(8)) {
    for (const station of L8_STATIONS) {
      if (normalizeStationName(station.name) === normalizedName) {
        results.push({ lineCode: 'L8', stationCode: station.code });
        break;
      }
    }
  }

  // Check if L9 is in the line codes
  if (lineCodes.includes(9)) {
    for (const station of L9_STATIONS) {
      if (normalizeStationName(station.name) === normalizedName) {
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
    if (!lineCodes.includes(numericLineCode)) {
      continue;
    }

    const station = findApi1RailStationByName(lineCode, stationName);
    if (station) {
      results.push({ lineCode, stationCode: station.code });
    }
  }

  return results;
}
