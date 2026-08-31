import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChannelCredentials,
  Client,
  Metadata,
  ServiceError,
  status,
} from '@grpc/grpc-js';
import {
  ActualCptmLineCode,
  CptmLineCode,
  ExtendedNextTrainLineCode,
  SpecialRailService,
} from '@metro/shared/utils';
import {
  loadRailIntegrationGrpcDefinition,
  RailHeadwayObservation,
  RailIntegrationGrpcClient,
  RailNextTrainArrival,
  RailNextTrainFetchResult,
  RailRealtimeSourcePort,
  RailStationLookupResult,
  RailVehiclePosition,
  RAIL_INTEGRATION_GRPC_DEFAULT_CLIENT_URL,
  RailStatusSourceLine,
  RailStatusSourcePort,
  RailSpecialStatusSourceLine,
} from '@metro/rail-integration-contracts';
import { RequestContextService } from '../common/request-context/request-context.service';

const DEFAULT_DEADLINE_MS = 120_000;
const DEFAULT_READINESS_DEADLINE_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 2_000;

interface StationNameResponse {
  stationName?: string;
}

interface NextTrainTransportArrival
  extends Omit<RailNextTrainArrival, 'isAtPlatform' | 'isTrainStopped'> {
  hasIsAtPlatform?: boolean;
  hasIsTrainStopped?: boolean;
  isAtPlatform?: boolean;
  isTrainStopped?: boolean;
}

interface NextTrainsTransportResponse
  extends Omit<RailNextTrainFetchResult, 'trains'> {
  trains?: NextTrainTransportArrival[];
}

interface StationCodesResponse {
  stationCodes?: string[];
}

interface StationLookupResponse extends RailStationLookupResult {
  found: boolean;
}

interface VehiclesResponse {
  vehicles?: RailVehiclePosition[];
}

interface SpecialRailServicesResponse {
  services?: SpecialRailService[];
}

interface HeadwayObservationsResponse {
  observations?: RailHeadwayObservation[];
}

interface RailStatusLinesResponse {
  lines?: RailStatusSourceLine[];
}

interface SpecialRailStatusLinesResponse {
  lines?: RailSpecialStatusSourceLine[];
}

type RailIntegrationMethod =
  | 'fetchNextTrains'
  | 'getStationName'
  | 'getStationCodes'
  | 'getStationByName'
  | 'getVehiclesForLine'
  | 'getAvailableSpecialRailServices'
  | 'fetchHeadwayObservations'
  | 'fetchRailStatusLines'
  | 'fetchSpecialRailStatusLines';

type UnaryCallback = (error: ServiceError | null, response?: unknown) => void;

