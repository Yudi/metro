import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseService } from '../search/services/typesense.service';
describe('AppController', () => {
  let app: TestingModule;
  beforeAll(async () => {
    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]) },
        },
        {
          provide: TypesenseService,
          useValue: { isAvailable: jest.fn().mockReturnValue(false) },
        },
      ],
    }).compile();
  });
  describe('healthCheck', () => {
    it('should return health status', () => {
      const appController = app.get<AppController>(AppController);
      expect(appController.healthCheck()).toEqual({ health: true });
    });
  });
  describe('readinessCheck', () => {
    it('keeps optional search degradation separate from required readiness', async () => {
      const appController = app.get<AppController>(AppController);

      await expect(appController.readinessCheck()).resolves.toEqual({
        ready: true,
        dependencies: {
          database: 'ready',
          search: 'degraded',
        },
      });
    });
  });
});
