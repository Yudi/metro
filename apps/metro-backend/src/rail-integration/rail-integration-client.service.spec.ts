import { ConfigService } from '@nestjs/config';
import {
  CallOptions,
  Metadata,
  Server,
  ServerCredentials,
  ServiceError,
  status,
} from '@grpc/grpc-js';
import {
  loadRailIntegrationGrpcDefinition,
  RailIntegrationGrpcClient,
  RailIntegrationGrpcHandlers,
} from '@metro/rail-integration-contracts';
import { RailIntegrationClientService } from './rail-integration-client.service';

describe('RailIntegrationClientService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('uses port 50051 when no target is configured', () => {
    const service = new RailIntegrationClientService(configService({}));

    expect(service).toHaveProperty('target', 'localhost:50051');

    service.onModuleDestroy();
  });

  it('uses the development target supplied through the environment', () => {
    const service = new RailIntegrationClientService(
      configService({
        RAIL_INTEGRATION_GRPC_URL: '127.0.0.1:55051',
      }),
    );

    expect(service).toHaveProperty('target', '127.0.0.1:55051');

    service.onModuleDestroy();
  });

  it('performs readiness and maps generic special status responses', async () => {
    jest.useFakeTimers();
    const service = createServiceWithClient({
      fetchSpecialRailStatusLines: unarySuccess({
        lines: [
          {
            code: 'EA',
            statusCode: 'Paralisada',
            statusLabel: 'Operação Paralisada',
            statusColor: 'vermelho',
            description: 'Serviço temporariamente paralisado.',
          },
        ],
      }),
    });

    const request = service.fetchSpecialRailStatusLines();
    await jest.advanceTimersByTimeAsync(295_000);
    const lines = await request;

    expect(lines.get('EA')).toMatchObject({
      statusCode: 'Paralisada',
      description: 'Serviço temporariamente paralisado.',
    });
    expect(clientOf(service).waitForReady).toHaveBeenCalledTimes(1);
    expect(clientOf(service).check).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();
  });

  it('preserves nullable platform fields across the protobuf boundary', async () => {
    const service = createServiceWithClient({
      fetchNextTrains: unarySuccess({
        success: true,
        isApiError: false,
        trains: [
          {
            destinationCode: 'LUZ',
            destinationName: 'Luz',
            trainCurrentStationName: '',
            arrivalTime: '2026-07-25T22:00:00-03:00',
            hasIsAtPlatform: false,
            hasIsTrainStopped: true,
            isTrainStopped: false,
            trainLastPassedStationName: 'Brás',
          },
        ],
      }),
    });

    await expect(service.fetchNextTrains('L11', 'BAS')).resolves.toMatchObject({
      trains: [
        {
          isAtPlatform: null,
          isTrainStopped: false,
          trainLastPassedStationName: 'Brás',
        },
      ],
    });

    service.onModuleDestroy();
  });

  it('maps only generic scheduled service fields and omits protobuf defaults', async () => {
    const fetchScheduledService = jest.fn(
      unarySuccess({
        services: [
          {
            destinationCode: 'VAG',
            destinationName: 'Varginha',
            originStationCode: 'OSA',
            originStationName: 'Osasco',
            nextDepartureAt: '2026-09-09T12:04:00.000Z',
            nextArrivalAt: '2026-09-09T12:14:00.000Z',
            arrivalEstimated: true,
            intervalLabel: '3 min',
            followingDepartures: [
              {
                departureAt: '2026-09-09T12:07:00.000Z',
                arrivalAt: '2026-09-09T12:17:00.000Z',
              },
              {
                departureAt: '2026-09-09T12:10:00.000Z',
              },
              {
                departureAt: '2026-09-09T12:13:00.000Z',
              },
              {
                departureAt: '2026-09-09T12:16:00.000Z',
              },
            ],
            internalDetails: 'must not cross the boundary',
          },
          {
            destinationCode: 'OSA',
            destinationName: 'Osasco',
            originStationCode: 'VAG',
            originStationName: 'Varginha',
            nextDepartureAt: '2026-09-09T12:05:00.000Z',
            nextArrivalAt: '',
            arrivalEstimated: false,
            intervalLabel: '',
            followingDepartures: [],
          },
        ],
      }),
    );
    const service = createServiceWithClient({
      fetchScheduledService,
    });

    await expect(service.fetchScheduledService('L1', 'LUZ')).resolves.toEqual([
      {
        destinationCode: 'VAG',
        destinationName: 'Varginha',
        originStationCode: 'OSA',
        originStationName: 'Osasco',
        nextDepartureAt: '2026-09-09T12:04:00.000Z',
        nextArrivalAt: '2026-09-09T12:14:00.000Z',
        arrivalEstimated: true,
        intervalLabel: '3 min',
        followingDepartures: [
          {
            departureAt: '2026-09-09T12:07:00.000Z',
            arrivalAt: '2026-09-09T12:17:00.000Z',
          },
          { departureAt: '2026-09-09T12:10:00.000Z' },
          { departureAt: '2026-09-09T12:13:00.000Z' },
        ],
      },
      {
        destinationCode: 'OSA',
        destinationName: 'Osasco',
        originStationCode: 'VAG',
        originStationName: 'Varginha',
        nextDepartureAt: '2026-09-09T12:05:00.000Z',
      },
    ]);

    expect(fetchScheduledService).toHaveBeenCalledWith(
      { lineCode: 'L1', stationCode: 'LUZ' },
      { deadline: expect.any(Date) },
      expect.any(Function),
    );
    service.onModuleDestroy();
  });

  it('bounds and validates scheduled services at the integration boundary', async () => {
    const validService = (index: number) => ({
      destinationCode: `DST${index}`,
      destinationName: 'Destination',
      originStationCode: 'ORG',
      originStationName: 'Origin',
      nextDepartureAt: '2026-09-09T12:04:00.000Z',
    });
    const service = createServiceWithClient({
      fetchScheduledService: unarySuccess({
        services: [
          ...Array.from({ length: 64 }, (_, index) => validService(index)),
          validService(64),
        ],
      }),
    });

    await expect(
      service.fetchScheduledService('L1', 'LUZ'),
    ).resolves.toHaveLength(64);
    service.onModuleDestroy();

    const invalidService = createServiceWithClient({
      fetchScheduledService: unarySuccess({
        services: [
          { ...validService(0), destinationName: 'x'.repeat(257) },
          { ...validService(1), nextDepartureAt: 'not-a-date' },
          {
            ...validService(2),
            intervalLabel: 'x'.repeat(257),
            nextArrivalAt: 'not-a-date',
            followingDepartures: [
              { departureAt: 'not-a-date' },
              { departureAt: '2026-09-09T12:07:00.000Z' },
            ],
          },
        ],
      }),
    });

    await expect(
      invalidService.fetchScheduledService('L1', 'LUZ'),
    ).resolves.toEqual([
      {
        ...validService(2),
        followingDepartures: [{ departureAt: '2026-09-09T12:07:00.000Z' }],
      },
    ]);
    invalidService.onModuleDestroy();
  });

  it('propagates the current request correlation ID through gRPC metadata', async () => {
    const getStationCodes = jest.fn(
      (
        _request: unknown,
        metadata: Metadata,
        options: CallOptions,
        callback: (error: ServiceError | null, response?: unknown) => void,
      ) => {
        expect(metadata.get('x-correlation-id')).toEqual(['request-12345678']);
        expect(options.deadline).toEqual(new Date(1_789_000_010_000));
        callback(null, { stationCodes: ['LUZ'] });
      },
    );
    jest.spyOn(Date, 'now').mockReturnValue(1_789_000_000_000);
    const service = createServiceWithClient(
      { getStationCodes },
      { RAIL_INTEGRATION_GRPC_DEADLINE_MS: 10_000 },
      { getRequestId: () => 'request-12345678' },
    );

    await expect(service.getStationCodes('L11')).resolves.toEqual(['LUZ']);
    expect(getStationCodes).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it('passes configured readiness and request deadlines through call options', async () => {
    const now = 1_789_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const getStationCodes = jest.fn(unarySuccess({ stationCodes: ['LUZ'] }));
    const service = createServiceWithClient(
      { getStationCodes },
      {
        RAIL_INTEGRATION_GRPC_DEADLINE_MS: 10_000,
        RAIL_INTEGRATION_GRPC_READINESS_DEADLINE_MS: 2_000,
      },
    );

    await expect(service.getStationCodes('L11')).resolves.toEqual(['LUZ']);

    expect(clientOf(service).check).toHaveBeenCalledWith(
      {},
      { deadline: new Date(now + 2_000) },
      expect.any(Function),
    );
    expect(getStationCodes).toHaveBeenCalledWith(
      { lineCode: 'L11' },
      { deadline: new Date(now + 10_000) },
      expect.any(Function),
    );
    service.onModuleDestroy();
  });

  it.each(['check', 'getStationCodes'] as const)(
    'bounds retries when the real gRPC %s response stalls',
    async (stalledMethod) => {
      const server = new Server();
      let stalledCalls = 0;
      const handlers: RailIntegrationGrpcHandlers = {
        check: (_call, callback) => {
          if (stalledMethod === 'check') {
            stalledCalls += 1;
            return;
          }
          callback(null, { ready: true });
        },
        getStationCodes: (_call, callback) => {
          if (stalledMethod === 'getStationCodes') {
            stalledCalls += 1;
            return;
          }
          callback(null, { stationCodes: ['LUZ'] });
        },
      };
      server.addService(loadRailIntegrationGrpcDefinition().service, handlers);
      let service: RailIntegrationClientService | undefined;
      try {
        const port = await new Promise<number>((resolve, reject) => {
          server.bindAsync(
            '127.0.0.1:0',
            ServerCredentials.createInsecure(),
            (error, boundPort) => error ? reject(error) : resolve(boundPort),
          );
        });
        server.start();
        service = new RailIntegrationClientService(configService({
          RAIL_INTEGRATION_GRPC_URL: `127.0.0.1:${port}`,
          RAIL_INTEGRATION_GRPC_DEADLINE_MS: 100,
          RAIL_INTEGRATION_GRPC_READINESS_DEADLINE_MS: 100,
          RAIL_INTEGRATION_GRPC_MAX_ATTEMPTS: 2,
          RAIL_INTEGRATION_GRPC_RETRY_DELAY_MS: 1,
        }));
        const client = clientOf(service);
        await new Promise<void>((resolve, reject) => {
          client.waitForReady(
            new Date(Date.now() + 2_000),
            (error) => error ? reject(error) : resolve(),
          );
        });

        await expect(service.getStationCodes('L11')).rejects.toMatchObject({
          code: status.DEADLINE_EXCEEDED,
        });
        expect(stalledCalls).toBe(2);
      } finally {
        service?.onModuleDestroy();
        server.forceShutdown();
      }
    },
  );

  it('preserves generic vehicle display metadata across transport', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_789_000_000_000);
    const vehicle = {
      id: 'opaque-id',
      prefix: '',
      lat: -23.5,
      lng: -46.7,
      bearing: 0,
      lastUpdate: 1_789_000_000_000,
      estimated: true,
      validUntil: 1_789_000_060_000,
    };
    const service = createServiceWithClient({
      getVehiclesForLine: unarySuccess({ vehicles: [vehicle] }),
    });
    await expect(service.getVehiclesForLine('L9')).resolves.toEqual([vehicle]);
    service.onModuleDestroy();
  });

  it('rejects estimated vehicles with an unbounded validity period', async () => {
    const now = 1_789_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const service = createServiceWithClient({
      getVehiclesForLine: unarySuccess({
        vehicles: [
          {
            id: 'malicious-estimate',
            estimated: true,
            validUntil: Number.MAX_SAFE_INTEGER,
          },
          {
            id: 'short-lived-estimate',
            estimated: true,
            validUntil: now + 60_000,
          },
          { id: 'measured-vehicle', estimated: false },
        ],
      }),
    });

    await expect(service.getVehiclesForLine('L9')).resolves.toEqual([
      {
        id: 'short-lived-estimate',
        estimated: true,
        validUntil: now + 60_000,
      },
      { id: 'measured-vehicle', estimated: false },
    ]);
    service.onModuleDestroy();
  });

  it('retries transient failures with bounded attempts', async () => {
    const unavailable = serviceError(
      status.UNAVAILABLE,
      'upstream temporarily unavailable',
    );
    const getStationCodes = jest
      .fn()
      .mockImplementationOnce(unaryFailure(unavailable))
      .mockImplementationOnce(unarySuccess({ stationCodes: ['LUZ'] }));
    const service = createServiceWithClient(
      { getStationCodes },
      {
        RAIL_INTEGRATION_GRPC_RETRY_DELAY_MS: 1,
      },
    );

    await expect(service.getStationCodes('L11')).resolves.toEqual(['LUZ']);
    expect(getStationCodes).toHaveBeenCalledTimes(2);
    expect(clientOf(service).check).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
  });

  it('retries transport readiness deadline failures', async () => {
    const getStationCodes = jest.fn(unarySuccess({ stationCodes: ['LUZ'] }));
    const service = createServiceWithClient(
      { getStationCodes },
      {
        RAIL_INTEGRATION_GRPC_RETRY_DELAY_MS: 1,
      },
    );
    const waitForReady = clientOf(service).waitForReady as unknown as jest.Mock;
    waitForReady.mockImplementationOnce(
      (_deadline: Date, callback: (error?: Error) => void) =>
        callback(new Error('Failed to connect before the deadline')),
    );

    await expect(service.getStationCodes('L11')).resolves.toEqual(['LUZ']);
    expect(waitForReady).toHaveBeenCalledTimes(2);
    expect(clientOf(service).check).toHaveBeenCalledTimes(1);
    expect(getStationCodes).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();
  });

  it('does not retry application errors', async () => {
    const invalidArgument = serviceError(
      status.INVALID_ARGUMENT,
      'lineCode must be a non-empty string',
    );
    const getStationCodes = jest.fn(unaryFailure(invalidArgument));
    const service = createServiceWithClient({ getStationCodes });

    await expect(service.getStationCodes('L11')).rejects.toBe(invalidArgument);
    expect(getStationCodes).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();
  });

  it('cancels retry backoff during shutdown', async () => {
    jest.useFakeTimers();
    const unavailable = serviceError(status.UNAVAILABLE, 'temporarily down');
    const getStationCodes = jest.fn(unaryFailure(unavailable));
    const service = createServiceWithClient(
      { getStationCodes },
      { RAIL_INTEGRATION_GRPC_RETRY_DELAY_MS: 2_000 },
    );
    const request = service.getStationCodes('L11');
    await Promise.resolve();
    await Promise.resolve();

    service.onModuleDestroy();

    await expect(request).rejects.toMatchObject({ code: status.UNAVAILABLE });
    expect(getStationCodes).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2_000);
    expect(getStationCodes).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

function createServiceWithClient(
  methods: Record<string, unknown>,
  values: Record<string, string | number> = {},
  requestContext?: { getRequestId(): string | undefined },
): RailIntegrationClientService {
  const service = new RailIntegrationClientService(
    configService(values),
    requestContext as never,
  );
  clientOf(service).close();
  const client = {
    waitForReady: jest.fn((_deadline, callback) => callback()),
    check: jest.fn(unarySuccess({ ready: true })),
    close: jest.fn(),
    ...methods,
  } as unknown as RailIntegrationGrpcClient;

  Object.defineProperty(service, 'client', { value: client });
  return service;
}

function clientOf(
  service: RailIntegrationClientService,
): RailIntegrationGrpcClient {
  return (
    service as unknown as {
      client: RailIntegrationGrpcClient;
    }
  ).client;
}

function unarySuccess(response: unknown) {
  return (...args: unknown[]) => {
    const callback = args[args.length - 1] as (
      error: ServiceError | null,
      response?: unknown,
    ) => void;
    callback(null, response);
  };
}

function unaryFailure(error: ServiceError) {
  return (...args: unknown[]) => {
    const callback = args[args.length - 1] as (
      error: ServiceError | null,
      response?: unknown,
    ) => void;
    callback(error);
  };
}

function serviceError(code: status, details: string): ServiceError {
  return Object.assign(new Error(details), {
    code,
    details,
    metadata: new Metadata(),
  }) as ServiceError;
}

function configService(
  values: Record<string, string | number>,
): ConfigService<Record<string, unknown>, false> {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService<Record<string, unknown>, false>;
}
