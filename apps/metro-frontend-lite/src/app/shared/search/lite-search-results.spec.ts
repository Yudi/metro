import { processLiteSearchResults } from './lite-search-results';

describe('processLiteSearchResults', () => {
  it('maps minimal stop payloads while preserving agency, platform and route identities', () => {
    const results = processLiteSearchResults([
      {
        id: 'stop-row',
        type: 'busStop',
        stop_id: 'artesp:stop',
        stop_name: 'Terminal',
        stop_lat: -23.5,
        stop_lon: -46.6,
        sourceAgency: 'artesp',
        sourceId: 'stop',
        platformCode: '2',
        mergedStopIds: ['artesp:stop', 'artesp:other'],
        routes: [
          {
            id: 'route-row',
            route_id: 'artesp:001',
            route_short_name: '001',
            route_long_name: 'Terminal Central',
            supportsRealtime: false,
            fares: [{ price: 5, currency: 'BRL' }],
          },
        ],
      },
      {
        id: 'rail-row',
        type: 'railStation',
        station_code: 'rail-central',
        station_name: 'Central',
        railLatitude: -23.6,
        railLongitude: -46.7,
      },
      {
        id: 'bike-row',
        type: 'bikeStation',
        station_id: 'bike-central',
        station_name: 'Central',
        bikeLatitude: -23.7,
        bikeLongitude: -46.8,
      },
    ]);

    expect(results.map((result) => result.stopId)).toEqual([
      'artesp:stop',
      'rail-central',
      'bike-central',
    ]);
    expect(results[0]).toMatchObject({
      platformCode: '2',
      mergedStopIds: ['artesp:stop', 'artesp:other'],
      routes: [
        {
          id: 'route-row',
          routeId: 'artesp:001',
          supportsRealtime: false,
          fares: [{ price: 5, currency: 'BRL' }],
        },
      ],
    });
    expect(results[1]).toMatchObject({ kind: 'railStation', isSubway: true });
    expect(results[2]).toMatchObject({
      kind: 'bikeStation',
      latitude: -23.7,
      longitude: -46.8,
    });
  });
});
