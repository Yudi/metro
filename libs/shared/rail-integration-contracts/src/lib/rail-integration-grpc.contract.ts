import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Client,
  ClientUnaryCall,
  handleUnaryCall,
  loadPackageDefinition,
  ServiceClientConstructor,
  ServiceDefinition,
  ServiceError,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

export const RAIL_INTEGRATION_GRPC_PACKAGE =
  'metro.rail.integration.v1' as const;
export const RAIL_INTEGRATION_GRPC_SERVICE =
  'RailIntegrationService' as const;
export const RAIL_INTEGRATION_GRPC_DEFAULT_PORT = 50051;
export const RAIL_INTEGRATION_GRPC_DEFAULT_BIND_URL =
  `0.0.0.0:${RAIL_INTEGRATION_GRPC_DEFAULT_PORT}`;
export const RAIL_INTEGRATION_GRPC_DEFAULT_CLIENT_URL =
  `localhost:${RAIL_INTEGRATION_GRPC_DEFAULT_PORT}`;
export const RAIL_INTEGRATION_PROTO_FILENAME = 'rail-integration.proto';

export type GrpcUnaryCallback<TResponse> = (
  error: ServiceError | null,
  response?: TResponse,
) => void;

export interface GrpcUnaryCall<TRequest, TResponse> {
  (
    request: TRequest,
    deadline: Date,
    callback: GrpcUnaryCallback<TResponse>,
  ): ClientUnaryCall;
}

export type RailIntegrationGrpcClient = Client & {
  check: GrpcUnaryCall<unknown, { ready: boolean }>;
  fetchNextTrains: GrpcUnaryCall<unknown, unknown>;
  getStationName: GrpcUnaryCall<unknown, unknown>;
  getStationCodes: GrpcUnaryCall<unknown, unknown>;
  getStationByName: GrpcUnaryCall<unknown, unknown>;
  getVehiclesForLine: GrpcUnaryCall<unknown, unknown>;
  getAvailableSpecialRailServices: GrpcUnaryCall<unknown, unknown>;
  fetchHeadwayObservations: GrpcUnaryCall<unknown, unknown>;
  fetchRailStatusLines: GrpcUnaryCall<unknown, unknown>;
  fetchSpecialRailStatusLines: GrpcUnaryCall<unknown, unknown>;
};

export type RailIntegrationGrpcHandlers = Record<
  string,
  handleUnaryCall<unknown, unknown>
>;

interface RailIntegrationGrpcDefinition {
  service: ServiceDefinition;
  client: ServiceClientConstructor;
}

export function loadRailIntegrationGrpcDefinition(
  additionalProtoRoots: string[] = [],
): RailIntegrationGrpcDefinition {
  const protoPath = resolveRailIntegrationProtoPath(additionalProtoRoots);
  const packageDefinition = loadSync(protoPath, {
    defaults: true,
    enums: String,
    keepCase: false,
    longs: Number,
    oneofs: false,
  });
  const loadedPackage = loadPackageDefinition(packageDefinition);
  const serviceConstructor = readServiceConstructor(loadedPackage);

  return {
    service: serviceConstructor.service,
    client: serviceConstructor,
  };
}

export function resolveRailIntegrationProtoPath(
  additionalProtoRoots: string[] = [],
): string {
  const candidateRoots = [
    ...additionalProtoRoots,
    join(__dirname, 'assets/grpc'),
    join(process.cwd(), 'assets/grpc'),
    join(process.cwd(), 'src/assets/grpc'),
    join(
      process.cwd(),
      'libs/shared/rail-integration-contracts/src/assets/grpc',
    ),
  ];

  for (const root of candidateRoots) {
    const candidate = join(root, RAIL_INTEGRATION_PROTO_FILENAME);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate ${RAIL_INTEGRATION_PROTO_FILENAME}. Checked: ${candidateRoots.join(', ')}`,
  );
}

function readServiceConstructor(
  loadedPackage: ReturnType<typeof loadPackageDefinition>,
): ServiceClientConstructor {
  const metroPackage = loadedPackage['metro'];
  if (!isGrpcObject(metroPackage)) {
    throw new Error('Invalid rail integration gRPC package: metro');
  }

  const railPackage = metroPackage['rail'];
  if (!isGrpcObject(railPackage)) {
    throw new Error('Invalid rail integration gRPC package: metro.rail');
  }

  const integrationPackage = railPackage['integration'];
  if (!isGrpcObject(integrationPackage)) {
    throw new Error(
      'Invalid rail integration gRPC package: metro.rail.integration',
    );
  }

  const versionPackage = integrationPackage['v1'];
  if (!isGrpcObject(versionPackage)) {
    throw new Error(
      'Invalid rail integration gRPC package: metro.rail.integration.v1',
    );
  }

  const service = versionPackage[RAIL_INTEGRATION_GRPC_SERVICE];
  if (typeof service !== 'function' || !('service' in service)) {
    throw new Error(
      `Invalid rail integration gRPC service: ${RAIL_INTEGRATION_GRPC_SERVICE}`,
    );
  }

  return service as ServiceClientConstructor;
}

function isGrpcObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
