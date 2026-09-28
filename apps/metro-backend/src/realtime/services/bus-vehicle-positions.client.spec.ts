import type { ServiceError } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import { loadBusItineraryGrpcDefinition } from '@metro/shared/bus-itinerary-contracts/grpc';
import { BusVehiclePositionsClient } from './bus-vehicle-positions.client';

jest.mock('@metro/shared/bus-itinerary-contracts/grpc', () => ({
  loadBusItineraryGrpcDefinition: jest.fn(),
}));

type VehiclePositionsCallback = (
  error: ServiceError | null,
  response?: unknown,
) => void;

class FakeBusItineraryClient {
  readonly getVehiclePositions = jest.fn<
    void,
    [
      { routeCode: string },
      { deadline: Date },
      VehiclePositionsCallback,
    ]
  >();
  readonly close = jest.fn();
}

const loadDefinition = jest.mocked(loadBusItineraryGrpcDefinition);

describe('BusVehiclePositionsClient', () => {
  beforeEach(() => {
    loadDefinition.mockReturnValue({
      client: FakeBusItineraryClient as never,
      service: {},
    });
  });

  it('uses the shared gRPC client and returns only validated contract fields', async () => {
    const config = { get: jest.fn().mockReturnValue('rail-private:50051') };
    const client = new BusVehiclePositionsClient(
      config as unknown as ConfigService,
    );
    const transport = (client as unknown as { client: FakeBusItineraryClient })
      .client;
    transport.getVehiclePositions.mockImplementation(
      (_request, _options, callback) =>
        callback(null, {
          positions: [
            {
              plate: 'ABC1234',
              latitude: -23.5,
              longitude: -46.6,
              recordedAt: '2026-09-28T12:30:00.000Z',
              providerField: 'must not escape',
            },
          ],
          providerMetadata: 'must not escape',
        }),
    );

    await expect(client.getVehiclePositions('125')).resolves.toEqual([
      {
        plate: 'ABC1234',
        latitude: -23.5,
        longitude: -46.6,
        recordedAt: '2026-09-28T12:30:00.000Z',
      },
    ]);
    expect(transport.getVehiclePositions).toHaveBeenCalledWith(
      { routeCode: '125' },
      { deadline: expect.any(Date) },
      expect.any(Function),
    );

    client.onModuleDestroy();
    expect(transport.close).toHaveBeenCalled();
  });

  it('rejects invalid coordinates and malformed responses', async () => {
    const client = new BusVehiclePositionsClient({
      get: jest.fn().mockReturnValue('rail-private:50051'),
    } as unknown as ConfigService);
    const transport = (client as unknown as { client: FakeBusItineraryClient })
      .client;
    transport.getVehiclePositions.mockImplementation(
      (_request, _options, callback) =>
        callback(null, {
          positions: [
            {
              plate: 'ABC1234',
              latitude: 91,
              longitude: -46.6,
              recordedAt: '2026-09-28T12:30:00.000Z',
            },
          ],
        }),
    );

    await expect(client.getVehiclePositions('125')).rejects.toThrow(
      'Invalid vehicle position coordinate',
    );
    await expect(client.getVehiclePositions('')).rejects.toThrow(
      'Invalid route code',
    );
  });
});
