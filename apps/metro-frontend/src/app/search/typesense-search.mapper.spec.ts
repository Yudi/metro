import { mapTypesenseSearchResponse } from './typesense-search.mapper';

describe('mapTypesenseSearchResponse', () => {
  it('preserves result order and transit identities without search metadata', () => {
    const route = {
      route_id: 'artesp:001',
      route_short_name: '001',
      route_long_name: 'Terminal Central',
      route_color: '123456',
      route_text_color: 'ffffff',
      sourceAgency: 'artesp',
      sourceId: '001',
      supportsRealtime: false,
      fares: [{ price: 5, currency: 'BRL' }],
    };
    const response = mapTypesenseSearchResponse('central', [
      { __typename: 'SearchBusRoute', ...route },
      {
        __typename: 'SearchBusStop',
        stop_id: 'artesp:stop',
        stop_name: 'Terminal Central',
        stop_lat: -23.5,
        stop_lon: -46.6,
        sourceAgency: 'artesp',
        sourceId: 'stop',
        platformCode: '2',
        mergedStopIds: ['artesp:stop', 'artesp:other'],
        routes: [{ id: 'route-row', ...route }],
      },
      {
        __typename: 'SearchRailLine',
        line_code: 'L1',
        line_fullname: 'Linha 1 - Azul',
      },
      {
        __typename: 'SearchRailStation',
        station_code: 'rail-central',
        station_name: 'Central',
        station_aliases: ['Azul'],
        railLatitude: -23.6,
        railLongitude: -46.7,
      },
      {
        __typename: 'SearchBikeStation',
        station_id: 'bike-central',
        station_name: 'Bicicletas Central',
        bikeLatitude: -23.7,
        bikeLongitude: -46.8,
      },
    ]);

    expect(response.results.map((result) => result.document.id)).toEqual([
      'artesp:001', 'artesp:stop', 'L1', 'rail-central', 'bike-central',
    ]);
    expect(response.results[0].document).toMatchObject(route);
    expect(response.results[1].document).toMatchObject({
      platformCode: '2',
      mergedStopIds: ['artesp:stop', 'artesp:other'],
      routes: [{ id: 'route-row', ...route }],
    });
    expect(response.results[3].document).toMatchObject({
      is_subway_station: true,
      stop_lat: -23.6,
      stop_lon: -46.7,
    });
    expect(response.results[4].document).toMatchObject({ source: 'bike' });
  });
});
