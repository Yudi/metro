import {
  isStationImageManifest,
  selectStationImage,
  selectStopImage,
  StationImage,
} from './station-images';
import { IMAGE_ENTRY_FIXTURE, MEDIA_TERMINAL_FIXTURE } from '@metro/shared/admin-contracts';

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
  it('uses the selected default after line/service assignments and before legacy order', () => {
    expect(selectStationImage([...images, IMAGE_ENTRY_FIXTURE], '2')).toBe(IMAGE_ENTRY_FIXTURE);
    expect(selectStationImage([...images, IMAGE_ENTRY_FIXTURE], '4')).toBe(yellow);
    expect(selectStationImage([...images, IMAGE_ENTRY_FIXTURE], '11')).toBe(train);
  });
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

describe('stop image selection', () => {
  const scoped = { ...IMAGE_ENTRY_FIXTURE, isDefault: false, stopIds: [MEDIA_TERMINAL_FIXTURE.scopes[0].id] };

  it('prioritizes the current stop, then the explicit default', () => {
    expect(selectStopImage([IMAGE_ENTRY_FIXTURE, scoped], MEDIA_TERMINAL_FIXTURE.scopes[0].id)).toBe(scoped);
    expect(selectStopImage([scoped, IMAGE_ENTRY_FIXTURE], 'other')).toBe(IMAGE_ENTRY_FIXTURE);
    expect(selectStopImage([scoped], 'other')).toBeUndefined();
    expect(selectStopImage([scoped])).toBeUndefined();
  });

  it('preserves legacy generic terminal fallback', () => {
    const legacy = { ...primary, lineIds: undefined };
    expect(selectStopImage([scoped, legacy], 'other')).toBe(legacy);
  });
});

describe('station image manifest', () => {
  it('accepts images without a source URL', () => {
    const imageWithoutSource = { ...primary };
    delete imageWithoutSource.sourceUrl;

    expect(
      isStationImageManifest({
        version: 1,
        stations: { luz: [imageWithoutSource] },
      }),
    ).toBe(true);
  });

  it('accepts stop images and rejects malformed selectors and duplicate keys', () => {
    const stop = { ...IMAGE_ENTRY_FIXTURE, key: 'station-images/stop/test.avif' };
    const metadata = { version: 1, stations: {}, stops: { 'stop:sptrans:10001': [stop] } };
    expect(isStationImageManifest(metadata)).toBe(true);
    expect(isStationImageManifest({ ...metadata, stops: { 'stop:sptrans:10001': [{ ...stop, isDefault: 'true' }] } })).toBe(false);
    expect(isStationImageManifest({ ...metadata, stops: { 'stop:sptrans:10001': [{ ...stop, stopIds: ['\n'] }] } })).toBe(false);
    expect(isStationImageManifest({ ...metadata, stops: { 'stop:sptrans:10001': [stop, stop] } })).toBe(false);
  });
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
