import { describe, expect, it } from '@jest/globals';

import {
  getStationDisplayName,
  mergeByStationName,
  shouldMergeStations,
} from './station-merge.utils';

interface TestStation {
  id: string;
  name: string;
}

describe('station-merge.utils', () => {
  describe('getStationDisplayName()', () => {
    it('preserves line qualifiers for non-mergeable station exceptions', () => {
      expect(getStationDisplayName('LAPA (LINHA 7)')).toBe('LAPA (linha 7)');
    });

    it('adds a line qualifier for merge exceptions when line metadata is separate', () => {
      expect(getStationDisplayName('Lapa', 8)).toBe('Lapa (linha 8)');
    });

    it('still normalizes regular line-qualified stations', () => {
      expect(getStationDisplayName('Santo Amaro (linha 5)')).toBe(
        'Santo Amaro',
      );
    });

    it('distinguishes Água Branca by line, including unaccented source names', () => {
      expect(getStationDisplayName('Água Branca', 6)).toBe('Água Branca (linha 6)');
      expect(getStationDisplayName('AGUA BRANCA (LINHA 7)')).toBe('AGUA BRANCA (linha 7)');
    });
  });

  describe('shouldMergeStations()', () => {
    it.each(['–', '—', '‐', '‑', '‒', '―'])('merges Palmeiras-Barra Funda with a %s separator', (dash) => {
      expect(shouldMergeStations(`Palmeiras ${dash} Barra Funda`, 'Palmeiras-Barra Funda')).toBe(true);
      expect(getStationDisplayName(`Palmeiras${dash}Barra Funda`)).toBe('Palmeiras-Barra Funda');
    });

    it('does not merge Água Branca line 6 and line 7', () => {
      expect(shouldMergeStations('Água Branca (linha 6)', 'Água Branca (linha 7)')).toBe(false);
      expect(shouldMergeStations('AGUA BRANCA', 'AGUA BRANCA')).toBe(false);
    });

    it('does not merge line-qualified Lapa stations', () => {
      expect(shouldMergeStations('Lapa (linha 7)', 'Lapa (linha 8)')).toBe(
        false,
      );
    });

    it('still merges equivalent intermodal station names', () => {
      expect(shouldMergeStations('Pinheiros Metrô', 'Pinheiros CPTM')).toBe(
        true,
      );
    });
  });

  describe('mergeByStationName()', () => {
    it('merges dash variants while keeping Água Branca lines separate', () => {
      const result = mergeByStationName(
        [
          { id: 'l3', name: 'Palmeiras-Barra Funda' },
          { id: 'l8', name: 'Palmeiras–Barra Funda' },
          { id: 'l6', name: 'Água Branca (linha 6)' },
          { id: 'l7', name: 'Água Branca (linha 7)' },
        ],
        (station) => station.name,
        (group) => ({ id: group.map((station) => station.id).join(','), name: group[0].name }),
      );

      expect(result.map((station) => station.id)).toEqual(['l3,l8', 'l6', 'l7']);
    });

    it('keeps non-mergeable stations with the same normalized name separate', () => {
      const stations: TestStation[] = [
        { id: 'l7', name: 'Lapa (linha 7)' },
        { id: 'l8', name: 'Lapa (linha 8)' },
      ];

      const result = mergeByStationName(
        stations,
        (station) => station.name,
        (group) => ({
          id: group.map((station) => station.id).join(','),
          name: group[0].name,
        }),
      );

      expect(result).toHaveLength(2);
      expect(result.map((station) => station.id)).toEqual(['l7', 'l8']);
    });

    it('still merges stations that should be grouped together', () => {
      const stations: TestStation[] = [
        { id: 'metro', name: 'Pinheiros Metrô' },
        { id: 'cptm', name: 'Pinheiros CPTM' },
      ];

      const result = mergeByStationName(
        stations,
        (station) => station.name,
        (group) => ({
          id: group.map((station) => station.id).join(','),
          name: group[0].name,
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('metro,cptm');
    });
  });
});
