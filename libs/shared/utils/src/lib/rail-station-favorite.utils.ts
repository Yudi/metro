import { hardNormalizeString } from './strings.utils';
import { normalizeStationName } from './station-name.utils';

const RAIL_STATION_FAVORITE_PREFIX = 'station:';

export function getRailStationFavoriteKey(stationName: string): string {
  return `${RAIL_STATION_FAVORITE_PREFIX}${getRailStationIdentityKey(stationName)}`;
}

export function getRailStationIdentityFromFavoriteKey(
  id: string,
): string | undefined {
  if (!id.startsWith(RAIL_STATION_FAVORITE_PREFIX)) {
    return undefined;
  }

  const identity = id.slice(RAIL_STATION_FAVORITE_PREFIX.length);
  return identity || undefined;
}

export function getRailStationIdentityKey(stationName: string): string {
  return hardNormalizeString(normalizeStationName(stationName));
}
