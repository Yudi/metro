import {
  mergeFavoriteRailLineOptions,
  sortRailLineCodes,
} from '@metro/shared/utils';
import type { RailStationInsight } from './insights-dashboard.types';

export function addRailStationGroup(
  groups: Map<string, RailStationInsight>,
  key: string,
  station: RailStationInsight,
): void {
  const existing = groups.get(key);
  if (!existing) {
    groups.set(key, {
      ...station,
      lineCodes: sortRailLineCodes(station.lineCodes),
    });
    return;
  }

  groups.set(key, {
    ...existing,
    lineCodes: sortRailLineCodes([
      ...new Set([...existing.lineCodes, ...station.lineCodes]),
    ]),
    lines: mergeFavoriteRailLineOptions(existing.lines, station.lines),
  });
}
