import {
  getStaticRailStationsByLine,
  type StaticRailStation,
} from './rail-stations.entity';
import { hardNormalizeString } from './strings.utils';
import { TRIVIATRENS_LIVE_DATA_ENABLED } from './transit-agency.utils';

/**
 * Vehicle position delivered by the backend for tracked rail lines.
 */
export interface TrackedRailVehicle {
  id: string;
  prefix: string;
  lat: number;
  lng: number;
  bearing: number;
  wheelchair: boolean;
  climatized: boolean;
  lastUpdate: number;
  averageSpeed: number;
  stopSequence: number;
  destination?: string;
}

/**
 * Line code type for lines tracked by the rail integration service.
 */
export type CptmLineCode = 'L4' | 'L10' | 'L11' | 'L12' | 'L13' | 'EA' | '10X';

/**
 * Line code type for actual CPTM-operated lines (excludes L4)
 */
export type ActualCptmLineCode = 'L10' | 'L11' | 'L12' | 'L13';

/** Special services discovered dynamically from the rail integration service. */
export type SpecialCptmLineCode = 'EA' | '10X';

export type Api1RailLineCode = ActualCptmLineCode | SpecialCptmLineCode;

const TRIVIATRENS_API1_RAIL_LINE_CODES = new Set<Api1RailLineCode>([
  'L11',
  'L12',
  'L13',
  'EA',
]);

const API1_PUBLIC_STATION_SOURCE_LINES: Record<
  Api1RailLineCode,
  readonly ActualCptmLineCode[]
> = {
  L10: ['L10'],
  L11: ['L11'],
  L12: ['L12'],
  L13: ['L13'],
  EA: ['L13', 'L11', 'L10', 'L12'],
  '10X': ['L10'],
};

/**
 * All next-train enabled line codes.
 */
export type AllNextTrainLineCode =
  | 'L4'
  | 'L8'
  | 'L9'
  | 'L10'
  | 'L11'
  | 'L12'
  | 'L13'
  | 'EA'
  | '10X';

/**
 * Line display configuration for next-train-enabled rail lines.
 */
export const CPTM_LINE_CONFIG: Record<
  CptmLineCode,
  {
    routeCode: string;
    name: string;
    bgcolor: string;
    fgcolor: string;
  }
> = {
  L4: {
    routeCode: '4',
    name: 'Amarela',
    bgcolor: 'FFEE00',
    fgcolor: '000000',
  },
  L10: {
    routeCode: '10',
    name: 'Turquesa',
    bgcolor: '00A6A0',
    fgcolor: 'FFFFFF',
  },
  L11: {
    routeCode: '11',
    name: 'Coral',
    bgcolor: 'F55F1A',
    fgcolor: 'FFFFFF',
  },
  L12: {
    routeCode: '12',
    name: 'Safira',
    bgcolor: '1C146B',
    fgcolor: 'FFFFFF',
  },
  L13: {
    routeCode: '13',
    name: 'Jade',
    bgcolor: '00B052',
    fgcolor: 'FFFFFF',
  },
  EA: {
    routeCode: 'EA',
    name: 'Expresso Aeroporto',
    bgcolor: '000000',
    fgcolor: 'FFFFFF',
  },
  '10X': {
    routeCode: '10X',
    name: 'Expresso Linha 10',
    bgcolor: '00A6A0',
    fgcolor: 'FFFFFF',
  },
};

/**
 * Get CPTM line code from route code
 */
export function getCptmLineCode(routeCode: string): CptmLineCode | undefined {
  const entry = Object.entries(CPTM_LINE_CONFIG).find(
    ([, config]) => config.routeCode === routeCode,
  );
  return entry?.[0] as CptmLineCode | undefined;
}

/**
 * Get CPTM line code from line name
 */
export function getCptmLineCodeByName(name: string): CptmLineCode | undefined {
  const normalizedName = name.toLowerCase().trim();
  const entry = Object.entries(CPTM_LINE_CONFIG).find(
    ([, config]) => config.name.toLowerCase() === normalizedName,
  );
  return entry?.[0] as CptmLineCode | undefined;
}

/**
 * Check if a line code is tracked by private rail data.
 */
export function isCptmLine(lineCode: string): lineCode is CptmLineCode {
  return lineCode in CPTM_LINE_CONFIG;
}

/**
 * Check if a line code is an actual CPTM-operated line (L10-L13)
 */
export function isActualCptmLine(
  lineCode: string,
): lineCode is ActualCptmLineCode {
  return (
    lineCode === 'L10' ||
    lineCode === 'L11' ||
    lineCode === 'L12' ||
    lineCode === 'L13'
  );
}

export function isSpecialCptmLine(
  lineCode: string,
): lineCode is SpecialCptmLineCode {
  return lineCode === 'EA' || lineCode === '10X';
}

