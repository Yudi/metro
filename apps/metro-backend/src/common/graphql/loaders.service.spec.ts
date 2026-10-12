import { GeometryData } from '../../geography/entities/geography.entity';
import { BusDirectionService } from '../../geography/services/bus-direction.service';
import { LoadersService } from './loaders.service';

const geometry: GeometryData = {
  type: 'LineString',
  coordinates: [[-46.63, -23.55], [-46.64, -23.56]],
};

describe('LoadersService bus direction geometry', () => {
  it('memoizes canonical shape identities within one request only', async () => {
    const directions = {
      geometries: jest.fn(async (shapeIdsByRequest: readonly string[][]) =>
        shapeIdsByRequest.map(() => geometry),
      ),
    };
    const service = new LoadersService({} as never, directions as unknown as BusDirectionService);
    const firstRequest = service.createLoaders();
    const secondRequest = service.createLoaders();

    await expect(Promise.all([
      firstRequest.busDirectionGeometryLoader.load(['shape-b', 'shape-a']),
      firstRequest.busDirectionGeometryLoader.load(['shape-a', 'shape-b', 'shape-a']),
    ])).resolves.toEqual([geometry, geometry]);
    expect(directions.geometries).toHaveBeenCalledTimes(1);
    expect(directions.geometries).toHaveBeenCalledWith([['shape-a', 'shape-b']]);

    await secondRequest.busDirectionGeometryLoader.load(['shape-a', 'shape-b']);
    expect(directions.geometries).toHaveBeenCalledTimes(2);
  });

  it('caps each geometry batch at 500 shape identities', async () => {
    const directions = {
      geometries: jest.fn(async (shapeIdsByRequest: readonly string[][]) =>
        shapeIdsByRequest.map(() => null),
      ),
    };
    const service = new LoadersService({} as never, directions as unknown as BusDirectionService);
    const loader = service.createLoaders().busDirectionGeometryLoader;

    await Promise.all(Array.from({ length: 501 }, (_, index) =>
      loader.load([`shape-${index}`]),
    ));

    expect(directions.geometries).toHaveBeenCalledTimes(2);
    expect(directions.geometries.mock.calls.map(([shapeIds]) => shapeIds.length)).toEqual([
      500,
      1,
    ]);
  });

  it('caps unique geometry work at 1,000 identities per request', async () => {
    const directions = {
      geometries: jest.fn(async (shapeIdsByRequest: readonly string[][]) =>
        shapeIdsByRequest.map(() => geometry),
      ),
    };
    const service = new LoadersService({} as never, directions as unknown as BusDirectionService);
    const loader = service.createLoaders().busDirectionGeometryLoader;

    const results = await Promise.all(Array.from({ length: 1_001 }, (_, index) =>
      loader.load([`shape-${index}`]),
    ));

    expect(directions.geometries).toHaveBeenCalledTimes(2);
    expect(directions.geometries.mock.calls.map(([shapeIds]) => shapeIds.length)).toEqual([
      500,
      500,
    ]);
    expect(results.slice(0, 1_000).every((result) => result === geometry)).toBe(true);
    expect(results[1_000]).toBeNull();
  });
});
