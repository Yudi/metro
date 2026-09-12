import { hasNextTrainIntegration } from './cptm-stations';
import { getNextTrainLineCode } from '../../../rail/rail-favorite-view.utils';
import {
  findNextTrainStations,
  getNextTrainStationName,
  hasNextTrainInformation,
  isValidNextTrainStation,
} from './viamobilidade-stations';

describe('scheduled rail information availability', () => {
  it('supports the schedule display without enabling a live integration', () => {
    expect(hasNextTrainInformation('L1')).toBe(true);
    expect(hasNextTrainIntegration('L1')).toBe(false);
    expect(getNextTrainLineCode('L1')).toBe('L1');
    expect(isValidNextTrainStation('L1', 'LUZ')).toBe(true);
    expect(getNextTrainStationName('L1', 'LUZ')).toBe('Luz');
  });

  it('resolves both sides of an interchange and deduplicates line requests', () => {
    expect(findNextTrainStations('Luz', [4, 1, 1])).toEqual([
      { lineCode: 'L1', stationCode: 'LUZ' },
      { lineCode: 'L4', stationCode: 'LUZ' },
    ]);
  });

  it('preserves line membership, aliases, and line suffix matching', () => {
    expect(findNextTrainStations('Mendes / Vila Natal', [9])).toEqual([
      { lineCode: 'L9', stationCode: 'MVN' },
    ]);
    expect(findNextTrainStations('Lapa (linha 7)', [7])).toEqual([
      { lineCode: 'L7', stationCode: 'LPA' },
    ]);
    expect(isValidNextTrainStation('L1', 'VAG')).toBe(false);
  });

  it.each(['L14', 'L16', 'L99', 'L01', 'constructor', 'toString', '__proto__'])(
    'rejects unsupported or noncanonical line %s',
    (lineCode) => {
      expect(hasNextTrainInformation(lineCode)).toBe(false);
      expect(isValidNextTrainStation(lineCode, 'LUZ')).toBe(false);
      expect(getNextTrainStationName(lineCode, 'LUZ')).toBeUndefined();
    },
  );
});
