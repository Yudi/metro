import { TransitAgency } from '../cities/sp/transit/transit-agency.utils';
import { RAIL_LINES } from '../cities/sp/rail/rail-lines.config';
import { hardNormalizeString } from '../common/strings.utils';
import type { StaticRailStation } from './stations/rail-stations.types';
import { normalizeStationName } from './stations/station-name.utils';

export {
  LINE_AGENCY_MAPPING,
  RAIL_LINE_TRAFFIC_HANDS,
  RAIL_LINES,
} from '../cities/sp/rail/rail-lines.config';

/**
 * Represents a rail line with its properties
 */
export interface RailLineInfo {
  code: number;
  lineId: string; // e.g., "L1", "L4"
  colorName: string; // e.g., "Azul", "Amarela"
  colorHex: string; // e.g., "#00529F"
  agency: TransitAgency;
  fullName: string; // e.g., "Linha 1 - Azul"
  stations: StaticRailStation[];
  carCount: number; // Number of cars in a train on this line
  carDoorCount: number; // Number of doors per car
}

export type RailLineTrafficHand = 'LHT' | 'RHT';

/**
 * Map of line code to line info for quick lookup
 */
const RAIL_LINE_BY_CODE = new Map<number, RailLineInfo>(
  RAIL_LINES.map((line) => [line.code, line]),
);

/**
 * Map of line ID to line info for quick lookup
 */
const RAIL_LINE_BY_ID = new Map<string, RailLineInfo>(
  RAIL_LINES.map((line) => [line.lineId, line]),
);

/**
 * Get rail line info by code number
 * @param code - Line code
 * @returns Line info or undefined
 */
export function getRailLineByCode(code: number): RailLineInfo | undefined {
  return RAIL_LINE_BY_CODE.get(code);
}

export function isKnownRailLineCode(code: number): boolean {
  return RAIL_LINE_BY_CODE.has(code);
}

/**
 * Get rail line info by line ID
 * @param lineId - Line ID (e.g., "L1", "L4")
 * @returns Line info or undefined
 */
export function getRailLineById(lineId: string): RailLineInfo | undefined {
  // Normalize lineId (handle "L09" -> "L9")
  const match = lineId.match(/L(\d+)/i);
  if (match) {
    const normalized = `L${parseInt(match[1], 10)}`;
    return RAIL_LINE_BY_ID.get(normalized);
  }
  return RAIL_LINE_BY_ID.get(lineId);
}

/**
 * Get all rail lines for a specific agency
 * @param agency - Transit agency
 * @returns Array of line info for that agency
 */
export function getRailLinesByAgency(agency: TransitAgency): RailLineInfo[] {
  return RAIL_LINES.filter((line) => line.agency === agency);
}

/**
 * Parse a rail line code from provider-shaped line name/number fields.
 *
 * GeoSampa line fields are mutable provider data, so parsing belongs in
 * backend/shared code rather than database helper functions.
 */
export function parseRailLineCode(
  lineName?: string | null,
  lineNumber?: number | string | null,
): number | undefined {
  if (lineName) {
    const normalizedLineName = hardNormalizeString(lineName);
    const lineByColorName = RAIL_LINES.find(
      (line) => hardNormalizeString(line.colorName) === normalizedLineName,
    );
    if (lineByColorName) {
      return lineByColorName.code;
    }

    const extractedLineCode = extractLineCodeFromAgency(lineName);
    if (extractedLineCode !== undefined) {
      return extractedLineCode;
    }
  }

  if (lineNumber !== null && lineNumber !== undefined && lineNumber !== '') {
    const numericLineNumber = Number(lineNumber);
    if (Number.isInteger(numericLineNumber)) {
      return numericLineNumber;
    }
  }

  return undefined;
}

/**
 * Extract line code from agency/route string
 * @param agency - Agency string like "METRÔ-L1", "CPTM L11", "VIAMOBILIDADE-L5", "METRÔ 15"
 * @returns Line code number or undefined
 */
