import { Module } from '@nestjs/common';
import { VectorTilesController } from './vector-tiles.controller';
import { VectorTilesService } from './vector-tiles.service';
import { SubwayStationProcessorService } from './services/subway-station-processor.service';
import { RailVectorTileService } from './services/rail-vector-tile.service';
import { RailStationProcessorService } from './services/rail-station-processor.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BikeModule } from '../bike/bike.module';

@Module({
  imports: [PrismaModule, BikeModule],
  controllers: [VectorTilesController],
  providers: [
    VectorTilesService,
    SubwayStationProcessorService,
    RailVectorTileService,
    RailStationProcessorService,
  ],
  exports: [
    VectorTilesService,
    SubwayStationProcessorService,
    RailVectorTileService,
    RailStationProcessorService,
  ],
})
export class VectorTilesModule {}
