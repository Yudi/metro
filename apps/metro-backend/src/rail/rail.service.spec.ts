import { Test, TestingModule } from '@nestjs/testing';
import { RailService } from './rail.service';
import { RailCacheService } from './rail-cache.service';
import { RailApiService } from './rail-api.service';
import { HistoricalService } from '../historical/historical.service';

describe('RailService', () => {
  let service: RailService;
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailService,
        {
          provide: RailCacheService,
          useValue: {},
        },
        {
          provide: RailApiService,
          useValue: {},
        },
        {
          provide: HistoricalService,
          useValue: {},
        },
      ],
    }).compile();
    service = module.get<RailService>(RailService);
  });
  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
