import {
  mapBusRoute,
  mapBusStop,
  parseBusFares,
  supportsBusRealtime,
} from './bus-catalog.utils';

describe('bus catalog mappings', () => {
  it('keeps Artesp route IDs namespaced and never marks them realtime', () => {
    const route = mapBusRoute({
      route_id: 'artesp:001',
      route_short_name: '001',
      route_long_name: 'Terminal - Centro',
      route_type: 3,
      route_color: null,
      route_text_color: null,
      fares: [{ price: 5.4, currency: 'BRL' }],
    });

    expect(route).toMatchObject({
      id: 'artesp:001',
      sourceAgency: 'artesp',
      sourceId: '001',
      supportsRealtime: false,
      fares: [{ price: 5.4, currency: 'BRL' }],
    });
    expect(supportsBusRealtime('artesp:001', 'sptrans', 3)).toBe(false);
  });

  it('does not turn null or malformed fare values into a zero fare', () => {
    expect(
      parseBusFares([
        { price: null, currency: 'BRL' },
        { price: 'invalid', currency: 'BRL' },
        { price: 0, currency: 'BRL' },
      ]),
    ).toEqual([{ price: 0, currency: 'BRL' }]);
  });

  it('uses explicit platform metadata and preserves canonical group members', () => {
    const stop = mapBusStop({
      stop_id: '12345',
      stop_name: 'Avenida Central',
      stop_desc: 'Plat. B',
      stop_lat: -23.5,
      stop_lon: -46.6,
      source_agency: 'sptrans',
      source_id: '12345',
      platform_code: null,
      physical_stop_id: '12345',
      merged_stop_ids: ['12345', 'artesp:2'],
    });

    expect(stop).toMatchObject({
      stopId: '12345',
      sourceAgency: 'sptrans',
      platformCode: 'B',
      mergedStopIds: ['12345', 'artesp:2'],
    });
  });
});
