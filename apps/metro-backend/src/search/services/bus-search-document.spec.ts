import {
  formatBusRouteDocument,
  formatBusStopDocument,
} from './bus-search-document';
import type { RouteDocument, StopDocument } from './typesense.service';

describe('bus search metadata', () => {
  it('retains Artesp identity and fare currency through the search index', () => {
    const result = formatBusRouteDocument({
      route_id: 'artesp:001',
      route_type: 3,
      faresJson: '[{"price":5.4,"currency":"BRL"}]',
    } as RouteDocument);
    expect(result).toMatchObject({
      id: 'artesp:001',
      sourceAgency: 'artesp',
      sourceId: '001',
      supportsRealtime: false,
      fares: [{ price: 5.4, currency: 'BRL' }],
    });
  });

  it('does not manufacture a fare from missing or malformed index data', () => {
    for (const faresJson of [
      undefined,
      'invalid',
      '[{"price":null,"currency":"BRL"}]',
    ]) {
      expect(
        formatBusRouteDocument({
          route_id: 'artesp:02Verde',
          faresJson,
        } as RouteDocument).fares,
      ).toEqual([]);
    }
  });

  it('preserves legacy SPTrans documents and resolves only explicit platform labels', () => {
    expect(
      formatBusRouteDocument({
        route_id: '8000-10',
        route_type: 3,
      } as RouteDocument).supportsRealtime,
    ).toBe(true);
    expect(
      formatBusStopDocument({
        stop_id: '42',
        stop_name: 'Terminal Plat. B',
      } as StopDocument),
    ).toMatchObject({
      sourceAgency: 'sptrans',
      sourceId: '42',
      platformCode: 'B',
      mergedStopIds: ['42'],
      agencies: ['sptrans'],
    });
  });

  it('keeps both source members on a single searchable physical stop', () => {
    const result = formatBusStopDocument({
      stop_id: '42',
      stop_name: 'Rua das Flores, 12',
      mergedStopIds: ['artesp:2', '42'],
    } as StopDocument);
    expect(result.id).toBe('42');
    expect(result.agencies).toEqual(['sptrans', 'artesp']);
    expect(result.platformCode).toBeUndefined();
  });
});
