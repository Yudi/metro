import { Test, TestingModule } from '@nestjs/testing';
import { RailResolver } from './rail.resolver';
import { RailService } from './rail.service';

describe('RailResolver', () => {
  let resolver: RailResolver;
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailResolver,
        {
          provide: RailService,
          useValue: {},
        },
      ],
    }).compile();
    resolver = module.get<RailResolver>(RailResolver);
  });
  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
