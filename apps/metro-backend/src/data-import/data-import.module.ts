import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';
import { FileOperationsService } from './services/file-operations.service';
import { ZipProcessingService } from './services/zip-processing.service';
import { GTFSDatabaseService } from './services/gtfs-database.service';
import { CsvProcessingService } from './services/csv-processing.service';
import { RustGtfsService } from './services/rust-gtfs.service';
import { DataImportHooksService } from './services/data-import-hooks.service';
import { SearchModule } from '../search/search.module';
import { VectorTilesModule } from '../vector-tiles/vector-tiles.module';

@Module({
  imports: [
    HttpModule,
    ScheduleModule.forRoot(),
    SearchModule,
    VectorTilesModule,
  ],
  controllers: [DataImportController],
  providers: [
    DataImportService,
    FileOperationsService,
    ZipProcessingService,
    GTFSDatabaseService,
    CsvProcessingService,
    RustGtfsService,
    DataImportHooksService,
  ],
  exports: [DataImportService],
})
export class DataImportModule {}
