import {
  isStationImageManifest,
  selectStationImage,
  StationImage,
} from './station-images';

const primary: StationImage = {
  key: 'station-images/metro/luz.avif',
  lineIds: ['1'],
  author: 'Autor',
  title: 'Luz',
  sourceUrl: 'https://commons.wikimedia.org/',
  license: 'CC0',
};
const yellow = {
  ...primary,
  key: 'station-images/metro/luz-l4.avif',
  lineIds: ['4'],
};
const train: StationImage = {
  ...primary,
  key: 'station-images/metro/luz-trens.avif',
  lineIds: undefined,
  service: 'train',
};
const images = [primary, yellow, train];

describe('station image selection', () => {
  it('selects explicitly assigned lines, including prefixed line codes', () => {
    expect(selectStationImage(images, 'L4')).toBe(yellow);
    expect(selectStationImage(images, 1)).toBe(primary);
  });

  it.each(['7', 'L8', '9', '10', '11', '12', '13', '14', '10X', 'EA'])(
    'selects the train-service photo for %s',
    (line) => {
      expect(selectStationImage(images, line)).toBe(train);
    },
  );

  it('prefers a specific train line over a train-service photo', () => {
    const coral = { ...primary, lineIds: ['11'] };
    expect(selectStationImage([...images, coral], 'L11')).toBe(coral);
  });

  it('uses a consistent primary fallback and omits absent photos', () => {
    expect(selectStationImage(images, 'L2')).toBe(primary);
    expect(selectStationImage(images)).toBe(primary);
    expect(selectStationImage([], 'L2')).toBeUndefined();
    expect(selectStationImage([train], 'L4')).toBe(train);
  });
});

describe('station image manifest', () => {
  it('accepts old manifests without terminal metadata and an empty terminal section', () => {
    const stationOnly = { version: 1, stations: { luz: images } };

    expect(isStationImageManifest(stationOnly)).toBe(true);
    expect(isStationImageManifest({ ...stationOnly, terminals: {} })).toBe(true);
  });

  it('accepts a current dynamic terminal ID with terminal-category images', () => {
    expect(
      isStationImageManifest({
        version: 1,
        stations: {},
        terminals: {
          'terminal:terminal-parque-central': [
            {
              ...primary,
              key: 'station-images/terminal/terminal-parque-central.avif',
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it.each([
    {
      terminals: {
        'terminal:terminal-parque-central': [
          { ...primary, key: 'station-images/rail/parque-central.avif' },
        ],
      },
    },
    {
      terminals: {
        'terminal:../parque-central': [
          {
            ...primary,
            key: 'station-images/terminal/parque-central.avif',
          },
        ],
      },
    },
    {
      terminals: {
        'terminal:parque-central': [
          {
            ...primary,
            key: 'station-images/terminal/parque-central.avif',
            licenseUrl: 'javascript:alert(1)',
          },
        ],
      },
    },
  ])('rejects invalid terminal metadata and unsafe proxy inputs', (fields) => {
    expect(
      isStationImageManifest({ version: 1, stations: {}, ...fields }),
    ).toBe(false);
  });
});
