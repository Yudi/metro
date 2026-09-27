import {
  mapTypesenseResult,
  mergeSubwayStationResults,
} from './search-dialog.utils';
import type { SearchResult } from './search-result-card/search-result-card.component';

describe('mergeSubwayStationResults', () => {
  it('retains ranked positions and all interchange line information', () => {
    const results: SearchResult[] = [
      { id: 'bus', type: 'bus_stop', name: 'Terminal' },
      {
        id: 'station-2',
        type: 'subway_station',
        name: 'Consolação',
        routes: ['Verde'],
        lineCodes: [2],
      },
      { id: 'route', type: 'route', name: '477A-10' },
      {
        id: 'station-4',
        type: 'subway_station',
        name: 'Consolação',
        routes: ['Amarela'],
        lineCodes: [4],
      },
    ];
    const merged = mergeSubwayStationResults(results);
    expect(merged.map((item) => item.id)).toEqual([
      'bus',
      'station-2',
      'route',
    ]);
    expect(merged[1].lineCodes).toEqual([2, 4]);
    expect(merged[1].routes).toEqual(['Amarela', 'Verde']);
    expect(results[1].routes).toEqual(['Verde']);
  });
});

describe('mapTypesenseResult', () => {
  it('keeps the Artesp route ID used by map selection', () => {
    const result = mapTypesenseResult({
      type: 'route',
      document: {
        id: 'artesp:001',
        route_id: 'artesp:001',
        route_short_name: '001',
        route_long_name: 'Terminal Regional – Centro',
        route_color: 'C90C0F',
        route_text_color: 'FFFFFF',
        source: 'gtfs',
        sourceAgency: 'artesp',
      },
    });

    expect(result?.routeData?.route_id).toBe('artesp:001');
    expect(result?.name).toBe('001');
  });
});
