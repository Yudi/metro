import { L1_STATIONS } from './lines/rail-stations-l1';
import { L2_STATIONS } from './lines/rail-stations-l2';
import { L3_STATIONS } from './lines/rail-stations-l3';
import { L4_STATIONS } from './lines/rail-stations-l4';
import { L5_STATIONS } from './lines/rail-stations-l5';
import { L6_STATIONS } from './lines/rail-stations-l6';
import { L7_STATIONS } from './lines/rail-stations-l7';
import { L8_STATIONS } from './lines/rail-stations-l8';
import { L9_STATIONS } from './lines/rail-stations-l9';
import { L10_STATIONS } from './lines/rail-stations-l10';
import { L11_STATIONS } from './lines/rail-stations-l11';
import { L12_STATIONS } from './lines/rail-stations-l12';
import { L13_STATIONS } from './lines/rail-stations-l13';
import { L15_STATIONS } from './lines/rail-stations-l15';
import { L17_STATIONS } from './lines/rail-stations-l17';
import type { StaticRailStation } from '../../../../rail/stations/rail-stations.types';

export {
  L1_STATIONS,
  L2_STATIONS,
  L3_STATIONS,
  L4_STATIONS,
  L5_STATIONS,
  L6_STATIONS,
  L7_STATIONS,
  L8_STATIONS,
  L9_STATIONS,
  L10_STATIONS,
  L11_STATIONS,
  L12_STATIONS,
  L13_STATIONS,
  L15_STATIONS,
  L17_STATIONS,
};
export type { StaticRailStation } from '../../../../rail/stations/rail-stations.types';

const STATIC_RAIL_STATIONS_BY_LINE: Readonly<
  Record<string, readonly StaticRailStation[]>
> = {
  L1: L1_STATIONS,
  L2: L2_STATIONS,
  L3: L3_STATIONS,
  L4: L4_STATIONS,
  L5: L5_STATIONS,
  L6: L6_STATIONS,
  L7: L7_STATIONS,
  L8: L8_STATIONS,
  L9: L9_STATIONS,
  L10: L10_STATIONS,
  L11: L11_STATIONS,
  L12: L12_STATIONS,
  L13: L13_STATIONS,
  L15: L15_STATIONS,
  L17: L17_STATIONS,
};

export function getStaticRailStationsByLine(
  lineCode: string,
): readonly StaticRailStation[] | undefined {
  return STATIC_RAIL_STATIONS_BY_LINE[lineCode];
}
