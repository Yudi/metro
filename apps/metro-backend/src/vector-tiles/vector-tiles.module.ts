import { Module } from '@nestjs/common';
import { VectorTilesController } from './vector-tiles.controller';
import { VectorTilesService } from './vector-tiles.service';
import { SubwayStationProcessorService } from './services/subway-station-processor.service';
import { RailVectorTileService } from './services/rail-vector-tile.service';
import { RailStationProcessorService } from './services/rail-station-processor.service';
import { BikeVectorTileService } from './services/bike-vector-tile.service';
import { BusVectorTileService } from './services/bus-vector-tile.service';
import { RailTileService } from './services/rail-tile.service';
import { VectorTileCacheService } from './services/vector-tile-cache.service';
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
    VectorTileCacheService,
    RailTileService,
    BusVectorTileService,
    BikeVectorTileService,
  ],
  exports: [
    VectorTilesService,
    SubwayStationProcessorService,
    RailVectorTileService,
    RailStationProcessorService,
    VectorTileCacheService,
    RailTileService,
    BusVectorTileService,
    BikeVectorTileService,
  ],
})
export class VectorTilesModule {}
