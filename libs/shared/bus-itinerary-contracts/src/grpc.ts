/** Node-only transport entrypoint. Browser consumers import the types entrypoint. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadPackageDefinition, ServiceClientConstructor } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

export function loadBusItineraryGrpcDefinition(additionalRoots: string[] = []) {
  const roots = [
    ...additionalRoots,
    join(__dirname, 'assets/grpc'),
    join(__dirname, '../assets/grpc'),
    join(process.cwd(), 'assets/grpc'),
    join(process.cwd(), 'src/assets/grpc'),
    join(process.cwd(), 'libs/shared/bus-itinerary-contracts/src/assets/grpc'),
  ];
  const path = roots
    .map((root) => join(root, 'bus-itinerary.proto'))
    .find(existsSync);
  if (!path) throw new Error('Bus itinerary transport definition not found');
  const loaded = loadPackageDefinition(
    loadSync(path, {
      defaults: true,
      enums: String,
      keepCase: false,
      longs: Number,
      oneofs: false,
    }),
  );
  let value: unknown = loaded;
  for (const key of [
    'metro',
    'bus',
    'itinerary',
    'v1',
    'BusItineraryService',
  ]) {
    if (!value || typeof value !== 'object' || !(key in value)) {
      throw new Error('Invalid bus itinerary transport definition');
    }
    value = (value as Record<string, unknown>)[key];
  }
  if (typeof value !== 'function' || !('service' in value)) {
    throw new Error('Invalid bus itinerary transport service');
  }
  const client = value as ServiceClientConstructor;
  return { client, service: client.service };
}