@Injectable()
export class RailIntegrationClientService
  extends RailRealtimeSourcePort
  implements RailStatusSourcePort, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(RailIntegrationClientService.name);
  private readonly target: string;
  private readonly deadlineMs: number;
  private readonly readinessDeadlineMs: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly client: RailIntegrationGrpcClient;
  private readonly shutdownController = new AbortController();
  private readinessPromise?: Promise<void>;

  constructor(
    configService: ConfigService,
    @Optional() private readonly requestContext?: RequestContextService,
  ) {
    super();
    this.target =
      configService.get<string>('RAIL_INTEGRATION_GRPC_URL')?.trim() ||
      RAIL_INTEGRATION_GRPC_DEFAULT_CLIENT_URL;
    this.deadlineMs = readPositiveInteger(
      configService,
      'RAIL_INTEGRATION_GRPC_DEADLINE_MS',
      DEFAULT_DEADLINE_MS,
    );
    this.readinessDeadlineMs = readPositiveInteger(
      configService,
      'RAIL_INTEGRATION_GRPC_READINESS_DEADLINE_MS',
      DEFAULT_READINESS_DEADLINE_MS,
    );
    this.maxAttempts = Math.min(
      readPositiveInteger(
        configService,
        'RAIL_INTEGRATION_GRPC_MAX_ATTEMPTS',
        DEFAULT_MAX_ATTEMPTS,
      ),
      5,
    );
    this.retryDelayMs = readPositiveInteger(
      configService,
      'RAIL_INTEGRATION_GRPC_RETRY_DELAY_MS',
      DEFAULT_RETRY_DELAY_MS,
    );

    const definition = loadRailIntegrationGrpcDefinition();
    this.client = new definition.client(
      this.target,
      ChannelCredentials.createInsecure(),
    ) as unknown as RailIntegrationGrpcClient;
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureReady();
    } catch (error) {
      this.logger.warn(
        `Rail integration gRPC is not ready at startup; requests will retry lazily: ${this.formatGrpcError(error)}`,
      );
    }
  }

  onModuleDestroy(): void {
    this.shutdownController.abort();
    this.client.close();
  }

  fetchNextTrains(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ): Promise<RailNextTrainFetchResult> {
    return this.call<NextTrainsTransportResponse>('fetchNextTrains', {
      lineCode,
      stationCode,
    }).then((response) => ({
      success: response.success,
      isApiError: response.isApiError,
      trains: (response.trains ?? []).map((train) => ({
        destinationCode: train.destinationCode,
        destinationName: train.destinationName,
        trainCurrentStationName: train.trainCurrentStationName,
        arrivalTime: train.arrivalTime,
        isAtPlatform: train.hasIsAtPlatform
          ? (train.isAtPlatform ?? false)
          : null,
        isTrainStopped: train.hasIsTrainStopped
          ? (train.isTrainStopped ?? false)
          : null,
        trainPositionStatus: train.trainPositionStatus,
        trainNearStationName: train.trainNearStationName,
        cars: train.cars,
      })),
    }));
  }

  async getStationName(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ): Promise<string | undefined> {
    const response = await this.call<StationNameResponse>('getStationName', {
      lineCode,
      stationCode,
    });
    return response.stationName;
  }

  async getStationCodes(
    lineCode: ExtendedNextTrainLineCode,
  ): Promise<string[]> {
    const response = await this.call<StationCodesResponse>('getStationCodes', {
      lineCode,
    });
    return response.stationCodes ?? [];
  }

  async getStationByName(
    lineCode: ActualCptmLineCode,
    stationName: string,
  ): Promise<RailStationLookupResult | undefined> {
    const response = await this.call<StationLookupResponse>(
      'getStationByName',
      {
        lineCode,
        stationName,
      },
    );

    if (!response.found) {
      return undefined;
    }

    return {
      stationCode: response.stationCode,
      stationName: response.stationName,
      latitude: response.latitude,
      longitude: response.longitude,
    };
  }

  async getVehiclesForLine(
    lineCode: CptmLineCode,
  ): Promise<RailVehiclePosition[]> {
    const response = await this.call<VehiclesResponse>('getVehiclesForLine', {
      lineCode,
    });
    return response.vehicles ?? [];
  }

  async getAvailableSpecialRailServices(): Promise<SpecialRailService[]> {
    const response = await this.call<SpecialRailServicesResponse>(
      'getAvailableSpecialRailServices',
      {},
    );
    return response.services ?? [];
  }

  async fetchHeadwayObservations(
    lineCode: ActualCptmLineCode,
    stationCode: string,
  ): Promise<RailHeadwayObservation[]> {
    const response = await this.call<HeadwayObservationsResponse>(
      'fetchHeadwayObservations',
      {
        lineCode,
        stationCode,
      },
    );
    return response.observations ?? [];
  }

  async fetchRailStatusLines(): Promise<Map<number, RailStatusSourceLine>> {
    const response = await this.call<RailStatusLinesResponse>(
      'fetchRailStatusLines',
      {},
    );
    return new Map((response.lines ?? []).map((line) => [line.code, line]));
  }

  async fetchSpecialRailStatusLines(): Promise<
    Map<string, RailSpecialStatusSourceLine>
  > {
    const response = await this.call<SpecialRailStatusLinesResponse>(
      'fetchSpecialRailStatusLines',
      {},
    );
    return new Map((response.lines ?? []).map((line) => [line.code, line]));
  }

  private async call<TResponse>(
    method: RailIntegrationMethod,
    request: Record<string, unknown>,
  ): Promise<TResponse> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (this.shutdownController.signal.aborted) {
        throw createUnavailableError(
          'Rail integration client is shutting down',
        );
      }
      try {
        await this.ensureReady();
        return await this.invoke<TResponse>(method, request, this.deadlineMs);
      } catch (error) {
        lastError = error;
        if (!this.isTransient(error) || attempt === this.maxAttempts) {
          this.logger.error(
            `Rail integration gRPC ${method} failed after ${attempt} attempt(s): ${this.formatGrpcError(error)}`,
          );
          throw error;
        }

        this.readinessPromise = undefined;
        const delayMs = Math.min(
          this.retryDelayMs * 2 ** (attempt - 1),
          MAX_RETRY_DELAY_MS,
        );
        this.logger.warn(
          `Rail integration gRPC ${method} transient failure; retrying attempt ${attempt + 1}/${this.maxAttempts} in ${delayMs}ms: ${this.formatGrpcError(error)}`,
        );
        await delay(delayMs, this.shutdownController.signal);
      }
    }

    throw lastError;
  }

  private ensureReady(): Promise<void> {
    this.readinessPromise ??= this.performReadinessHandshake().catch(
      (error) => {
        this.readinessPromise = undefined;
        throw error;
      },
    );
    return this.readinessPromise;
  }

  private async performReadinessHandshake(): Promise<void> {
    try {
      await waitForReady(this.client, this.readinessDeadlineMs);
    } catch (error) {
      throw createUnavailableError(
        `Private rail integration transport is not ready: ${formatError(error)}`,
      );
    }

    const response = await this.invoke<{ ready?: boolean }>(
      'check',
      {},
      this.readinessDeadlineMs,
    );

    if (!response.ready) {
      throw createUnavailableError('Private rail integration is not ready');
    }
  }

  private invoke<TResponse>(
    method: RailIntegrationMethod | 'check',
    request: Record<string, unknown>,
    deadlineMs: number,
  ): Promise<TResponse> {
    return new Promise<TResponse>((resolve, reject) => {
      const unaryCall = this.client[method] as (
        request: Record<string, unknown>,
        deadline: Date,
        callback: (error: ServiceError | null, response?: unknown) => void,
      ) => unknown;
      const callback: UnaryCallback = (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        if (response === undefined) {
          reject(createUnavailableError(`Empty gRPC response for ${method}`));
          return;
        }
        resolve(response as TResponse);
      };
      const deadline = new Date(Date.now() + deadlineMs);
      const correlationId = this.requestContext?.getRequestId();
      if (correlationId) {
        const metadata = new Metadata();
        metadata.set('x-correlation-id', correlationId);
        (
          unaryCall as unknown as (
            request: Record<string, unknown>,
            metadata: Metadata,
            options: { deadline: Date },
            callback: UnaryCallback,
          ) => unknown
        ).call(this.client, request, metadata, { deadline }, callback);
        return;
      }
      unaryCall.call(this.client, request, deadline, callback);
    });
  }

  private isTransient(error: unknown): boolean {
    if (!isServiceError(error)) {
      return false;
    }
    return [
      status.ABORTED,
      status.DEADLINE_EXCEEDED,
      status.RESOURCE_EXHAUSTED,
      status.UNAVAILABLE,
    ].includes(error.code);
  }

  private formatGrpcError(error: unknown): string {
    if (!isServiceError(error)) {
      return error instanceof Error ? error.message : String(error);
    }
    return `code=${status[error.code] ?? error.code} target=${this.target} details=${error.details || error.message}`;
  }
}

function readPositiveInteger(
  configService: ConfigService,
  key: string,
  fallback: number,
): number {
  const value = Number(configService.get<string | number>(key));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function waitForReady(client: Client, deadlineMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    client.waitForReady(new Date(Date.now() + deadlineMs), (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function isServiceError(error: unknown): error is ServiceError {
  return (
    error instanceof Error && 'code' in error && typeof error.code === 'number'
  );
}

function createUnavailableError(message: string): ServiceError {
  return Object.assign(new Error(message), {
    code: status.UNAVAILABLE,
    details: message,
    metadata: new Metadata(),
  }) as ServiceError;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(
      createUnavailableError('Rail integration client is shutting down'),
    );
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onAbort);
      reject(
        createUnavailableError('Rail integration client is shutting down'),
      );
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
