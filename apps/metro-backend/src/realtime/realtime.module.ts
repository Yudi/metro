import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WsThrottlerGuard } from '../common/guards/ws-throttler.guard';
import { OlhoVivoApiService } from './services/olhovivo-api.service';
import { RouteStopMappingService } from './services/route-stop-mapping.service';
import { RealtimePollingService } from './services/realtime-polling.service';
import { VehicleDirectionBackendService } from './services/vehicle-direction-backend.service';
import { RealtimeGateway } from './gateways/realtime.gateway';
import { RealtimeController } from './realtime.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [
    PrismaService,
    WsThrottlerGuard,
    OlhoVivoApiService,
    RouteStopMappingService,
    VehicleDirectionBackendService,
    RealtimePollingService,
    RealtimeGateway,
  ],
  controllers: [RealtimeController],
  exports: [
    OlhoVivoApiService,
    RouteStopMappingService,
    RealtimePollingService,
  ],
})
export class RealtimeModule {}