export function isApi1RailLine(
  lineCode: string,
): lineCode is ActualCptmLineCode | SpecialCptmLineCode {
  if (lineCode === 'L10' || lineCode === '10X') {
    return true;
  }

  return (
    TRIVIATRENS_LIVE_DATA_ENABLED &&
    TRIVIATRENS_API1_RAIL_LINE_CODES.has(lineCode as Api1RailLineCode)
  );
}

function getApi1RailPublicStations(
  lineCode: Api1RailLineCode,
): readonly StaticRailStation[] {
  return API1_PUBLIC_STATION_SOURCE_LINES[lineCode].flatMap(
    (sourceLineCode) => getStaticRailStationsByLine(sourceLineCode) ?? [],
  );
}

function matchesStationName(station: StaticRailStation, stationName: string) {
  const normalizedName = hardNormalizeString(stationName);
  const candidateNames = [station.name, ...(station.alternativeNames ?? [])];

  return candidateNames.some((candidateName) => {
    const normalizedCandidate = hardNormalizeString(candidateName);
    return (
      normalizedCandidate === normalizedName ||
      normalizedCandidate.includes(normalizedName) ||
      normalizedName.includes(normalizedCandidate)
    );
  });
}

export function findApi1RailStationByName(
  lineCode: Api1RailLineCode,
  stationName: string,
): StaticRailStation | undefined {
  return getApi1RailPublicStations(lineCode).find((station) =>
    matchesStationName(station, stationName),
  );
}

export function getApi1RailStationByCode(
  lineCode: Api1RailLineCode,
  stationCode: string,
): StaticRailStation | undefined {
  const normalizedCode = stationCode.toUpperCase();
  return getApi1RailPublicStations(lineCode).find(
    (station) => station.code === normalizedCode,
  );
}

export function getApi1RailStationName(
  lineCode: Api1RailLineCode,
  stationCode: string,
): string | undefined {
  return getApi1RailStationByCode(lineCode, stationCode)?.name;
}

export function getApi1RailStationCodes(
  lineCode: Api1RailLineCode,
): string[] {
  return Array.from(
    new Set(getApi1RailPublicStations(lineCode).map((station) => station.code)),
  );
}

export function isValidApi1RailStationCode(
  lineCode: Api1RailLineCode,
  stationCode: string,
): boolean {
  return getApi1RailStationByCode(lineCode, stationCode) !== undefined;
}

/**
 * Check if a line code has privately tracked vehicles.
 * Includes L4 and L10-L13
 */
export function hasExternalRailVehicles(
  lineCode: string,
): lineCode is CptmLineCode {
  return lineCode === 'L4' || isApi1RailLine(lineCode);
}

/**
 * Check if a line code has privately sourced next-train data.
 * Only includes L10-L13.
 */
export function hasExternalRailNextTrain(
  lineCode: string,
): lineCode is ActualCptmLineCode | SpecialCptmLineCode {
  return isApi1RailLine(lineCode);
}

/**
 * Check whether a line currently has a next-train integration.
 *
 * Trivia Trens lines are controlled by TRIVIATRENS_LIVE_DATA_ENABLED so their
 * former CPTM/AP1 source can be retired without changing agency ownership.
 */
export function hasNextTrainIntegration(
  lineCode: string,
): lineCode is AllNextTrainLineCode {
  return (
    lineCode === 'L4' ||
    lineCode === 'L8' ||
    lineCode === 'L9' ||
    isApi1RailLine(lineCode)
  );
}

/**
 * Extract CPTM line code from route shortName
 * Handles formats like "CPTM L10", "CPTM L10-Turquesa", "L10", etc.
 * @returns CptmLineCode if found, undefined otherwise
 */
export function extractCptmLineCode(
  shortName: string,
): CptmLineCode | undefined {
  if (!shortName) return undefined;

  // Match L10, L11, L12, or L13 in the string
  const match = shortName.match(/L1[0-3]/i);
  if (match) {
    const lineCode = match[0].toUpperCase() as CptmLineCode;
    if (isCptmLine(lineCode)) {
      return lineCode;
    }
  }

  return undefined;
}

/**
 * Extract line code that has private vehicle tracking from route shortName or lineId
 * Handles L4 (Amarela), L10-L13 (CPTM lines)
 * Formats: "L4", "L4-Amarela", "CPTM L10", "CPTM L10-Turquesa", "L10", etc.
 * @returns CptmLineCode if found (L4 or L10-L13), undefined otherwise
 */
export function extractTrackedRailVehicleLineCode(
  shortName: string,
): CptmLineCode | undefined {
  if (!shortName) return undefined;

  // Match L4, L10, L11, L12, or L13 in the string
  const match = shortName.match(/(?:L(?:4|1[0-3])|EA|10X)/i);
  if (match) {
    const lineCode = match[0].toUpperCase() as CptmLineCode;
    if (hasExternalRailVehicles(lineCode)) {
      return lineCode;
    }
  }

  return undefined;
}

/**
 * Check if a route shortName represents a CPTM line
 */
export function isCptmRouteShortName(shortName: string): boolean {
  return extractCptmLineCode(shortName) !== undefined;
}
