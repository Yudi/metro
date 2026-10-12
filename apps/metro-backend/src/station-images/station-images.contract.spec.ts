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
    expect(manifest.terminals).toBeUndefined();
  });

  it('preserves punctuation in canonical rail station identities', () => {
    const manifest = parseStationImageManifest(
      JSON.stringify({
        version: 1,
        stations: {
          'engº.goulart': [
            {
              key: 'station-images/rail/engenheiro-goulart.avif',
              author: 'Photographer',
              title: 'Engenheiro Goulart',
              sourceUrl: 'https://example.com/source',
              license: 'CC BY 4.0',
            },
          ],
        },
      }),
    );

    expect(manifest.stations['engº.goulart']).toHaveLength(1);
  });

  it('accepts absent or empty terminal metadata for existing manifests', () => {
    const stationImages = {
      key: 'station-images/metro/luz.avif',
      author: 'Photographer',
      title: 'Luz station platform',
      sourceUrl: 'https://example.com/source',
      license: 'CC BY 4.0',
    };

    expect(
      parseStationImageManifest(
        JSON.stringify({ version: 1, stations: { luz: [stationImages] } }),
      ).terminals,
    ).toBeUndefined();
    expect(
      parseStationImageManifest(
        JSON.stringify({
          version: 1,
          stations: { luz: [stationImages] },
          terminals: {},
        }),
      ).terminals,
    ).toEqual({});
  });

  it('accepts dynamic terminal IDs only in the terminal namespace and category', () => {
    const manifest = parseStationImageManifest(
      JSON.stringify({
        version: 1,
        stations: {},
        terminals: {
          'terminal:terminal-parque-central': [
            {
              key: 'station-images/terminal/central.avif',
              author: 'Photographer',
              title: 'Terminal Central',
              sourceUrl: 'https://example.com/source',
              license: 'CC BY 4.0',
              licenseUrl: 'https://creativecommons.org/licenses/by/4.0',
            },
          ],
        },
      }),
    );

    expect(
      manifest.terminals?.['terminal:terminal-parque-central']?.[0]?.key,
    ).toBe(
      'station-images/terminal/central.avif',
    );
    expect(buildStationImageObjectKey('terminal', 'central.avif')).toBe(
      'station-images/terminal/central.avif',
    );
  });

  it('accepts full namespaced stop identities and stop image keys', () => {
    const manifest = parseStationImageManifest(
      JSON.stringify({
        version: 1,
        stations: {},
        stops: {
          'stop:sptrans:10001': [
            {
              key: 'station-images/stop/stop-fixture.avif',
              author: 'Photographer',
              title: 'Parada de teste',
              sourceUrl: 'https://example.com/source',
              license: 'CC BY 4.0',
              isDefault: true,
            },
          ],
        },
      }),
    );

    expect(manifest.stops?.['stop:sptrans:10001']?.[0]?.key).toBe(
      'station-images/stop/stop-fixture.avif',
    );
    expect(buildStationImageObjectKey('stop', 'stop-fixture.avif')).toBe(
      'station-images/stop/stop-fixture.avif',
    );
  });

  it.each([
    [
      'invalid terminal ID',
      'terminal:../central',
      'station-images/terminal/central.avif',
    ],
    [
      'terminal with rail key',
      'terminal:terminal-parque-central',
      'station-images/rail/central.avif',
    ],
  ])('rejects %s metadata', (_description, identity, key) => {
    expect(() =>
      parseStationImageManifest(
        JSON.stringify({
          version: 1,
          stations: {},
          terminals: {
            [identity]: [
              {
                key,
                author: 'Photographer',
                title: 'Terminal Central',
                sourceUrl: 'https://example.com/source',
                license: 'CC BY 4.0',
              },
            ],
          },
        }),
      ),
    ).toThrow();
  });

  it('rejects terminal-category images placed in the station namespace', () => {
    expect(() =>
      parseStationImageManifest(
        JSON.stringify({
          version: 1,
          stations: {
            luz: [
              {
                key: 'station-images/terminal/central.avif',
                author: 'Photographer',
                title: 'Terminal Central',
                sourceUrl: 'https://example.com/source',
                license: 'CC BY 4.0',
              },
            ],
          },
        }),
      ),
    ).toThrow('invalid image entry');
  });

  it.each([
    'station-images/metro/../secret.avif',
    'station-images/private/luz.avif',
    'station-images/metro/luz.jpg',
    'station-images/terminal/../secret.avif',
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

  it('rejects non-web source and license URLs', () => {
    expect(() =>
      parseStationImageManifest(
        JSON.stringify({
          version: 1,
          stations: {
            luz: [
              {
                key: 'station-images/metro/luz.avif',
                author: 'Photographer',
                title: 'Luz station platform',
                sourceUrl: 'https://example.com/source',
                license: 'CC BY 4.0',
                licenseUrl: 'javascript:alert(1)',
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
    expect(() =>
      buildStationImageObjectKey('metro', '../secret.avif'),
    ).toThrow();
  });
});
