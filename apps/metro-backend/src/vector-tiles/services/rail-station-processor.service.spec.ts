import { RailStationProcessorService } from './rail-station-processor.service';

describe('RailStationProcessorService precompute lifecycle', () => {
  const mergedStation = {
    primaryId: 1,
    mergedIds: [2, 1],
    name: 'Sé',
    originalName: 'Sé',
    latitude: -23.55,
    longitude: -46.63,
    agencies: ['METRO'],
    lines: ['Azul'],
  };

  it('avoids rewriting unchanged GeoSampa station data but checks derived freshness', async () => {
    const precompute = {
      refreshRouteRailConnections: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RailStationProcessorService(
      {} as never,
      precompute as never,
      {} as never,
    );
    jest
      .spyOn(service as never, 'fetchRawRailStations' as never)
      .mockResolvedValue([{}] as never);
    jest
      .spyOn(service as never, 'mergeStations' as never)
      .mockReturnValue([mergedStation] as never);
    jest
      .spyOn(service, 'getAllStations')
      .mockResolvedValue([{ ...mergedStation, mergedIds: [1, 2] }] as never);
    const persist = jest
      .spyOn(service as never, 'persistMergedStations' as never)
      .mockResolvedValue(undefined as never);

    await service.refreshMergedStationsWithinImport();

    expect(persist).not.toHaveBeenCalled();
    expect(precompute.refreshRouteRailConnections).toHaveBeenCalledTimes(1);
  });

  it('persists changed GeoSampa station data before refreshing route connections', async () => {
    const precompute = {
      refreshRouteRailConnections: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RailStationProcessorService(
      {} as never,
      precompute as never,
      {} as never,
    );
    jest
      .spyOn(service as never, 'fetchRawRailStations' as never)
      .mockResolvedValue([{}] as never);
    jest
      .spyOn(service as never, 'mergeStations' as never)
      .mockReturnValue([mergedStation] as never);
    jest.spyOn(service, 'getAllStations').mockResolvedValue([]);
    const persist = jest
      .spyOn(service as never, 'persistMergedStations' as never)
      .mockResolvedValue(undefined as never);

    await service.refreshMergedStationsWithinImport();

    expect(persist).toHaveBeenCalledWith([mergedStation]);
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(
      precompute.refreshRouteRailConnections.mock.invocationCallOrder[0],
    );
  });

  it('publishes selected GTFS lines, GeoSampa interchanges, and Jardim Colonial together', async () => {
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([
          { id: 100001, name: 'AGUA BRANCA', line: 'Rubi', line_number: 7,
            latitude: -23.52, longitude: -46.688 },
          { id: 100002, name: 'Tamanduateí', line: 'Turquesa', line_number: 10,
            latitude: -23.59, longitude: -46.59 },
          { id: 15, name: 'São Mateus', line: 'Prata', line_number: 15,
            latitude: -23.61, longitude: -46.477 },
        ])
        .mockResolvedValueOnce([
          { stop_id: 'six', stop_name: 'Água Branca', route_id: 'METRÔ L6',
            stop_lat: -23.5201, stop_lon: -46.6881 },
          { stop_id: 'new-ten', stop_name: 'SPTrans-only L10', route_id: 'CPTM L10',
            stop_lat: -23.55, stop_lon: -46.6 },
          { stop_id: 'colonial', stop_name: 'Jardim Colonial', route_id: 'METRÔ 15',
            stop_lat: -23.599, stop_lon: -46.469 },
          { stop_id: 'branch-a', stop_name: 'Brooklin Paulista', route_id: 'METRÔ17A',
            stop_lat: -23.6296, stop_lon: -46.6735 },
          { stop_id: 'branch-w', stop_name: 'Brooklin Paulista', route_id: 'METRÔ17W',
            stop_lat: -23.62964, stop_lon: -46.67356 },
        ]),
    };
    const precompute = { refreshRouteRailConnections: jest.fn() };
    const service = new RailStationProcessorService(prisma as never, precompute as never, {} as never);
    jest.spyOn(service, 'getAllStations').mockResolvedValue([]);
    const persist = jest.spyOn(service as never, 'persistMergedStations' as never)
      .mockResolvedValue(undefined as never);

    await service.refreshMergedStationsWithinImport();

    const stations = persist.mock.calls[0][0] as unknown as Array<typeof mergedStation>;
    expect(stations).toHaveLength(6);
    expect(stations.find((station) => station.name === 'Água Branca (linha 7)')).toMatchObject({
      primaryId: 100001, lines: ['Rubi'], agencies: ['tictrens'],
    });
    expect(stations.find((station) => station.name === 'Água Branca (linha 6)')).toMatchObject({
      lines: ['Laranja'], agencies: ['linhauni'],
    });
    expect(stations.find((station) => station.name === 'Jardim Colonial')).toMatchObject({
      lines: ['Prata'], latitude: -23.599, longitude: -46.469,
    });
    expect(stations.find((station) => station.name === 'Brooklin Paulista')?.mergedIds).toHaveLength(2);
    expect(stations.find((station) => station.name === 'SPTrans-only L10')).toBeUndefined();
  });

  it('merges Palmeiras-Barra Funda across line-specific canonical dash variants', async () => {
    const service = new RailStationProcessorService(
      {} as never,
      { refreshRouteRailConnections: jest.fn() } as never,
      {} as never,
    );
    jest.spyOn(service as never, 'fetchRawRailStations' as never).mockResolvedValue([
      { id: 3, name: 'PALMEIRAS - BARRA FUNDA', line: 'Vermelha', lineCode: 3, latitude: -23.525, longitude: -46.667 },
      { id: 8, name: 'Palmeiras–Barra Funda', line: 'Diamante', lineCode: 8, latitude: -23.5251, longitude: -46.6671 },
      { id: 10, name: 'Palmeiras-Barra Funda', line: 'Turquesa', lineCode: 10, latitude: -23.5252, longitude: -46.6672 },
    ] as never);
    jest.spyOn(service, 'getAllStations').mockResolvedValue([]);
    const persist = jest.spyOn(service as never, 'persistMergedStations' as never)
      .mockResolvedValue(undefined as never);

    await service.refreshMergedStationsWithinImport();

    expect(persist).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Palmeiras-Barra Funda',
        mergedIds: [3, 8, 10],
        lines: ['Diamante', 'Turquesa', 'Vermelha'],
      }),
    ]);
  });

  it('clears removed station data instead of retaining an obsolete catalog', async () => {
    const precompute = { refreshRouteRailConnections: jest.fn() };
    const service = new RailStationProcessorService({} as never, precompute as never, {} as never);
    jest.spyOn(service as never, 'fetchRawRailStations' as never).mockResolvedValue([] as never);
    jest.spyOn(service, 'getAllStations').mockResolvedValue([mergedStation] as never);
    const persist = jest.spyOn(service as never, 'persistMergedStations' as never)
      .mockResolvedValue(undefined as never);

    await service.refreshMergedStationsWithinImport();

    expect(persist).toHaveBeenCalledWith([]);
    expect(precompute.refreshRouteRailConnections).toHaveBeenCalledTimes(1);
  });

  it('keeps distant same-line merge exceptions separate in the published catalog', async () => {
    const service = new RailStationProcessorService(
      {} as never,
      { refreshRouteRailConnections: jest.fn() } as never,
      {} as never,
    );
    jest.spyOn(service as never, 'fetchRawRailStations' as never).mockResolvedValue([
      { id: 701, name: 'Lapa', line: 'Rubi', lineCode: 7, latitude: -23.52, longitude: -46.7 },
      { id: 702, name: 'Lapa', line: 'Rubi', lineCode: 7, latitude: -23.55, longitude: -46.7 },
    ] as never);
    jest.spyOn(service, 'getAllStations').mockResolvedValue([]);
    const persist = jest.spyOn(service as never, 'persistMergedStations' as never)
      .mockResolvedValue(undefined as never);

    await service.refreshMergedStationsWithinImport();

    expect(persist).toHaveBeenCalledWith([
      expect.objectContaining({ primaryId: 701, mergedIds: [701] }),
      expect.objectContaining({ primaryId: 702, mergedIds: [702] }),
    ]);
  });
});
