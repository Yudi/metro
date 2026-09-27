import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { TypesenseService } from './typesense.service';
import { formatTypesenseError } from './typesense.service';
import { SearchTypesEnum } from '@metro/shared/utils';
import {
  busRouteSearchResult,
  busStopSearchResult,
} from '../testing/search.fixtures';

describe('TypesenseService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('fails a bulk import when any document is rejected', async () => {
    const importDocuments = jest.fn().mockResolvedValue([
      { success: true, id: 'ok' },
      { success: false, id: 'bad', error: 'invalid route_type', code: 400 },
    ]);
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      collections: jest.fn().mockReturnValue({
        documents: jest.fn().mockReturnValue({ import: importDocuments }),
      }),
    };

    await expect(
      (
        service as never as {
          importDocuments: (
            baseName: string,
            documents: Array<Record<string, unknown>>,
          ) => Promise<void>;
        }
      ).importDocuments('metro-sptrans-gtfs-routes', [
        { id: 'ok' },
        { id: 'bad' },
      ]),
    ).rejects.toThrow('rejected 1 malformed');
    expect(importDocuments).toHaveBeenCalledWith(
      [{ id: 'ok' }, { id: 'bad' }],
      { action: 'upsert' },
    );
  });

  it('fails a bulk import when every document is rejected', async () => {
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      collections: jest.fn().mockReturnValue({
        documents: jest.fn().mockReturnValue({
          import: jest
            .fn()
            .mockResolvedValue([
              { success: false, id: 'bad', error: 'invalid document' },
            ]),
        }),
      }),
    };

    await expect(
      (
        service as never as {
          importDocuments: (
            baseName: string,
            documents: Array<Record<string, unknown>>,
          ) => Promise<void>;
        }
      ).importDocuments('metro-sptrans-gtfs-routes', [{ id: 'bad' }]),
    ).rejects.toThrow('rejected 1 malformed');
  });

  it('requests Typesense relevance order with stable per-collection ties', async () => {
    const route1 = busRouteSearchResult({
      id: 'route-1',
      route_id: 'route-1',
    });
    const route2 = busRouteSearchResult({
      id: 'route-2',
      route_id: 'route-2',
    });
    const stop1 = busStopSearchResult({ id: 'stop-1', stop_id: 'stop-1' });
    const stop2 = busStopSearchResult({ id: 'stop-2', stop_id: 'stop-2' });
    const perform = jest.fn().mockResolvedValue({
      results: [
        {
          hits: [{ document: route1.document }, { document: route2.document }],
        },
        {
          hits: [{ document: stop1.document }, { document: stop2.document }],
        },
      ],
    });
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      multiSearch: {
        perform,
      },
    };
    (service as never as { initialized: boolean }).initialized = true;

    await expect(
      service.search('central', ['busRoute', 'busStop'], 2),
    ).resolves.toHaveLength(4);
    const requests = perform.mock.calls[0][0].searches;
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query_by: 'route_id,route_short_name,route_long_name,sourceAgency',
          query_by_weights: '10,8,3,1',
          sort_by: '_text_match:desc,route_id:asc',
          per_page: 2,
        }),
        expect.objectContaining({
          query_by: 'stop_name,stop_desc',
          sort_by: '_text_match:desc,stop_id:asc',
          per_page: 2,
        }),
      ]),
    );
    service.onModuleDestroy();
  });

  it('finds Artesp routes when users search for EMTU or Artesp', async () => {
    const perform = jest.fn().mockResolvedValue({ results: [{ hits: [] }] });
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      multiSearch: { perform },
    };
    (service as never as { initialized: boolean }).initialized = true;

    await service.search('EMTU 001', ['busRoute']);
    await service.search('Artesp', ['busRoute']);

    expect(perform.mock.calls[0][0].searches[0]).toMatchObject({
      q: 'artesp 001',
      query_by: 'route_id,route_short_name,route_long_name,sourceAgency',
    });
    expect(perform.mock.calls[1][0].searches[0].q).toBe('Artesp');
    service.onModuleDestroy();
  });

  it('rejects partial search results when a multi-search collection fails', async () => {
    const route = busRouteSearchResult();
    const perform = jest.fn().mockResolvedValue({
      results: [
        { hits: [{ document: route.document }] },
        { error: 'Invalid stop search field', code: 400 },
      ],
    });
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      multiSearch: { perform },
    };
    (service as never as { initialized: boolean }).initialized = true;

    await expect(
      service.search('Interlagos', ['busRoute', 'busStop']),
    ).rejects.toThrow('Invalid stop search field');
    service.onModuleDestroy();
  });

  it('keeps nearby distance primary and uses identity to break equal-distance ties', async () => {
    const perform = jest.fn().mockResolvedValue({
      results: [
        {
          hits: [
            {
              document: {
                id: 'stop-z',
                stop_id: 'stop-z',
                stop_name: 'Stop Z',
                stop_lat: -23.5,
                stop_lon: -46.6,
                is_subway_station: false,
              },
              geo_distance_meters: { location: 50 },
            },
            {
              document: {
                id: 'stop-nearest',
                stop_id: 'stop-nearest',
                stop_name: 'Nearest',
                stop_lat: -23.5,
                stop_lon: -46.6,
                is_subway_station: false,
              },
              geo_distance_meters: { location: 20 },
            },
            {
              document: {
                id: 'stop-a',
                stop_id: 'stop-a',
                stop_name: 'Stop A',
                stop_lat: -23.5,
                stop_lon: -46.6,
                is_subway_station: false,
              },
              geo_distance_meters: { location: 50 },
            },
          ],
        },
      ],
    });
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      multiSearch: { perform },
    };
    (service as never as { initialized: boolean }).initialized = true;

    const results = await service.searchNearbyStops(
      -23.55,
      -46.63,
      1_000,
      [SearchTypesEnum.BusStop],
      3,
    );

    expect(
      results.map((result) => (result.document as { stop_id: string }).stop_id),
    ).toEqual(['stop-nearest', 'stop-a', 'stop-z']);
    expect(perform.mock.calls[0][0].searches[0]).toMatchObject({
      sort_by: 'location(-23.55, -46.63):asc',
      per_page: 3,
    });
    service.onModuleDestroy();
  });

  it('fails nearby search when a requested collection returns an error response', async () => {
    const perform = jest.fn().mockResolvedValue({
      results: [
        { hits: [] },
        { error: 'Typesense collection unavailable', code: 503 },
      ],
    });
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      multiSearch: { perform },
    };
    (service as never as { initialized: boolean }).initialized = true;

    await expect(
      service.searchNearbyStops(-23.55, -46.63, 1_000, [
        SearchTypesEnum.BusStop,
        SearchTypesEnum.RailStation,
      ]),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(service.isAvailable()).toBe(false);
    service.onModuleDestroy();
  });

  it('preserves unaliased rebuilds owned by other processes during startup', async () => {
    const deleteCollection = jest.fn().mockResolvedValue(undefined);
    const retrieveCollection = jest.fn().mockResolvedValue({});
    const retrieveCollections = jest
      .fn()
      .mockResolvedValue([
        { name: 'metro-sptrans-gtfs-routes' },
        { name: 'metro-sptrans-gtfs-routes__rebuild_orphan' },
        { name: 'metro-sptrans-gtfs-stops__rebuild_active' },
      ]);
    const collections = jest.fn((name?: string) =>
      name
        ? { retrieve: retrieveCollection, delete: deleteCollection }
        : { retrieve: retrieveCollections, create: jest.fn() },
    );
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      health: { retrieve: jest.fn().mockResolvedValue({ ok: true }) },
      collections,
      aliases: jest.fn((name?: string) =>
        name
          ? { retrieve: jest.fn().mockRejectedValue({ httpStatus: 404 }) }
          : {
              retrieve: jest.fn().mockResolvedValue({
                aliases: [
                  {
                    collection_name: 'metro-sptrans-gtfs-stops__rebuild_active',
                  },
                ],
              }),
            },
      ),
    };

    await service.onModuleInit();

    expect(service.isAvailable()).toBe(true);
    expect(deleteCollection).not.toHaveBeenCalled();
    expect(collections).not.toHaveBeenCalledWith(
      'metro-sptrans-gtfs-stops__rebuild_active',
    );
    service.onModuleDestroy();
  });

  it('fails search immediately while Typesense is known to be unavailable', async () => {
    const perform = jest.fn();
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      multiSearch: { perform },
    };

    await expect(service.search('Sé', ['busStop'])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(perform).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('marks Typesense unavailable after a connection failure and logs no request config', async () => {
    const perform = jest.fn().mockRejectedValue({
      code: 'ECONNREFUSED',
      httpStatus: 503,
      message: 'connection refused',
      config: { headers: { 'x-typesense-api-key': 'secret-api-key' } },
    });
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      multiSearch: { perform },
    };
    (service as never as { initialized: boolean }).initialized = true;
    const logger = (service as never as { logger: { error: jest.Mock } })
      .logger;
    const loggerError = jest
      .spyOn(logger, 'error')
      .mockImplementation(() => undefined);

    await expect(service.search('Sé', ['busStop'])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(service.isAvailable()).toBe(false);
    const logged = loggerError.mock.calls.flat().join(' ');
    expect(logged).toContain('status=503');
    expect(logged).toContain('code=ECONNREFUSED');
    expect(logged).not.toContain('secret-api-key');
    service.onModuleDestroy();
  });

  it('recovers after the bounded background health probe succeeds', async () => {
    jest.useFakeTimers();
    const healthRetrieve = jest
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    const collection = {
      retrieve: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
    };
    const client = {
      health: { retrieve: healthRetrieve },
      collections: jest.fn().mockReturnValue(collection),
      aliases: jest.fn().mockReturnValue({
        retrieve: jest.fn().mockRejectedValue({ httpStatus: 404 }),
      }),
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'TYPESENSE_RECOVERY_INTERVAL_MS' ? '1000' : fallback,
      ),
    } as unknown as ConfigService;
    const service = new TypesenseService(config);
    (service as never as { client: unknown }).client = client;

    await service.onModuleInit();
    expect(service.isAvailable()).toBe(false);

    await jest.advanceTimersByTimeAsync(1_000);

    expect(service.isAvailable()).toBe(true);
    expect(healthRetrieve).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });

  it('formats only status, code, and a bounded redacted message', () => {
    expect(
      formatTypesenseError({
        httpStatus: 401,
        code: 'ERR_BAD_RESPONSE',
        message: 'Bearer top-secret api_key=top-secret',
        config: { headers: { 'x-typesense-api-key': 'secret-api-key' } },
      }),
    ).toBe(
      'status=401 code=ERR_BAD_RESPONSE message=Bearer [REDACTED] api_key=[REDACTED]',
    );
  });
});
