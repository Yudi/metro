import { describe, expect, it } from '@jest/globals';
import type { RailLineDatasetConfig } from '../config/rail-datasets.config';
import {
  selectRailStations,
  type DatasetRailStation,
} from './rail-station-interop.utils';

function station(
  id: number,
  name: string,
  lineCode: number,
  latitude = -23.55,
  longitude = -46.63,
): DatasetRailStation {
  return {
    id,
    name,
    line: `Linha ${lineCode}`,
    lineCode,
    latitude,
    longitude,
  };
}

function dataset(
  lineCode: number,
  source: 'geosampa' | 'sptrans',
  supplementalStationNames?: readonly string[],
): readonly RailLineDatasetConfig[] {
  return [
    {
      lineCode,
      source,
      gtfsRouteIds: [],
      ...(supplementalStationNames ? { supplementalStationNames } : {}),
    },
  ];
}

describe('selectRailStations', () => {
  it('uses configured SPTrans lines 6 and 17 while retaining GeoSampa line 10', () => {
    const result = selectRailStations(
      [
        station(610, 'L6 GeoSampa', 6),
        station(1010, 'São Caetano', 10),
        station(1710, 'Campo Belo', 17),
      ],
      [
        station(660, 'L6 SPTrans', 6),
        station(1060, 'Other L10 station', 10),
        station(1760, 'Campo Belo', 17, -23.5505, -46.63),
      ],
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 660,
          name: 'L6 SPTrans',
          lineCode: 6,
        }),
        expect.objectContaining({
          id: 1710,
          name: 'Campo Belo',
          lineCode: 17,
          mergedIds: [1710, 1760],
        }),
        expect.objectContaining({
          id: 1010,
          name: 'São Caetano',
          lineCode: 10,
        }),
      ]),
    );
    expect(result).toHaveLength(3);
    expect(result.some((candidate) => candidate.id === 1060)).toBe(false);
  });

  it('falls back only when the configured source has no stations for that line', () => {
    const result = selectRailStations(
      [
        station(100, 'Fallback GeoSampa', 10),
        station(101, 'Stale GeoSampa station', 6),
      ],
      [station(600, 'Chosen SPTrans station', 6)],
      [
        ...dataset(10, 'sptrans'),
        ...dataset(6, 'sptrans'),
      ],
    );

    expect(result).toEqual([
      expect.objectContaining({ id: 100, name: 'Fallback GeoSampa' }),
      expect.objectContaining({ id: 600, name: 'Chosen SPTrans station' }),
    ]);
  });

  it('keeps the GeoSampa identity when switching display source and resolves known aliases', () => {
    const geosampa = [station(1010, 'SÃO CAETANO', 10)];
    const sptrans = [station(2010, 'São Caetano do Sul', 10, -23.5504, -46.63)];

    const geoDisplay = selectRailStations(
      geosampa,
      sptrans,
      dataset(10, 'geosampa'),
    )[0];
    const sptransDisplay = selectRailStations(
      geosampa,
      sptrans,
      dataset(10, 'sptrans'),
    )[0];

    expect(geoDisplay).toMatchObject({
      id: 1010,
      name: 'SÃO CAETANO',
      latitude: -23.55,
      mergedIds: [1010, 2010],
    });
    expect(sptransDisplay).toMatchObject({
      id: 1010,
      name: 'São Caetano do Sul',
      latitude: -23.5504,
      mergedIds: [1010, 2010],
    });
  });

  it('deduplicates repeated branch stops on a line but does not merge distant same-name stations', () => {
    const result = selectRailStations(
      [],
      [
        station(1701, 'Chucri Zaidan', 17),
        station(1702, 'Chucri Zaidan', 17, -23.5506, -46.63),
        station(1703, 'Morumbi', 17, -23.57, -46.63),
      ],
      dataset(17, 'sptrans'),
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 1701,
      name: 'Chucri Zaidan',
      mergedIds: [1701, 1702],
    });
    expect(result[1]).toMatchObject({ id: 1703, name: 'Morumbi' });

    const farSameName = selectRailStations(
      [station(1001, 'Mauá', 10)],
      [station(2001, 'Mauá', 10, -23.57, -46.63)],
      dataset(10, 'geosampa'),
    );
    expect(farSameName).toEqual([
      expect.objectContaining({ id: 1001, name: 'Mauá' }),
    ]);
    expect(farSameName[0].mergedIds).toBeUndefined();
  });

  it('adds only the configured L15 supplement and does not duplicate it when GeoSampa has it nearby', () => {
    const configuration = dataset(15, 'geosampa', ['Jardim Colonial']);
    const supplemented = selectRailStations(
      [station(1501, 'São Mateus', 15)],
      [
        station(2501, 'Jd. Colonial', 15),
        station(2502, 'Unconfigured GTFS stop', 15),
      ],
      configuration,
    );

    expect(supplemented).toEqual([
      expect.objectContaining({ id: 1501, name: 'São Mateus' }),
      expect.objectContaining({ id: 2501, name: 'Jd. Colonial' }),
    ]);

    const alreadyPresent = selectRailStations(
      [
        station(1510, 'Jardim Colonial', 15),
        station(1501, 'São Mateus', 15),
      ],
      [station(2510, 'Jd. Colonial', 15, -23.55005, -46.63)],
      configuration,
    );
    expect(alreadyPresent).toHaveLength(2);
    expect(alreadyPresent[0]).toMatchObject({
      id: 1510,
      name: 'Jardim Colonial',
      mergedIds: [1510, 2510],
    });
  });

  it('keeps line 7 and 8 Lapa records and distinct Morumbi names separate', () => {
    const result = selectRailStations(
      [
        station(701, 'Lapa', 7),
        station(801, 'Lapa', 8),
        station(401, 'Morumbi', 4),
        station(402, 'São Paulo - Morumbi', 4, -23.5501, -46.63),
      ],
      [],
      [
        ...dataset(7, 'geosampa'),
        ...dataset(8, 'geosampa'),
        ...dataset(4, 'geosampa'),
      ],
    );

    expect(result.map(({ id }) => id)).toEqual([701, 801, 401, 402]);
    expect(result).toHaveLength(4);
  });
});
