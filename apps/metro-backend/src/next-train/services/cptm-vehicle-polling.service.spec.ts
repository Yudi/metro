jest.mock('@metro/rail-integration-contracts', () => ({}));

import { CptmVehiclePollingService } from './cptm-vehicle-polling.service';

describe('CptmVehiclePollingService', () => {
  it('emits the first authoritative empty snapshot', async () => {
    const provider = { getVehiclesForLine: jest.fn().mockResolvedValue([]) };
    const service = new CptmVehiclePollingService(provider as never);
    const listener = jest.fn();
    service.onPollComplete(listener);
    (
      service as unknown as {
        subscriptions: Map<string, Set<string>>;
        poll(): Promise<void>;
      }
    ).subscriptions.set('L10', new Set(['client']));

    await (
      service as unknown as { poll(): Promise<void> }
    ).poll();

    expect(listener).toHaveBeenCalledWith([
      expect.objectContaining({ lineCode: 'L10', vehicles: [] }),
    ]);
    await service.onModuleDestroy();
  });
});
