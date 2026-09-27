import {
  AGENCIES_DATA,
  getAgencyIconPath,
  getContrastColor,
  getLineCodesFromColorNames,
  RAIL_LINES,
} from '@metro/shared/utils';
import type { TransitAgency } from '@metro/shared/utils';
import type { MapPanelAgencyLineGroup } from './map-panel.service';

export function buildMapPanelAgencyLineGroups(
  routeShortNames: string[],
): MapPanelAgencyLineGroup[] {
  const lineCodes = new Set(getLineCodesFromColorNames(routeShortNames));

  for (const lineName of routeShortNames) {
    const numberedLine = lineName.match(
      /^\s*0?(\d{1,2})(?:\s*[-–—:]|\s+|$)/,
    );
    const code = numberedLine ? Number(numberedLine[1]) : undefined;
    if (code !== undefined && RAIL_LINES.some((line) => line.code === code)) {
      lineCodes.add(code);
    }
  }

  const linesByAgency = new Map<
    TransitAgency,
    (typeof RAIL_LINES)[number][]
  >();

  for (const line of RAIL_LINES) {
    if (!lineCodes.has(line.code)) {
      continue;
    }

    const agencyLines = linesByAgency.get(line.agency) ?? [];
    agencyLines.push(line);
    linesByAgency.set(line.agency, agencyLines);
  }

  return Array.from(linesByAgency, ([agency, lines]) => {
    const agencyName = AGENCIES_DATA[agency].shortName;
    const sortedLines = lines.sort((left, right) => left.code - right.code);

    return {
      agency,
      iconPath: getAgencyIconPath(agency),
      ariaLabel: `${agencyName}: ${sortedLines
        .map((line) => `Linha ${line.code} ${line.colorName}`)
        .join(', ')}`,
      lines: sortedLines.map((line) => ({
        code: line.code,
        backgroundColor: line.colorHex,
        textColor: getContrastColor(line.colorHex),
      })),
    };
  }).sort((left, right) => left.lines[0].code - right.lines[0].code);
}
