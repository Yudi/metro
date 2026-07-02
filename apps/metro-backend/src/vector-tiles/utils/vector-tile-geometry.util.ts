import { TileBounds } from '../vector-tile.types';

const WEB_MERCATOR_HALF_WORLD = 20037508.34;

/**
 * Convert XYZ tile coordinates to Web Mercator bounds.
 */
export function tileToBounds(z: number, x: number, y: number): TileBounds {
  const n = Math.pow(2, z);
  const worldSize = WEB_MERCATOR_HALF_WORLD * 2;
  const tileSize = worldSize / n;

  const minX = -WEB_MERCATOR_HALF_WORLD + x * tileSize;
  const maxX = minX + tileSize;
  const maxY = WEB_MERCATOR_HALF_WORLD - y * tileSize;
  const minY = maxY - tileSize;

  return { minX, minY, maxX, maxY };
}
