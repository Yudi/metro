import { TransitCity } from './city';
import { SAO_PAULO_CITY } from './sp';

export const DEFAULT_CITY: TransitCity = SAO_PAULO_CITY;
export const SUPPORTED_CITIES: readonly TransitCity[] = [SAO_PAULO_CITY];

export function getCity(id: string): TransitCity | undefined {
  return SUPPORTED_CITIES.find((city) => city.id === id);
}

/** Build an absolute application path without losing query strings or fragments. */
export function cityPath(path = '', cityId = DEFAULT_CITY.id): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cityId)) {
    throw new Error('Invalid city identifier');
  }
  if (path.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    throw new Error('Expected an internal application path');
  }
  const relative = path.replace(/^\/+/, '');
  if (relative === cityId || relative.startsWith(`${cityId}/`) ||
      relative.startsWith(`${cityId}?`) || relative.startsWith(`${cityId}#`)) {
    return `/${relative}`;
  }
  return `/${cityId}${relative && !/^[?#]/.test(relative) ? '/' : ''}${relative}`;
}
