import { SearchService } from './search.service';
import {
  GPKG_LINES_COLLECTION_NAME,
  GPKG_STATIONS_COLLECTION_NAME,
} from './typesense-schemas';

describe('SearchService indexing failures', () => {
  function createService(
    overrides: {
      queryRaw?: jest.Mock;
      railStations?: jest.Mock;
      mergedStations?: jest.Mock;
    } = {},
  ): SearchService {
    return new SearchService(
      {
        $queryRaw: overrides.queryRaw ?? jest.fn(),
        mergedRailStation: {
          findMany:
            overrides.mergedStations ?? jest.fn().mockResolvedValue([]),
        },
      } as never,
      {
        indexRailLines: jest.fn(),
        indexRailStations: jest.fn(),
        beginFullRebuild: jest.fn(),
        finishFullRebuild: jest.fn(),
        discardFullRebuild: jest.fn(),
      } as never,
      {
        searchRailStations:
          overrides.railStations ?? jest.fn().mockResolvedValue([]),
        searchNearbyRailStations: jest.fn().mockResolvedValue([]),
      } as never,
      {
        batchGetStopServiceInfo: jest.fn().mockResolvedValue(new Map()),
      } as never,
      {
        getLatestPayload: jest.fn().mockResolvedValue({ stations: [] }),
      } as never,
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
    const sourceError = new Error('rail catalog unavailable');
    const mergedStations = jest.fn().mockRejectedValue(sourceError);

    await expect(
      createService({ mergedStations }).indexRailStations(),
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

describe('SearchService selected rail catalog', () => {
  it('indexes only configured rail routes from the shared route selection', async () => {
    const indexRailLines = jest.fn().mockResolvedValue(undefined);
    const service = new SearchService(
      {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: 6,
            line_number: 6,
            name: 'Linha 6 - Laranja',
            agency: 'METRO',
          },
          {
            id: 17,
            line_number: 17,
            name: 'Linha 17 - Ouro',
            agency: 'METRO',
          },
        ]),
      } as never,
      { indexRailLines } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.indexRailLines();

    expect(indexRailLines).toHaveBeenCalledWith([
      {
        id: '6',
        line_code: '6',
        line_fullname: 'Linha 6 - Laranja',
        agency: 'METRO',
      },
      {
        id: '17',
        line_code: '17',
        line_fullname: 'Linha 17 - Ouro',
        agency: 'METRO',
      },
    ]);
  });

  it('preserves database errors while indexing selected routes', async () => {
    const databaseError = new Error('database unavailable');
    const indexRailLines = jest.fn();
    const service = new SearchService(
      { $queryRaw: jest.fn().mockRejectedValue(databaseError) } as never,
      { indexRailLines } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.indexRailLines()).rejects.toBe(databaseError);
    expect(indexRailLines).not.toHaveBeenCalled();
  });

  it('indexes only selected merged stations and enriches aliases by served line', async () => {
    const indexRailStations = jest.fn().mockResolvedValue(undefined);
    const stations = [
      {
        id: 'internal-row-id',
        primaryId: 42,
        mergedIds: [42, 1_000_000_042],
        name: 'Paraíso',
        originalName: 'PARAISO',
        latitude: -23.575,
        longitude: -46.641,
        agencies: ['METRO'],
        lines: ['Azul'],
      },
    ];
    const findMany = jest.fn().mockResolvedValue(stations);
    const service = new SearchService(
      {
        $queryRaw: jest.fn(),
        mergedRailStation: { findMany },
      } as never,
      { indexRailStations } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.indexRailStations();

    expect(findMany).toHaveBeenCalledTimes(1);
    const indexedStations = indexRailStations.mock.calls[0][0] as Array<{
      id: string;
      station_code: string;
      station_name: string;
      station_aliases: string[];
      location?: [number, number];
    }>;
    expect(indexedStations).toHaveLength(1);
    expect(indexedStations[0]).toMatchObject({
      id: '42',
      station_code: '42',
      station_name: 'Paraíso',
      location: [-23.575, -46.641],
    });
    expect(indexedStations[0].station_aliases).toEqual(
      expect.arrayContaining([
        'PARAISO',
        '42',
        '1000000042',
        'PSO',
        'L1',
        'Linha 1 - Azul',
      ]),
    );
    expect(indexedStations[0].station_aliases).not.toEqual(
      expect.arrayContaining(['L2', 'Verde', 'Linha 2 - Verde']),
    );
  });

  it('does not create static-only station documents when the selected catalog is empty', async () => {
    const indexRailStations = jest.fn().mockResolvedValue(undefined);
    const service = new SearchService(
      {
        $queryRaw: jest.fn(),
        mergedRailStation: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      { indexRailStations } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.indexRailStations();

    expect(indexRailStations).toHaveBeenCalledWith([]);
  });

  it('replaces only rail collections in line-then-station order', async () => {
    const beginFullRebuild = jest.fn().mockResolvedValue(undefined);
    const finishFullRebuild = jest.fn().mockResolvedValue(undefined);
    const discardFullRebuild = jest.fn().mockResolvedValue(undefined);
    const service = new SearchService(
      { $queryRaw: jest.fn() } as never,
      {
        beginFullRebuild,
        finishFullRebuild,
        discardFullRebuild,
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const indexRailLines = jest
      .spyOn(service, 'indexRailLines')
      .mockResolvedValue(undefined);
    const indexRailStations = jest
      .spyOn(service, 'indexRailStations')
      .mockResolvedValue(undefined);

    await service.rebuildRailData();

    expect(beginFullRebuild).toHaveBeenCalledWith([
      GPKG_LINES_COLLECTION_NAME,
      GPKG_STATIONS_COLLECTION_NAME,
    ]);
    expect(indexRailLines.mock.invocationCallOrder[0]).toBeLessThan(
      indexRailStations.mock.invocationCallOrder[0],
    );
    expect(indexRailStations.mock.invocationCallOrder[0]).toBeLessThan(
      finishFullRebuild.mock.invocationCallOrder[0],
    );
    expect(discardFullRebuild).not.toHaveBeenCalled();
  });

  it('discards the rail collection rebuild if indexing fails', async () => {
    const beginFullRebuild = jest.fn().mockResolvedValue(undefined);
    const finishFullRebuild = jest.fn();
    const discardFullRebuild = jest.fn().mockResolvedValue(undefined);
    const service = new SearchService(
      { $queryRaw: jest.fn() } as never,
      {
        beginFullRebuild,
        finishFullRebuild,
        discardFullRebuild,
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'indexRailLines').mockResolvedValue(undefined);
    const indexRailStations = jest
      .spyOn(service, 'indexRailStations')
      .mockRejectedValue(new Error('station index failed'));

    await expect(service.rebuildRailData()).rejects.toThrow(
      'station index failed',
    );

    expect(beginFullRebuild).toHaveBeenCalledWith([
      GPKG_LINES_COLLECTION_NAME,
      GPKG_STATIONS_COLLECTION_NAME,
    ]);
    expect(indexRailStations).toHaveBeenCalledTimes(1);
    expect(finishFullRebuild).not.toHaveBeenCalled();
    expect(discardFullRebuild).toHaveBeenCalledTimes(1);
  });
});

describe('SearchService multi-feed catalog', () => {
  it('indexes qualified route identity and its published fare without replacing the short name', async () => {
    const indexRoutes = jest.fn().mockResolvedValue(undefined);
    const service = new SearchService(
      {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            route_id: 'artesp:001',
            agency_id: 'artesp:1',
            source_agency: 'artesp',
            source_id: '001',
            route_short_name: '001',
            route_long_name: 'Itapecerica - Capão Redondo',
            route_type: 3,
            route_color: '',
            route_text_color: '',
            fares: [{ price: 5.4, currency: 'BRL' }],
          },
        ]),
      } as never,
      { indexRoutes } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await service.indexRoutes();
    expect(indexRoutes).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'artesp:001',
        route_short_name: '001',
        sourceAgency: 'artesp',
        supportsRealtime: false,
        faresJson: '[{"price":5.4,"currency":"BRL"}]',
      }),
    ]);
  });

  it('keeps merged members and bus agencies on the canonical indexed stop', async () => {
    const indexStops = jest.fn().mockResolvedValue(undefined);
    const service = new SearchService(
      {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            stop_id: '42',
            source_agency: 'sptrans',
            source_id: '42',
            stop_name: 'Terminal Plat. A',
            stop_desc: null,
            stop_lat: -23.5,
            stop_lon: -46.5,
            merged_stop_ids: ['42', 'artesp:2'],
          },
        ]),
      } as never,
      { indexStops } as never,
      {} as never,
      {
        batchGetStopServiceInfo: jest.fn().mockResolvedValue(
          new Map([
            [
              '42',
              {
                servesRail: false,
                servesBus: true,
                agencies: ['sptrans', 'artesp'],
                railRouteShortNames: [],
              },
            ],
          ]),
        ),
      } as never,
      {} as never,
    );
    await service.indexStops();
    expect(indexStops).toHaveBeenCalledWith([
      expect.objectContaining({
        id: '42',
        mergedStopIds: ['42', 'artesp:2'],
        agencies: ['sptrans', 'artesp'],
        platformCode: 'A',
      }),
    ]);
  });
});
