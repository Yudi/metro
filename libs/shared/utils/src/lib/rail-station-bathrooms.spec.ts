import { describe, expect, it } from '@jest/globals';

import { getStaticRailStationsByLine } from './rail-stations.entity';
import {
  aggregateStationBathroomInfo,
  findStationBathroomRecord,
  resolveStationBathroomInfo,
  STATION_BATHROOM_RECORDS,
  StationBathroomRecord,
  StationBathroomStatus,
} from './rail-station-bathrooms';

const STATIC_LINE_CODES = [
  'L1',
  'L2',
  'L3',
  'L4',
  'L5',
  'L7',
  'L8',
  'L9',
  'L10',
  'L11',
  'L12',
  'L13',
  'L15',
  'L17',
] as const;

describe('station bathroom data', () => {
  it('contains every extracted line-station record', () => {
    expect(STATION_BATHROOM_RECORDS).toHaveLength(217);
    expect(
      STATION_BATHROOM_RECORDS.every(
        (record) => !record.stationName.includes('–'),
      ),
    ).toBe(true);
    expect(
      STATION_BATHROOM_RECORDS.filter(
        (record) => record.status === StationBathroomStatus.Unknown,
      ),
    ).toEqual([
      {
        lineCode: 'L5',
        stationName: 'Vila das Belezas',
        status: StationBathroomStatus.Unknown,
      },
    ]);
  });

  it('covers every canonical static station by its primary name', () => {
    for (const lineCode of STATIC_LINE_CODES) {
      for (const station of getStaticRailStationsByLine(lineCode) ?? []) {
        expect(
          findStationBathroomRecord(station.name, lineCode),
        ).toBeDefined();
      }
    }

    expect(
      STATION_BATHROOM_RECORDS.filter(
        (record) =>
          record.lineCode === 'L15' && record.stationName === 'Sapopemba',
      ),
    ).toHaveLength(1);
  });

  it('resolves canonical aliases, branded names, codes, and numeric lines', () => {
    expect(
      findStationBathroomRecord(
        'Jabaquara-Comitê Paralímpico Brasileiro',
        1,
      ),
    ).toMatchObject({
      stationName: 'Jabaquara',
      status: StationBathroomStatus.FreeArea,
    });
    expect(findStationBathroomRecord('Faria Lima-Pag Bank', 'L4')).toMatchObject(
      {
        stationName: 'Faria Lima',
        status: StationBathroomStatus.PaidArea,
      },
    );
    expect(findStationBathroomRecord('Berrini-Casas Bahia', '09')).toMatchObject(
      {
        stationName: 'Berrini',
        status: StationBathroomStatus.PaidArea,
      },
    );
    expect(findStationBathroomRecord('Lapa (Linha 8)', 'L8')).toMatchObject({
      stationName: 'Lapa',
      status: StationBathroomStatus.PaidArea,
    });
    expect(findStationBathroomRecord('ECD', 'L8')).toMatchObject({
      stationName: 'Engenheiro Cardoso',
      status: StationBathroomStatus.PaidArea,
    });
  });

  it('resolves paid, free, combined, unavailable, and location-unknown facts', () => {
    expect(resolveStationBathroomInfo('Luz', [1])?.status).toBe(
      StationBathroomStatus.PaidArea,
    );
    expect(resolveStationBathroomInfo('Conceição', ['L1'])?.status).toBe(
      StationBathroomStatus.FreeArea,
    );
    expect(resolveStationBathroomInfo('Santa Cruz', [1, 5])?.status).toBe(
      StationBathroomStatus.PaidAndFreeAreas,
    );
    expect(resolveStationBathroomInfo('São Judas', [1])?.status).toBe(
      StationBathroomStatus.Unavailable,
    );
    expect(resolveStationBathroomInfo('Santana', [1])?.status).toBe(
      StationBathroomStatus.AvailableLocationUnknown,
    );
  });

  it('returns fully unknown raw data but omits it from resolved UI data', () => {
    expect(findStationBathroomRecord('Vila das Belezas', 'L5')).toEqual({
      lineCode: 'L5',
      stationName: 'Vila das Belezas',
      status: StationBathroomStatus.Unknown,
    });
    expect(resolveStationBathroomInfo('Vila das Belezas', [5])).toBeUndefined();
  });

  it('supports canonical names and codes for L6 and L17 stations', () => {
    expect(findStationBathroomRecord('FREGUESIA DO Ó', 'L6')).toMatchObject({
      lineCode: 'L6',
      status: StationBathroomStatus.AvailableLocationUnknown,
    });
    expect(findStationBathroomRecord('JOP', 'L6')).toMatchObject({
      stationName: 'João Paulo I',
      status: StationBathroomStatus.AvailableLocationUnknown,
    });
    expect(resolveStationBathroomInfo('Washington Luís', [17])?.status).toBe(
      StationBathroomStatus.AvailableLocationUnknown,
    );
  });

  it('keeps similarly named Morumbi stations scoped to their lines', () => {
    expect(findStationBathroomRecord('Morumbi', 'L4')).toBeUndefined();
    expect(findStationBathroomRecord('Morumbi', 'L9')?.status).toBe(
      StationBathroomStatus.PaidArea,
    );
    expect(findStationBathroomRecord('Morumbi', 'L17')?.status).toBe(
      StationBathroomStatus.AvailableLocationUnknown,
    );
    expect(
      findStationBathroomRecord('São Paulo - Morumbi', 'L4')?.status,
    ).toBe(StationBathroomStatus.PaidAndFreeAreas);
    expect(resolveStationBathroomInfo('Morumbi', [9, 17])?.status).toBe(
      StationBathroomStatus.PaidArea,
    );
  });

  it('combines transfer areas and lets known locations dominate uncertainty', () => {
    const records: StationBathroomRecord[] = [
      bathroomRecord('L1', StationBathroomStatus.PaidArea),
      bathroomRecord('L2', StationBathroomStatus.FreeArea),
      bathroomRecord('L3', StationBathroomStatus.AvailableLocationUnknown),
      bathroomRecord('L4', StationBathroomStatus.Unavailable),
      bathroomRecord('L5', StationBathroomStatus.Unknown),
    ];

    expect(aggregateStationBathroomInfo(records)?.status).toBe(
      StationBathroomStatus.PaidAndFreeAreas,
    );
  });

  it('resolves unavailable only when every known record is unavailable', () => {
    expect(
      aggregateStationBathroomInfo([
        bathroomRecord('L1', StationBathroomStatus.Unavailable),
        bathroomRecord('L2', StationBathroomStatus.Unknown),
      ])?.status,
    ).toBe(StationBathroomStatus.Unavailable);
    expect(
      aggregateStationBathroomInfo([
        bathroomRecord(
          'L1',
          StationBathroomStatus.AvailableLocationUnknown,
        ),
        bathroomRecord('L2', StationBathroomStatus.Unavailable),
      ])?.status,
    ).toBe(StationBathroomStatus.AvailableLocationUnknown);
  });

  it('preserves commuter-relevant notes and deduplicates transfer notes', () => {
    expect(findStationBathroomRecord('Jabaquara', 1)?.note).toBe(
      'Terminal Rodoviário',
    );
    expect(resolveStationBathroomInfo('Santa Cruz', [1, 5])?.notes).toEqual([
      'Opção no shopping conectado à Linha Azul',
    ]);
  });
});

function bathroomRecord(
  lineCode: StationBathroomRecord['lineCode'],
  status: StationBathroomStatus,
): StationBathroomRecord {
  return {
    lineCode,
    stationName: `Estação ${lineCode}`,
    status,
  };
}
