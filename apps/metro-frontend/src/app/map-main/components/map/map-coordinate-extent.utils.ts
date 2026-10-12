import type { Extent } from 'ol/extent';
import { fromLonLat } from 'ol/proj';

const MAX_MERCATOR_LATITUDE = 85.05112878;
const SINGLE_POINT_PADDING_METERS = 150;

export function getProjectedCoordinateExtent(
  coordinates: readonly (readonly [number, number])[],
): Extent | null {
  const valid = coordinates.filter(
    ([longitude, latitude]) =>
      Number.isFinite(longitude) &&
      Number.isFinite(latitude) &&
      Math.abs(longitude) <= 180 &&
      Math.abs(latitude) <= MAX_MERCATOR_LATITUDE,
  );
  if (valid.length === 0) return null;

  const projected = valid.map(([longitude, latitude]) =>
    fromLonLat([longitude, latitude]),
  );
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  if (minX === maxX && minY === maxY) {
    return [
      minX - SINGLE_POINT_PADDING_METERS,
      minY - SINGLE_POINT_PADDING_METERS,
      maxX + SINGLE_POINT_PADDING_METERS,
      maxY + SINGLE_POINT_PADDING_METERS,
    ];
  }

  return [minX, minY, maxX, maxY];
}
