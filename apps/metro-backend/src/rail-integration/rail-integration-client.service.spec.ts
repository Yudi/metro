import { ConfigService } from '@nestjs/config';
import { Metadata, ServiceError, status } from '@grpc/grpc-js';
import { RailIntegrationGrpcClient } from '@metro/rail-integration-contracts';
import { RailIntegrationClientService } from './rail-integration-client.service';

describe('RailIntegrationClientService', () => {
  afterEach(() => {
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

    const lines = await service.fetchSpecialRailStatusLines();

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
          },
        ],
      }),
    });

    await expect(service.fetchNextTrains('L11', 'BAS')).resolves.toMatchObject({
      trains: [
        {
          isAtPlatform: null,
          isTrainStopped: false,
        },
      ],
    });

    service.onModuleDestroy();
  });

  it('propagates the current request correlation ID through gRPC metadata', async () => {
    const getStationCodes = jest.fn(
      (
        _request: unknown,
        metadata: Metadata,
        _options: unknown,
        callback: (error: ServiceError | null, response?: unknown) => void,
      ) => {
        expect(metadata.get('x-correlation-id')).toEqual(['request-12345678']);
        callback(null, { stationCodes: ['LUZ'] });
      },
    );
    const service = createServiceWithClient(
      { getStationCodes },
      {},
      { getRequestId: () => 'request-12345678' },
    );

    await expect(service.getStationCodes('L11')).resolves.toEqual(['LUZ']);
    expect(getStationCodes).toHaveBeenCalledTimes(1);
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
    const getStationCodes = jest.fn(
      unaryFailure(invalidArgument),
    );
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
