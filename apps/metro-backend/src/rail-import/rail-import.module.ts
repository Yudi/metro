import { Module } from '@nestjs/common';
import { RailImportService } from './rail-import.service';
import { RailImportController } from './rail-import.controller';
import { WFSProcessingService } from './services/wfs-processing.service';
import { WFSDatabaseService } from './services/wfs-database.service';
import { PrismaModule } from '../prisma/prisma.module';
import { VectorTilesModule } from '../vector-tiles/vector-tiles.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [PrismaModule, VectorTilesModule, SearchModule],
  controllers: [RailImportController],
  providers: [
    RailImportService,
    WFSProcessingService,
    WFSDatabaseService,
  ],
  exports: [RailImportService],
})
export class RailImportModule {}
