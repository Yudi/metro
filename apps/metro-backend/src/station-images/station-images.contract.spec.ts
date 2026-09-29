import {
  buildStationImageObjectKey,
  parseStationImageManifest,
} from './station-images.contract';

describe('station image metadata contract', () => {
  it('accepts the public manifest shape and station image keys', () => {
    const manifest = parseStationImageManifest(
      JSON.stringify({
        version: 1,
        stations: {
          luz: [
            {
              key: 'station-images/metro/luz.avif',
              lineIds: ['1', '4'],
              author: 'Photographer',
              title: 'Luz station platform',
              sourceUrl: 'https://example.com/source',
              license: 'CC BY 4.0',
              licenseUrl: 'https://example.com/license',
            },
          ],
        },
      }),
    );

    expect(manifest.stations['luz']?.[0]?.key).toBe(
      'station-images/metro/luz.avif',
    );
  });

  it.each([
    'station-images/metro/../secret.avif',
    'station-images/private/luz.avif',
    'station-images/metro/luz.jpg',
  ])('rejects an out-of-scope manifest image key: %s', (key) => {
    expect(() =>
      parseStationImageManifest(
        JSON.stringify({
          version: 1,
          stations: {
            luz: [
              {
                key,
                author: 'Photographer',
                title: 'Luz station platform',
                sourceUrl: 'https://example.com/source',
                license: 'CC BY 4.0',
              },
            ],
          },
        }),
      ),
    ).toThrow('invalid image entry');
  });

  it('only builds keys for known categories and a single AVIF filename', () => {
    expect(buildStationImageObjectKey('metro', 'luz-l4.avif')).toBe(
      'station-images/metro/luz-l4.avif',
    );
    expect(() => buildStationImageObjectKey('../metro', 'luz.avif')).toThrow();
    expect(() => buildStationImageObjectKey('metro', '../secret.avif')).toThrow();
  });
});
