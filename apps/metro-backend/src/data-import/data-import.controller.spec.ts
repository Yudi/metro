import { Test, TestingModule } from '@nestjs/testing';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';

describe('DataImportController', () => {
  let controller: DataImportController;
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataImportController],
      providers: [
        {
          provide: DataImportService,
          useValue: {},
        },
      ],
    }).compile();
    controller = module.get<DataImportController>(DataImportController);
  });
  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
