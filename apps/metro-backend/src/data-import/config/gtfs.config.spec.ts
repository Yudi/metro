import { GTFSConfig } from './gtfs.config';

describe('GTFSConfig', () => {
  it('maps feeds to separate raw table names while sharing GTFS filenames', () => {
    expect(GTFSConfig.getTableName('routes.txt', 'sptrans')).toBe(
      'SPTrans_Route',
    );
    expect(GTFSConfig.getTableName('routes.txt', 'artesp')).toBe(
      'ARTESP_Route',
    );
    expect(GTFSConfig.getTableName('calendar_dates.txt', 'artesp')).toBe(
      'ARTESP_CalendarDate',
    );
    expect(GTFSConfig.getRawTables('sptrans')).not.toEqual(
      GTFSConfig.getRawTables('artesp'),
    );
  });

  it('requires route-specific ARTESP fare relations for publication', () => {
    expect(GTFSConfig.getRequiredFiles('artesp')).toEqual(
      expect.arrayContaining(['fare_attributes.txt', 'fare_rules.txt']),
    );
    expect(GTFSConfig.isEmptyAllowedFile('fare_attributes.txt', 'artesp')).toBe(
      false,
    );
  });
});
