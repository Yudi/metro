import { Module, forwardRef } from '@nestjs/common';
import { PostGISService } from './services/postgis.service';
import { BusStopService } from './services/bus-stop.service';
import { SubwayStationService } from './services/subway-station.service';
import { RailStationService } from './services/rail-station.service';
import { GeographyResolver } from './resolvers/geography.resolver';
import { PrismaService } from '../prisma/prisma.service';

// Optimized services
import { QueryOptimizationService } from './services/query-optimization.service';
import { BusStopServiceOptimized } from './services/bus-stop-optimized.service';
import { BusRouteServiceOptimized } from './services/bus-route-optimized.service';
import { TripServiceOptimized } from './services/trip-optimized.service';
import { GeographyServiceOptimized } from './services/geography-optimized.service';
import { VectorTilesModule } from '../vector-tiles/vector-tiles.module';

@Module({
  imports: [forwardRef(() => VectorTilesModule)],
  providers: [
    PostGISService,
    BusStopService,
    SubwayStationService,
    RailStationService,
    GeographyResolver,
    PrismaService,
    // Optimized services
    QueryOptimizationService,
    BusStopServiceOptimized,
    BusRouteServiceOptimized,
    TripServiceOptimized,
    GeographyServiceOptimized,
  ],
  exports: [
    PostGISService,
    BusStopService,
    SubwayStationService,
    RailStationService,
    // Export optimized services for use
    QueryOptimizationService,
    BusStopServiceOptimized,
    BusRouteServiceOptimized,
    TripServiceOptimized,
    GeographyServiceOptimized,
  ],
})
export class GeographyModule {}
