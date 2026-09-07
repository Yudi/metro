import { SearchService } from './search.service';

describe('SearchService indexing failures', () => {
  function createService(overrides: {
    queryRaw?: jest.Mock;
    railStations?: jest.Mock;
  } = {}): SearchService {
    return new SearchService(
      { $queryRaw: overrides.queryRaw ?? jest.fn() } as never,
      { indexRailLines: jest.fn(), indexRailStations: jest.fn() } as never,
      {
        getAllRailStations:
          overrides.railStations ?? jest.fn().mockResolvedValue([]),
        searchRailStations:
          overrides.railStations ?? jest.fn().mockResolvedValue([]),
        searchNearbyRailStations: jest.fn().mockResolvedValue([]),
      } as never,
      { batchGetStopServiceInfo: jest.fn().mockResolvedValue(new Map()) } as never,
      { getLatestPayload: jest.fn().mockResolvedValue({ stations: [] }) } as never,
    );
  }

  it('propagates rail-line index failures to the import coordinator', async () => {
    const databaseError = new Error('database unavailable');
    const queryRaw = jest.fn().mockRejectedValue(databaseError);

    await expect(createService({ queryRaw }).indexRailLines()).rejects.toBe(
      databaseError,
    );
  });

  it('propagates rail-station source failures to the import coordinator', async () => {
    const sourceError = new Error('rail source unavailable');
    const railStations = jest.fn().mockRejectedValue(sourceError);

    await expect(
      createService({ railStations }).indexRailStations(),
    ).rejects.toBe(sourceError);
  });

  it('does not convert rail search outages into successful empty results', async () => {
    const sourceError = new Error('rail source unavailable');
    const railStations = jest.fn().mockRejectedValue(sourceError);

    await expect(
      createService({ railStations }).searchRailStations('Sé'),
    ).rejects.toBe(sourceError);
  });
});

describe('SearchService multi-feed catalog', () => {
  it('indexes qualified route identity and its published fare without replacing the short name', async () => {
    const indexRoutes = jest.fn().mockResolvedValue(undefined);
    const service = new SearchService({ $queryRaw: jest.fn().mockResolvedValue([{
      route_id: 'artesp:001', agency_id: 'artesp:1', source_agency: 'artesp', source_id: '001',
      route_short_name: '001', route_long_name: 'Itapecerica - Capão Redondo', route_type: 3,
      route_color: '', route_text_color: '', fares: [{ price: 5.4, currency: 'BRL' }],
    }]) } as never, { indexRoutes } as never, {} as never, {} as never, {} as never);
    await service.indexRoutes();
    expect(indexRoutes).toHaveBeenCalledWith([expect.objectContaining({
      id: 'artesp:001', route_short_name: '001', sourceAgency: 'artesp', supportsRealtime: false,
      faresJson: '[{"price":5.4,"currency":"BRL"}]',
    })]);
  });

  it('keeps merged members and bus agencies on the canonical indexed stop', async () => {
    const indexStops = jest.fn().mockResolvedValue(undefined);
    const service = new SearchService({ $queryRaw: jest.fn().mockResolvedValue([{
      stop_id: '42', source_agency: 'sptrans', source_id: '42', stop_name: 'Terminal Plat. A',
      stop_desc: null, stop_lat: -23.5, stop_lon: -46.5, merged_stop_ids: ['42', 'artesp:2'],
    }]) } as never, { indexStops } as never, {} as never, {
      batchGetStopServiceInfo: jest.fn().mockResolvedValue(new Map([['42', {
        servesRail: false, servesBus: true, agencies: ['sptrans', 'artesp'], railRouteShortNames: [],
      }]])),
    } as never, {} as never);
    await service.indexStops();
    expect(indexStops).toHaveBeenCalledWith([expect.objectContaining({
      id: '42', mergedStopIds: ['42', 'artesp:2'], agencies: ['sptrans', 'artesp'], platformCode: 'A',
    })]);
  });
});
