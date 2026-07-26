import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BikeController } from './bike.controller';
import { BikeApiService } from './services/bike-api.service';
import { BikePricingService } from './services/bike-pricing.service';
import { GbfsClientService } from './gbfs/gbfs-client.service';
import { BikePollingService } from './services/bike-polling.service';
import { BikeGateway } from './gateways/bike.gateway';
import { BikeResolver } from './resolvers/bike.resolver';
import { WsThrottlerGuard } from '../common/guards/ws-throttler.guard';

@Module({
  imports: [HttpModule],
  controllers: [BikeController],
  providers: [
    WsThrottlerGuard,
    BikeApiService,
    BikePricingService,
    GbfsClientService,
    BikePollingService,
    BikeGateway,
    BikeResolver,
  ],
  exports: [BikePollingService],
})
export class BikeModule {}
