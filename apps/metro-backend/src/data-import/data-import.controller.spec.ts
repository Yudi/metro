import { Test, TestingModule } from '@nestjs/testing';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';

describe('DataImportController', () => {
  let controller: DataImportController;
  let dataImportService: {
    startImport: jest.Mock;
    clearAndReimport: jest.Mock;
    getImportStatus: jest.Mock;
  };
  beforeEach(async () => {
    dataImportService = {
      startImport: jest.fn(),
      clearAndReimport: jest.fn(),
      getImportStatus: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataImportController],
      providers: [
        {
          provide: DataImportService,
          useValue: dataImportService,
        },
      ],
    }).compile();
    controller = module.get<DataImportController>(DataImportController);
  });
  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns a conflict for lock contention instead of HTTP 200 failure data', async () => {
    dataImportService.startImport.mockRejectedValue(
      new Error('GTFS import already in progress in another process'),
    );

    await expect(controller.triggerImport()).rejects.toMatchObject({
      status: 409,
    });
  });

  it('returns a server error for operational import failures', async () => {
    dataImportService.startImport.mockRejectedValue(new Error('database down'));

    await expect(controller.triggerImport()).rejects.toMatchObject({
      status: 500,
    });
  });
});
