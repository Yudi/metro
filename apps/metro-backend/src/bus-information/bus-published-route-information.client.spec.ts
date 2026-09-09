import { ConfigService } from '@nestjs/config';
import { loadBusItineraryGrpcDefinition } from '@metro/shared/bus-itinerary-contracts/grpc';
import { BusPublishedRouteInformationClient } from './bus-published-route-information.client';

jest.mock('@metro/shared/bus-itinerary-contracts/grpc', () => ({
  loadBusItineraryGrpcDefinition: jest.fn(),
}));

const published = {
  status: 'AVAILABLE',
  routeCode: '477A-10',
  lastUpdated: '2026-09-07T12:00:00.000Z',
  operatorName: 'Agência publicada',
  consortiumName: 'Consórcio publicado',
  days: [
    {
      kind: 'weekday',
      directions: [
        {
          id: 'outbound',
          headsign: 'Praça da Sé',
          departures: ['06:00:00'],
          streets: [
            { name: 'Rua Exemplo', number: '100', notices: ['Obra na via'] },
          ],
          travelTimes: [{ period: 'morning', minutes: 45 }],
          startTime: '05:00:00',
          endTime: '23:00:00',
        },
      ],
    },
  ],
};

class FakeBusItineraryClient {
  readonly getPublishedRouteInformation = jest.fn();
  readonly close = jest.fn();
}

const loadDefinition = jest.mocked(loadBusItineraryGrpcDefinition);

describe('BusPublishedRouteInformationClient', () => {
  beforeEach(() => {
    loadDefinition.mockReturnValue({
      client: FakeBusItineraryClient as never,
      service: {},
    });
  });

  it('uses the existing rail gRPC target and returns the shared shape', async () => {
    const config = {
      get: jest.fn().mockReturnValue('rail-private:50051'),
    };
    const client = new BusPublishedRouteInformationClient(
      config as unknown as ConfigService,
    );
    const transport = (client as unknown as { client: FakeBusItineraryClient })
      .client;
    transport.getPublishedRouteInformation.mockImplementation(
      (_request, _options, callback) => callback(null, published),
    );

    await expect(client.fetch('477A-10')).resolves.toEqual(published);
    expect(transport.getPublishedRouteInformation).toHaveBeenCalledWith(
      { routeCode: '477A-10' },
      { deadline: expect.any(Date) },
      expect.any(Function),
    );
    client.onModuleDestroy();
    expect(transport.close).toHaveBeenCalled();
  });

  it('maps proto default empty strings to null and rejects mismatched route codes', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const client = new BusPublishedRouteInformationClient(
      config as unknown as ConfigService,
    );
    const transport = (client as unknown as { client: FakeBusItineraryClient })
      .client;
    transport.getPublishedRouteInformation.mockImplementation(
      (_request, _options, callback) =>
        callback(null, {
          ...published,
          routeCode: 'other-route',
          lastUpdated: '',
          operatorName: '',
          consortiumName: '',
        }),
    );

    await expect(client.fetch('477A-10')).rejects.toThrow(
      'does not match request',
    );
  });

  it('fails closed for an unavailable gRPC response', async () => {
    const client = new BusPublishedRouteInformationClient({
      get: jest.fn().mockReturnValue('rail-private:50051'),
    } as unknown as ConfigService);
    const transport = (client as unknown as { client: FakeBusItineraryClient })
      .client;
    transport.getPublishedRouteInformation.mockImplementation(
      (_request, _options, callback) =>
        callback(Object.assign(new Error('connection refused'), { code: 14 })),
    );

    await expect(client.fetch('477A-10')).rejects.toThrow('connection refused');
  });
});
