jest.mock('../headway/headway-tracking.service', () => ({
  HeadwayTrackingService: class {},
}));
jest.mock('../services/cptm-vehicle-polling.service', () => ({
  CptmVehiclePollingService: class {},
}));

import { NextTrainGateway } from './next-train.gateway';

describe('NextTrainGateway', () => {
  it('immediately reports processing when a user request has no cached result', async () => {
    const polling = {
      onPollComplete: jest.fn(),
      offPollComplete: jest.fn(),
      subscribe: jest.fn(() => null),
    };
    const vehiclePolling = {
      onPollComplete: jest.fn(),
      offPollComplete: jest.fn(),
    };
    const gateway = new NextTrainGateway(
      polling as never,
      vehiclePolling as never,
      {} as never,
    );
    const client = {
      id: 'client-id',
      emit: jest.fn(),
    };
    gateway.handleConnection(client as never);

    await gateway.handleSubscribe(client as never, {
      lineCode: 'L11',
      stationCode: 'LUZ',
    });

    expect(client.emit).toHaveBeenCalledWith(
      'next_train_update',
      expect.objectContaining({
        lineCode: 'L11',
        stationCode: 'LUZ',
        trains: [],
        processing: true,
      }),
    );
  });

  it('accepts schedule-only lines and includes cached scheduled services in the full update', async () => {
    const scheduledServices = [
      {
        destinationCode: 'TUC',
        destinationName: 'Tucuruvi',
        originStationCode: 'JAB',
        originStationName: 'Jabaquara',
        nextDepartureAt: '2026-09-09T12:04:00.000Z',
        nextArrivalAt: '2026-09-09T12:14:00.000Z',
        arrivalEstimated: true,
        intervalLabel: '4 min',
        followingDepartures: [{ departureAt: '2026-09-09T12:08:00.000Z' }],
      },
    ];
    const polling = {
      onPollComplete: jest.fn(),
      offPollComplete: jest.fn(),
      subscribe: jest.fn(() => ({
        lineCode: 'L1',
        stationCode: 'LUZ',
        stationName: 'Luz',
        trains: [],
        scheduledServices,
        hash: 'hash',
        fetchedAt: 100,
        hasError: false,
        operationClosed: false,
        outOfSchedule: false,
      })),
    };
    const vehiclePolling = {
      onPollComplete: jest.fn(),
      offPollComplete: jest.fn(),
    };
    const gateway = new NextTrainGateway(
      polling as never,
      vehiclePolling as never,
      { getHeadway: jest.fn().mockResolvedValue(null) } as never,
    );
    const client = { id: 'client-id', emit: jest.fn() };
    gateway.handleConnection(client as never);

    await gateway.handleSubscribe(client as never, {
      lineCode: 'L1',
      stationCode: 'LUZ',
    });

    expect(client.emit).toHaveBeenCalledWith(
      'next_train_update',
      expect.objectContaining({
        lineCode: 'L1',
        stationCode: 'LUZ',
        trains: [],
        scheduledServices,
        processing: false,
      }),
    );
  });

  it('keeps scheduled services when headway retrieval fails for a delta', async () => {
    const scheduledServices = [
      {
        destinationCode: 'VAG',
        destinationName: 'Varginha',
        originStationCode: 'OSA',
        originStationName: 'Osasco',
        nextDepartureAt: '2026-09-09T12:04:00.000Z',
      },
    ];
    const polling = {
      onPollComplete: jest.fn(),
      offPollComplete: jest.fn(),
      getSubscribers: jest.fn(() => new Set(['client-id'])),
    };
    const vehiclePolling = {
      onPollComplete: jest.fn(),
      offPollComplete: jest.fn(),
    };
    const gateway = new NextTrainGateway(
      polling as never,
      vehiclePolling as never,
      {
        getHeadway: jest.fn().mockRejectedValue(new Error('headway offline')),
      } as never,
    );
    const emit = jest.fn();
    Object.defineProperty(gateway, 'server', {
      value: { to: jest.fn(() => ({ emit })) },
    });

    (
      gateway as unknown as {
        handleDeltas(deltas: unknown[]): void;
      }
    ).handleDeltas([
      {
        lineCode: 'L1',
        stationCode: 'LUZ',
        trains: [],
        scheduledServices,
        timestamp: 100,
        hasError: false,
        operationClosed: false,
        outOfSchedule: false,
      },
    ]);
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }

    expect(emit).toHaveBeenCalledWith(
      'next_train_update',
      expect.objectContaining({ scheduledServices, trains: [] }),
    );
  });

  it('keeps cached scheduled services when headway retrieval fails for a full update', async () => {
    const scheduledServices = [
      {
        destinationCode: 'VAG',
        destinationName: 'Varginha',
        originStationCode: 'OSA',
        originStationName: 'Osasco',
        nextDepartureAt: '2026-09-09T12:04:00.000Z',
      },
    ];
    const polling = {
      onPollComplete: jest.fn(),
      offPollComplete: jest.fn(),
      subscribe: jest.fn(() => ({
        lineCode: 'L9',
        stationCode: 'HBR',
        stationName: 'Hebraica-Rebouças',
        trains: [],
        scheduledServices,
        hash: 'hash',
        fetchedAt: 100,
        hasError: false,
        operationClosed: false,
        outOfSchedule: false,
      })),
    };
    const gateway = new NextTrainGateway(
      polling as never,
      { onPollComplete: jest.fn(), offPollComplete: jest.fn() } as never,
      {
        getHeadway: jest.fn().mockRejectedValue(new Error('headway offline')),
      } as never,
    );
    const client = { id: 'client-id', emit: jest.fn() };
    gateway.handleConnection(client as never);

    await gateway.handleSubscribe(client as never, {
      lineCode: 'L9',
      stationCode: 'HBR',
    });

    expect(client.emit).toHaveBeenCalledWith(
      'next_train_update',
      expect.objectContaining({ scheduledServices, trains: [] }),
    );
  });

  it.each([null, 'invalid', [], { lineCode: 'L11' }])(
    'rejects malformed station payloads without calling polling',
    async (payload) => {
      const polling = {
        onPollComplete: jest.fn(),
        offPollComplete: jest.fn(),
        subscribe: jest.fn(),
      };
      const vehiclePolling = {
        onPollComplete: jest.fn(),
        offPollComplete: jest.fn(),
      };
      const gateway = new NextTrainGateway(
        polling as never,
        vehiclePolling as never,
        {} as never,
      );
      const client = { id: 'client-id', emit: jest.fn() };
      gateway.handleConnection(client as never);

      await gateway.handleSubscribe(client as never, payload);

      expect(polling.subscribe).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid subscription payload.',
      });
    },
  );
});
