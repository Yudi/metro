jest.mock('../services/headway-tracking.service', () => ({
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
});