export function extractLineCodeFromAgency(agency: string): number | undefined {
  // First try to match "L" followed by digits (most common format)
  const lMatch = agency.match(/L(\d+)/i);
  if (lMatch) {
    return parseInt(lMatch[1], 10);
  }

  // Special case: "METRÔ 15" (dataset error - should be "METRÔ L15")
  const metroMatch = agency.match(/METRÔ\s+(\d+)/i);
  if (metroMatch) {
    return parseInt(metroMatch[1], 10);
  }

  return undefined;
}

/**
 * Get line code by Portuguese color name (case-insensitive)
 * @param colorName - Portuguese color name (e.g., "AMARELA", "Azul")
 * @returns Line code number or undefined if not found
 */
export function getLineCodeByColorName(colorName: string): number | undefined {
  const lineIdMatch = colorName.match(/\bL\s*0?(\d{1,2})\b/i);
  if (lineIdMatch) {
    const code = parseInt(lineIdMatch[1], 10);
    if (RAIL_LINE_BY_CODE.has(code)) {
      return code;
    }
  }

  const linhaMatch = colorName.match(/\blinha\s+0?(\d{1,2})\b/i);
  if (linhaMatch) {
    const code = parseInt(linhaMatch[1], 10);
    if (RAIL_LINE_BY_CODE.has(code)) {
      return code;
    }
  }

  const normalized = colorName
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const line = RAIL_LINES.find((l) => {
    const clean = l.colorName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return clean === normalized;
  });
  return line?.code;
}

/**
 * Get line codes from array of Portuguese color names
 * @param colorNames - Array of Portuguese color names (e.g., ["AMARELA", "ESMERALDA"])
 * @returns Array of line code numbers
 */
export function getLineCodesFromColorNames(colorNames: string[]): number[] {
  const codes = new Set<number>();
  for (const colorName of colorNames) {
    const code = getLineCodeByColorName(colorName);
    if (code !== undefined) {
      codes.add(code);
    }
  }
  return Array.from(codes).sort((a, b) => a - b);
}

/**
 * Get contrast color (black or white) for a given hex background
 * @param hexColor - Hex color string
 * @returns "#000000" or "#ffffff"
 */
export function getContrastColor(hexColor: string): string {
  const hex = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

export function getStationByName(
  lineCode: number,
  stationName: string,
): StaticRailStation | undefined {
  const line = getRailLineByCode(lineCode);
  const normalizedNames = new Set([
    hardNormalizeString(stationName),
    hardNormalizeString(normalizeStationName(stationName)),
  ]);

  return line?.stations.find((station) =>
    [station.name, ...(station.alternativeNames ?? [])]
      .flatMap((name) => [name, normalizeStationName(name)])
      .some((name) => normalizedNames.has(hardNormalizeString(name))),
  );
}

export function getCanonicalRailStationName(
  stationName: string,
  lineCodes: number[] = [],
): string {
  const normalizedNames = new Set([
    hardNormalizeString(stationName),
    hardNormalizeString(normalizeStationName(stationName)),
  ]);

  const candidateLines =
    lineCodes.length > 0
      ? lineCodes
          .map((lineCode) => getRailLineByCode(lineCode))
          .filter((line): line is RailLineInfo => line !== undefined)
      : RAIL_LINES;

  for (const line of candidateLines) {
    for (const station of line.stations) {
      const staticNames = [
        station.name,
        ...(station.alternativeNames ?? []),
      ].flatMap((name) => [name, normalizeStationName(name)]);

      if (
        staticNames.some((name) =>
          normalizedNames.has(hardNormalizeString(name)),
        )
      ) {
        return station.name;
      }
    }
  }

  return normalizeStationName(stationName);
}

/**
 * Pre-computed line colors with background and text color
 * For use in UI components displaying line chips/badges
 */
export interface LineColorInfo {
  bg: string;
  text: string;
}

/**
 * Get color info for a line code (for UI display)
 * Returns colors suitable for displaying colored line badges/chips
 * @param code - Line code
 * @returns LineColorInfo with bg and text colors, or default gray if not found
 */
export function getLineColors(code: number): LineColorInfo {
  const line = getRailLineByCode(code);
  if (line) {
    return {
      bg: line.colorHex,
      text: getContrastColor(line.colorHex),
    };
  }
  return { bg: '#666666', text: '#FFFFFF' };
}
