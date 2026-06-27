import { RailRealtimeSourcePort } from '@metro/rail-integration-contracts';
import { RailSpecialServicesService } from './rail-special-services.service';

describe('RailSpecialServicesService', () => {
  it('returns an empty registry when the rail integration source is unavailable', async () => {
    const provider = {
      getAvailableSpecialRailServices: jest.fn().mockRejectedValue(new Error('offline')),
    } as unknown as RailRealtimeSourcePort;
    const service = new RailSpecialServicesService(provider);

    await expect(service.getAvailableServices()).resolves.toEqual([]);
  });
});
