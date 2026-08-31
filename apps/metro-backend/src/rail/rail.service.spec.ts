import { Test, TestingModule } from '@nestjs/testing';
import { RailService } from './rail.service';
import { RailCacheService } from './rail-cache.service';
import { RailApiService } from './rail-api.service';
import { HistoricalService } from '../historical/historical.service';

describe('RailService', () => {
  let service: RailService;
  let cacheService: {
    getFromRedis: jest.Mock;
    saveToRedis: jest.Mock;
  };
  let apiService: {
    fetchMergedStatusWithDiagnostics: jest.Mock;
    createStaticFallback: jest.Mock;
  };
  let historicalService: {
    recordRetrievalIssue: jest.Mock;
    recordRetrievalRecovered: jest.Mock;
    recordRailStatusObservations: jest.Mock;
  };
  beforeEach(async () => {
    cacheService = {
      getFromRedis: jest.fn().mockResolvedValue(null),
      saveToRedis: jest.fn().mockResolvedValue(undefined),
    };
    apiService = {
      fetchMergedStatusWithDiagnostics: jest.fn(),
      createStaticFallback: jest.fn(),
    };
    historicalService = {
      recordRetrievalIssue: jest.fn().mockResolvedValue(undefined),
      recordRetrievalRecovered: jest.fn().mockResolvedValue(undefined),
      recordRailStatusObservations: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailService,
        {
          provide: RailCacheService,
          useValue: cacheService,
        },
        {
          provide: RailApiService,
          useValue: apiService,
        },
        {
          provide: HistoricalService,
          useValue: historicalService,
        },
      ],
    }).compile();
    service = module.get<RailService>(RailService);
  });
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('shares one refresh across concurrent reads and a cron tick', async () => {
    let finishFetch:
      | ((value: {
          status: {
            lines: [];
            lastUpdated: Date;
            success: true;
          };
          attemptedAt: Date;
          sources: Array<{
            name: string;
            success: boolean;
            lineCount: number;
            durationMs: number;
          }>;
        }) => void)
      | undefined;
    apiService.fetchMergedStatusWithDiagnostics.mockReturnValue(
      new Promise((resolve) => {
        finishFetch = resolve;
      }),
    );

    const reads = Array.from({ length: 20 }, () => service.getLinesStatus());
    const cron = service.handleCronFetch();
    expect(apiService.fetchMergedStatusWithDiagnostics).toHaveBeenCalledTimes(
      1,
    );

    finishFetch?.({
      status: { lines: [], lastUpdated: new Date(), success: true },
      attemptedAt: new Date(),
      sources: [
        {
          name: 'Rail integration status',
          success: true,
          lineCount: 0,
          durationMs: 10,
        },
      ],
    });
    await Promise.all([...reads, cron]);

    expect(apiService.fetchMergedStatusWithDiagnostics).toHaveBeenCalledTimes(
      1,
    );
    expect(cacheService.saveToRedis).toHaveBeenCalledTimes(1);
    expect(
      historicalService.recordRailStatusObservations,
    ).toHaveBeenCalledTimes(1);
  });
});
