import {
  getLineCodesFromColorNames,
  getRailLineByCode,
  getRailLineById,
  getStationByName,
  RAIL_LINES,
  RailLineInfo,
} from './rail-line.utils';
import { TRIVIATRENS_LIVE_DATA_ENABLED } from './transit-agency.utils';
import { ExtendedNextTrainLineCode } from './viamobilidade-stations';

export interface FavoriteRailLineOption {
  id: string;
  lineCode: number;
  lineId: string;
  stationCode: string | null;
  stationName: string;
  lineName: string;
  colorHex: string;
  nextTrainLineCode: ExtendedNextTrainLineCode | null;
}

const NEXT_TRAIN_LINE_IDS = new Set<string>([
  'L4',
  'L8',
  'L9',
  'L10',
  ...(TRIVIATRENS_LIVE_DATA_ENABLED ? ['L11', 'L12', 'L13'] : []),
]);

export function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function normalizeHexColor(
  value: string | undefined,
  fallback: string,
): string {
  const color = value || fallback;
  return color.startsWith('#') ? color : `#${color}`;
}

export function sortRailLineCodes(codes: number[]): number[] {
  const order = new Map(RAIL_LINES.map((line, index) => [line.code, index]));

  return [...codes].sort(
    (a, b) =>
      (order.get(a) ?? Number.MAX_VALUE) - (order.get(b) ?? Number.MAX_VALUE),
  );
}

export function getNextTrainLineCode(
  lineId: string,
): ExtendedNextTrainLineCode | null {
  return NEXT_TRAIN_LINE_IDS.has(lineId)
    ? (lineId as ExtendedNextTrainLineCode)
    : null;
}

export function getRailLineCodeFromFavorite(
  id: string,
): number | undefined {
  const line = id.startsWith('L')
    ? getRailLineById(id)
    : getRailLineByCode(parseInt(id, 10));

  return line?.code;
}

export function getRailLineFavorites(ids: string[]): RailLineInfo[] {
  return uniqueIds(ids)
    .map((id) => getRailLineCodeFromFavorite(id))
    .filter((code): code is number => code !== undefined)
    .map((code) => getRailLineByCode(code))
    .filter((line): line is RailLineInfo => Boolean(line));
}

export function createFavoriteRailLineOptions(
  lineNames: string[],
  stationName = '',
): FavoriteRailLineOption[] {
  return getLineCodesFromColorNames(lineNames)
    .map((lineCode) => {
      const line = getRailLineByCode(lineCode);

      if (!line) {
        return null;
      }

      const station = stationName
        ? getStationByName(lineCode, stationName)
        : undefined;

      return {
        id: line.lineId,
        lineCode,
        lineId: line.lineId,
        stationCode: station?.code ?? null,
        stationName,
        lineName: line.fullName,
        colorHex: line.colorHex,
        nextTrainLineCode: getNextTrainLineCode(line.lineId),
      };
    })
    .filter((line): line is FavoriteRailLineOption => Boolean(line))
    .sort((a, b) => a.lineCode - b.lineCode);
}

export function mergeFavoriteRailLineOptions(
  current: FavoriteRailLineOption[],
  incoming: FavoriteRailLineOption[],
): FavoriteRailLineOption[] {
  const byId = new Map(current.map((line) => [line.id, line]));

  for (const line of incoming) {
    byId.set(line.id, line);
  }

  return [...byId.values()].sort((a, b) => a.lineCode - b.lineCode);
}

export function hasFetchableNextTrain(
  line: FavoriteRailLineOption,
): line is FavoriteRailLineOption & {
  stationCode: string;
  nextTrainLineCode: ExtendedNextTrainLineCode;
} {
  return line.stationCode !== null && line.nextTrainLineCode !== null;
}
