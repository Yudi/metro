jest.mock('@metro/rail-integration-contracts', () => ({}));
jest.mock('./rail-map-context.service', () => ({ RailMapContextService: class {} }));

import { CptmVehiclePollingService } from './cptm-vehicle-polling.service';

describe('CptmVehiclePollingService', () => {
  const vehicle = {
    id: 'opaque-id', prefix: '', lat: -23.5, lng: -46.7, bearing: 0,
    wheelchair: false, climatized: false, lastUpdate: 1_000,
    averageSpeed: 0, stopSequence: 0, estimated: true, validUntil: 61_000,
  };

  it('reuses a completed line snapshot for another client and publishes expiry renewals', async () => {
    const provider = { getVehiclesForLine: jest.fn().mockResolvedValue([vehicle]) };
    const context = { stations: [], paths: [] };
    const service = new CptmVehiclePollingService(provider as never, {
      getContext: jest.fn().mockResolvedValue(context),
    } as never);
    const listener = jest.fn();
    service.onPollComplete(listener);
    service.subscribe('first-client', 'L9');
    await service['activePoll'];
    expect(service.subscribe('second-client', 'L9')?.vehicles).toEqual([vehicle]);
    expect(provider.getVehiclesForLine).toHaveBeenCalledTimes(1);
    expect(provider.getVehiclesForLine).toHaveBeenCalledWith('L9', context);

    provider.getVehiclesForLine.mockResolvedValue([{ ...vehicle, validUntil: 91_000 }]);
    await service['poll']();
    expect(listener).toHaveBeenLastCalledWith([
      expect.objectContaining({ vehicles: [{ ...vehicle, validUntil: 91_000 }] }),
    ]);
    service.unsubscribe('first-client', 'L9');
    expect(service.getSubscribers('L9').size).toBe(1);
    service.unsubscribe('second-client', 'L9');
    expect(service.getCached('L9')).toBeNull();
    await service.onModuleDestroy();
  });

  it('does not restore a removed line when an in-flight request completes', async () => {
    let complete!: (vehicles: typeof vehicle[]) => void;
    const provider = { getVehiclesForLine: jest.fn(() => new Promise<typeof vehicle[]>((resolve) => { complete = resolve; })) };
    const service = new CptmVehiclePollingService(provider as never, {
      getContext: jest.fn().mockResolvedValue(undefined),
    } as never);
    service.subscribe('client', 'L9');
    await Promise.resolve();
    service.unsubscribe('client', 'L9');
    complete([vehicle]);
    await service.onModuleDestroy();
    expect(service.getCached('L9')).toBeNull();
  });

  it('emits the first authoritative empty snapshot', async () => {
    const provider = { getVehiclesForLine: jest.fn().mockResolvedValue([]) };
    const service = new CptmVehiclePollingService(provider as never, {
      getContext: jest.fn().mockResolvedValue(undefined),
    } as never);
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
