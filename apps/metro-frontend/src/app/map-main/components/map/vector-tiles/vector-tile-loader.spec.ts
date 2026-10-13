import type Tile from 'ol/Tile';
import { loadVectorTile } from './vector-tile-loader';

describe('vector tile loading', () => {
  let request: XMLHttpRequest;
  const readFeatures = jest.fn();
  const tile = {
    setLoader: jest.fn((loader: (extent: number[], resolution: number, projection: unknown) => void) => {
      loader([0, 0, 1, 1], 1, 'projection');
    }),
    getFormat: () => ({ readFeatures }),
    setFeatures: jest.fn(),
    onError: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    readFeatures.mockReset();
    request = new XMLHttpRequest();
    jest.spyOn(request, 'open').mockImplementation(() => undefined);
    jest.spyOn(request, 'send').mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'XMLHttpRequest').mockImplementation(() => request);
    loadVectorTile(tile as unknown as Tile, '/api/tiles/test.pbf');
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(['timeout', 'error', 'abort'])('releases the loading slot on %s', (event) => {
    expect(request.timeout).toBe(20_000);
    request.dispatchEvent(new Event(event));
    expect(tile.onError).toHaveBeenCalledTimes(1);
    expect(tile.setFeatures).not.toHaveBeenCalled();
  });

  it('decodes features in the tile extent and map projection', () => {
    const data = new ArrayBuffer(8);
    const features = [{ id: 'station' }];
    Object.defineProperties(request, { status: { value: 200 }, response: { value: data } });
    readFeatures.mockReturnValue(features);
    request.dispatchEvent(new Event('load'));
    expect(readFeatures).toHaveBeenCalledWith(data, { extent: [0, 0, 1, 1], featureProjection: 'projection' });
    expect(tile.setFeatures).toHaveBeenCalledWith(features);
  });

  it('accepts empty successful tiles', () => {
    Object.defineProperty(request, 'status', { value: 204 });
    request.dispatchEvent(new Event('load'));
    expect(tile.setFeatures).toHaveBeenCalledWith([]);
    expect(readFeatures).not.toHaveBeenCalled();
  });

  it.each([404, 500])('settles HTTP %s as a tile error', (status) => {
    Object.defineProperty(request, 'status', { value: status });
    request.dispatchEvent(new Event('load'));
    expect(tile.onError).toHaveBeenCalledTimes(1);
  });

  it('settles malformed tile data as an error', () => {
    Object.defineProperties(request, { status: { value: 200 }, response: { value: new ArrayBuffer(8) } });
    readFeatures.mockImplementation(() => { throw new Error('Invalid MVT'); });
    request.dispatchEvent(new Event('load'));
    expect(tile.onError).toHaveBeenCalledTimes(1);
  });
});
