import { describe, expect, it } from '@jest/globals';

import { getStaticRailStationsByLine, L6_STATIONS } from './rail-stations.entity';
import { hardNormalizeString } from './strings.utils';

describe('Line 6 static stations', () => {
  it('contains every station from Brasilândia to São Joaquim in order', () => {
    expect(L6_STATIONS).toEqual([
      expect.objectContaining({ code: 'BRA', name: 'Brasilândia' }),
      expect.objectContaining({ code: 'MTL', name: 'Maristela' }),
      expect.objectContaining({
        code: 'IHP',
        name: 'Itaberaba-Hospital Vila Penteado',
      }),
      expect.objectContaining({ code: 'JOP', name: 'João Paulo I' }),
      expect.objectContaining({ code: 'FGO', name: 'Freguesia do Ó' }),
      expect.objectContaining({ code: 'STM', name: 'Santa Marina' }),
      expect.objectContaining({ code: 'AGB', name: 'Água Branca' }),
      expect.objectContaining({ code: 'SEP', name: 'Sesc-Pompeia' }),
      expect.objectContaining({ code: 'PDZ', name: 'Perdizes' }),
      expect.objectContaining({ code: 'PUC', name: 'PUC-Cardoso de Almeida' }),
      expect.objectContaining({ code: 'FAAP', name: 'FAAP-Pacaembu' }),
      expect.objectContaining({ code: 'HMK', name: 'Higienópolis-Mackenzie' }),
      expect.objectContaining({ code: 'BIS', name: '14 Bis-Saracura' }),
      expect.objectContaining({ code: 'BVT', name: 'Bela Vista' }),
      expect.objectContaining({ code: 'JQM', name: 'São Joaquim' }),
    ]);
    expect(getStaticRailStationsByLine('L6')).toBe(L6_STATIONS);
  });

  it('keeps names ASCII-hyphenated and alternatives meaningfully distinct', () => {
    for (const station of L6_STATIONS) {
      expect(station.name).not.toContain('–');

      for (const alternativeName of station.alternativeNames ?? []) {
        expect(alternativeName).not.toContain('–');
        expect(hardNormalizeString(alternativeName)).not.toBe(
          hardNormalizeString(station.name),
        );
      }
    }
  });
});
