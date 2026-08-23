import { Test } from '@nestjs/testing';
import { AppService } from './app.service';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseService } from '../search/services/typesense.service';
describe('AppService', () => {
  let service: AppService;
  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]) },
        },
        {
          provide: TypesenseService,
          useValue: { isAvailable: jest.fn().mockReturnValue(true) },
        },
      ],
    }).compile();
    service = app.get<AppService>(AppService);
  });
  describe('healthCheck', () => {
    it('should return health status', () => {
      expect(service.healthCheck()).toEqual({ health: true });
    });
  });
});
