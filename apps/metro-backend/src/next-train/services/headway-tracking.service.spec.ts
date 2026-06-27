jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class {},
}));

jest.mock('../../historical/historical.service', () => ({
  HistoricalService: class {},
}));

import type { HeadwayBucketId } from '@metro/shared/utils';
import { HistoricalService } from '../../historical/historical.service';
import { PrismaService } from '../../prisma/prisma.service';
import { HeadwayCacheService } from './headway-cache.service';
import { HeadwayTrackingService } from './headway-tracking.service';

describe('HeadwayTrackingService', () => {
  let service: HeadwayTrackingService;
  let cache: {
    getActiveHeadwayHistoryBucket: jest.Mock<Promise<HeadwayBucketId | null>>;
    saveActiveHeadwayHistoryBucket: jest.Mock<Promise<void>>;
    recordPassage: jest.Mock<Promise<void>>;
    getPassages: jest.Mock<Promise<number[]>>;
    calculateHeadwayForBucket: jest.Mock;
    cacheHeadway: jest.Mock<Promise<void>>;
  };
  let prisma: {
    trainPassage: {
      create: jest.Mock<Promise<void>>;
      findMany: jest.Mock;
    };
  };
  let historicalService: {
    recordHeadwayResult: jest.Mock<Promise<void>>;
    recordHeadwayError: jest.Mock<Promise<void>>;
  };

  const eveningPassages = [
    new Date('2026-06-11T21:50:00-03:00').getTime(),
    new Date('2026-06-11T21:45:00-03:00').getTime(),
    new Date('2026-06-11T21:40:00-03:00').getTime(),
  ];

  beforeEach(() => {
    jest.useFakeTimers();

    prisma = {
      trainPassage: {
        create: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn().mockResolvedValue([
          {
            direction: 'Palmeiras-Barra Funda',
          },
        ]),
      },
    };

    cache = {
      getActiveHeadwayHistoryBucket: jest.fn().mockResolvedValue(null),
      saveActiveHeadwayHistoryBucket: jest.fn().mockResolvedValue(undefined),
      recordPassage: jest.fn().mockResolvedValue(undefined),
      getPassages: jest.fn().mockResolvedValue(eveningPassages),
      calculateHeadwayForBucket: jest.fn(
        (
          _timestamps: number[],
          targetBucket: HeadwayBucketId,
        ) => ({
          averageSeconds: 300,
          sampleCount: 2,
          bucket: targetBucket,
          isFallback: false,
          intervalSamplesSeconds: [300, 300],
          discardedIntervalCount: 0,
        }),
      ),
      cacheHeadway: jest.fn().mockResolvedValue(undefined),
    };

    historicalService = {
      recordHeadwayResult: jest.fn().mockResolvedValue(undefined),
      recordHeadwayError: jest.fn().mockResolvedValue(undefined),
    };

    service = new HeadwayTrackingService(
      prisma as unknown as PrismaService,
      cache as unknown as HeadwayCacheService,
      historicalService as unknown as HistoricalService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('does not persist historical snapshots while a bucket is still active', async () => {
    jest.setSystemTime(new Date('2026-06-11T20:57:00-03:00'));

    await service.calculateAndCacheHeadway('L10', 'GPT');

    expect(historicalService.recordHeadwayResult).not.toHaveBeenCalled();
    expect(historicalService.recordHeadwayError).not.toHaveBeenCalled();
    expect(cache.saveActiveHeadwayHistoryBucket).toHaveBeenCalledWith(
      'L10',
      'GPT',
      'evening',
    );
  });

  it('persists one historical snapshot when the bucket rolls over', async () => {
    jest.setSystemTime(new Date('2026-06-11T20:57:00-03:00'));
    await service.calculateAndCacheHeadway('L10', 'GPT');

    jest.setSystemTime(new Date('2026-06-11T22:01:00-03:00'));
    await service.calculateAndCacheHeadway('L10', 'GPT');
    await service.calculateAndCacheHeadway('L10', 'GPT');

    expect(historicalService.recordHeadwayResult).toHaveBeenCalledTimes(1);
    expect(historicalService.recordHeadwayResult).toHaveBeenCalledWith(
      expect.objectContaining({
        lineCode: 'L10',
        stationCode: 'GPT',
        updatedAt: new Date('2026-06-11T22:00:00-03:00').getTime(),
        directions: [
          expect.objectContaining({
            direction: 'Palmeiras-Barra Funda',
            bucket: 'evening',
          }),
        ],
      }),
      expect.any(Map),
    );
    expect(historicalService.recordHeadwayError).not.toHaveBeenCalled();
  });

  it('records L4 passages from fallback clock times', async () => {
    const train = {
      destinationCode: 'LUZ',
      destinationName: 'Luz',
      trainCurrentStationName: '',
      arrivalTime: '12:34',
      isAtPlatform: null,
      isTrainStopped: null,
    };
    const firstPollAt = new Date('2026-06-11T12:33:30-03:00').getTime();
    const secondPollAt = new Date('2026-06-11T12:34:30-03:00').getTime();

    await service.processPollResult('L4', 'BUT', [train], firstPollAt);
    await service.processPollResult('L4', 'BUT', [], secondPollAt);

    const passageAt = new Date('2026-06-11T12:34:00-03:00');
    expect(cache.recordPassage).toHaveBeenCalledWith(
      'L4',
      'BUT',
      'Luz',
      passageAt.getTime(),
    );
    expect(prisma.trainPassage.create).toHaveBeenCalledWith({
      data: {
        lineCode: 'L4',
        stationCode: 'BUT',
        direction: 'Luz',
        passedAt: passageAt,
        trainId: '12:34',
      },
    });
  });

  it('does not treat a delayed L8/L9 platform train as a new passage', async () => {
    const firstPollAt = new Date('2026-06-15T12:28:30-03:00').getTime();
    const secondPollAt = new Date('2026-06-15T12:31:00-03:00').getTime();

    await service.processPollResult(
      'L9',
      'USP',
      [
        {
          destinationCode: 'PIN',
          destinationName: 'Pinheiros',
          trainCurrentStationName: 'Villa Lobos–Jaguaré',
          arrivalTime: '12:29',
          isAtPlatform: true,
          isTrainStopped: false,
        },
      ],
      firstPollAt,
    );
    await service.processPollResult(
      'L9',
      'USP',
      [
        {
          destinationCode: 'PIN',
          destinationName: 'Pinheiros',
          trainCurrentStationName: 'Cidade Universitária',
          arrivalTime: '12:35',
          isAtPlatform: true,
          isTrainStopped: true,
        },
      ],
      secondPollAt,
    );

    expect(cache.recordPassage).not.toHaveBeenCalled();
    expect(prisma.trainPassage.create).not.toHaveBeenCalled();
  });

  it('does not infer an L8/L9 passage from an expired or revised ETA', async () => {
    const firstPollAt = new Date('2026-06-15T12:28:30-03:00').getTime();
    const secondPollAt = new Date('2026-06-15T12:31:00-03:00').getTime();

    await service.processPollResult(
      'L8',
      'CSA',
      [
        {
          destinationCode: 'QTU',
          destinationName: 'Quitaúna',
          trainCurrentStationName: 'Osasco',
          arrivalTime: '12:29',
          isAtPlatform: false,
          isTrainStopped: false,
        },
      ],
      firstPollAt,
    );
    await service.processPollResult(
      'L8',
      'CSA',
      [
        {
          destinationCode: 'QTU',
          destinationName: 'Quitaúna',
          trainCurrentStationName: 'Osasco',
          arrivalTime: '12:35',
          isAtPlatform: false,
          isTrainStopped: false,
        },
      ],
      secondPollAt,
    );

    expect(cache.recordPassage).not.toHaveBeenCalled();
    expect(prisma.trainPassage.create).not.toHaveBeenCalled();
  });

  it('records one L8/L9 passage only after a platform train disappears', async () => {
    const approachingAt = new Date('2026-06-15T12:28:00-03:00').getTime();
    const platformAt = new Date('2026-06-15T12:28:30-03:00').getTime();
    const disappearedAt = new Date('2026-06-15T12:31:00-03:00').getTime();
    const train = {
      destinationCode: 'QTU',
      destinationName: 'Quitaúna',
      trainCurrentStationName: 'Osasco',
      arrivalTime: '12:29',
      isAtPlatform: false,
      isTrainStopped: false,
    };

    await service.processPollResult('L8', 'CSA', [train], approachingAt);
    await service.processPollResult(
      'L8',
      'CSA',
      [{ ...train, isAtPlatform: true }],
      platformAt,
    );

    expect(cache.recordPassage).not.toHaveBeenCalled();

    await service.processPollResult('L8', 'CSA', [], disappearedAt);

    expect(cache.recordPassage).toHaveBeenCalledTimes(1);
    expect(cache.recordPassage).toHaveBeenCalledWith(
      'L8',
      'CSA',
      'Quitaúna',
      disappearedAt,
    );
    expect(prisma.trainPassage.create).toHaveBeenCalledTimes(1);
  });
});
