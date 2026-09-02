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
      .mockResolvedValue([
        { ...mergedStation, mergedIds: [1, 2] },
      ] as never);
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
});
