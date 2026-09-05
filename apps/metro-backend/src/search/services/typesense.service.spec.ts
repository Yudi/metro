import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { TypesenseService } from './typesense.service';
import { formatTypesenseError } from './typesense.service';

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

  it('applies a global search result limit across all selected indexes', async () => {
    const service = new TypesenseService(new ConfigService());
    (service as never as { client: unknown }).client = {
      multiSearch: {
        perform: jest.fn().mockResolvedValue({
          results: [
            {
              hits: [
                { document: { id: 'route-1', route_id: 'route-1' } },
                { document: { id: 'route-2', route_id: 'route-2' } },
              ],
            },
            {
              hits: [
                { document: { id: 'stop-1', is_subway_station: false } },
                { document: { id: 'stop-2', is_subway_station: false } },
              ],
            },
          ],
        }),
      },
    };
    (service as never as { initialized: boolean }).initialized = true;

    await expect(
      service.search('central', ['busRoute', 'busStop'], 2),
    ).resolves.toHaveLength(4);
    service.onModuleDestroy();
  });

  it('preserves unaliased rebuilds owned by other processes during startup', async () => {
    const deleteCollection = jest.fn().mockResolvedValue(undefined);
    const retrieveCollection = jest.fn().mockResolvedValue({});
    const retrieveCollections = jest.fn().mockResolvedValue([
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
                    collection_name:
                      'metro-sptrans-gtfs-stops__rebuild_active',
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
    const logger = (service as never as { logger: { error: jest.Mock } }).logger;
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
