import { Module } from '@nestjs/common';
import { NextTrainResolver } from './next-train.resolver';
import { CptmVehiclePollingService } from './services/cptm-vehicle-polling.service';
import { NextTrainPollingService } from './services/next-train-polling.service';
import { NextTrainGateway } from './gateways/next-train.gateway';
import { HeadwayCacheService } from './services/headway-cache.service';
import { HeadwayTrackingService } from './services/headway-tracking.service';
import { CptmHeadwayTrackingService } from './services/cptm-headway-tracking.service';
import { HeadwayPollingService } from './services/headway-polling.service';
import { WsThrottlerGuard } from '../common/guards/ws-throttler.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RailIntegrationClientModule } from '../rail-integration/rail-integration-client.module';
import { RailModule } from '../rail/rail.module';

@Module({
  imports: [RailIntegrationClientModule, RailModule],
  providers: [
    PrismaService,
    WsThrottlerGuard,
    CptmVehiclePollingService,
    NextTrainPollingService,
    HeadwayCacheService,
    HeadwayTrackingService,
    CptmHeadwayTrackingService,
    HeadwayPollingService,
    NextTrainGateway,
    NextTrainResolver,
  ],
  exports: [
    NextTrainPollingService,
    CptmVehiclePollingService,
    HeadwayTrackingService,
  ],
})
export class NextTrainModule {}
