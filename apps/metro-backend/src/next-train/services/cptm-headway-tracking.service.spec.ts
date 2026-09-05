jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class {},
}));

import { CptmHeadwayTrackingService } from './cptm-headway-tracking.service';

describe('CptmHeadwayTrackingService', () => {
  it('does not retain or record observations in the central off-hours window', async () => {
    const cache = {
      getCptmTrackingState: jest.fn(),
      saveCptmTrackingState: jest.fn(),
      getCptmLastPassage: jest.fn(),
      saveCptmLastPassage: jest.fn(),
      recordPassage: jest.fn(),
    };
    const headwayTracking = {
      calculateAndCacheHeadway: jest.fn(),
    };
    const service = new CptmHeadwayTrackingService(
      {} as never,
      cache as never,
      headwayTracking as never,
    );

    await service.processObservations(
      'L10',
      'LUZ',
      [
        {
          trainKey: 'opaque-train',
          directionName: 'Jundiaí',
          secondsToStation: 0,
        },
      ],
      new Date('2026-06-12T02:00:00-03:00').getTime(),
    );

    expect(cache.getCptmTrackingState).not.toHaveBeenCalled();
    expect(cache.saveCptmTrackingState).not.toHaveBeenCalled();
    expect(cache.recordPassage).not.toHaveBeenCalled();
    expect(headwayTracking.calculateAndCacheHeadway).not.toHaveBeenCalled();
  });
});
