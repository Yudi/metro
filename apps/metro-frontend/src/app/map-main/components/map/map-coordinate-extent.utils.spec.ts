import { getProjectedCoordinateExtent } from './map-coordinate-extent.utils';
import { fromLonLat } from 'ol/proj';

describe('getProjectedCoordinateExtent', () => {
  it('returns null when no valid geographic coordinates are supplied', () => {
    expect(getProjectedCoordinateExtent([])).toBeNull();
    expect(
      getProjectedCoordinateExtent([
        [Number.NaN, -23.5],
        [181, -23.5],
        [-46.6, 86],
      ]),
    ).toBeNull();
  });

  it('adds a small extent around one physical stop', () => {
    const projected = fromLonLat([-46.63, -23.55]);
    const extent = getProjectedCoordinateExtent([[-46.63, -23.55]]);

    expect(extent).not.toBeNull();
    expect(extent?.[0]).toBeLessThan(projected[0]);
    expect(extent?.[1]).toBeLessThan(projected[1]);
    expect(extent?.[2]).toBeGreaterThan(projected[0]);
    expect(extent?.[3]).toBeGreaterThan(projected[1]);
  });

  it('fits the projected bounds of all supplied stop points', () => {
    const first = fromLonLat([-46.64, -23.56]);
    const second = fromLonLat([-46.62, -23.54]);

    expect(
      getProjectedCoordinateExtent([
        [-46.64, -23.56],
        [-46.62, -23.54],
      ]),
    ).toEqual([
      Math.min(first[0], second[0]),
      Math.min(first[1], second[1]),
      Math.max(first[0], second[0]),
      Math.max(first[1], second[1]),
    ]);
  });
});
