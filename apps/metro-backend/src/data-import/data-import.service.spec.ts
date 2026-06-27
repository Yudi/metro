import { Test, TestingModule } from '@nestjs/testing';
import { DataImportService } from './data-import.service';
import { FileOperationsService } from './services/file-operations.service';
import { ZipProcessingService } from './services/zip-processing.service';
import { GTFSDatabaseService } from './services/gtfs-database.service';
import { CsvProcessingService } from './services/csv-processing.service';
import { RustGtfsService } from './services/rust-gtfs.service';
import { DataImportHooksService } from './services/data-import-hooks.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DataImportService', () => {
  let service: DataImportService;
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataImportService,
        {
          provide: FileOperationsService,
          useValue: {},
        },
        {
          provide: ZipProcessingService,
          useValue: {},
        },
        {
          provide: GTFSDatabaseService,
          useValue: {},
        },
        {
          provide: CsvProcessingService,
          useValue: {},
        },
        {
          provide: RustGtfsService,
          useValue: {},
        },
        {
          provide: DataImportHooksService,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get<DataImportService>(DataImportService);
  });
  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
