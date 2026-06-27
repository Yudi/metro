import { Module } from '@nestjs/common';
import { RailService } from './rail.service';
import { RailResolver } from './rail.resolver';
import { RailCacheService } from './rail-cache.service';
import { RailApiService } from './rail-api.service';
import { RailSpecialResolver } from './rail-special.resolver';
import { RailSpecialLinesService } from './rail-special-lines.service';
import { RailHolidayService } from './rail-holiday.service';
import { RailSpecialInfoService } from './rail-special-info.service';
import { RailIntegrationClientModule } from '../rail-integration/rail-integration-client.module';
import { RailSpecialServicesService } from './rail-special-services.service';
import { RailIncidentHistoryController } from './rail-incident-history.controller';
import { RailIncidentHistoryService } from './rail-incident-history.service';

@Module({
  imports: [RailIntegrationClientModule],
  controllers: [RailIncidentHistoryController],
  providers: [
    RailResolver,
    RailSpecialResolver,
    RailService,
    RailSpecialLinesService,
    RailHolidayService,
    RailSpecialInfoService,
    RailSpecialServicesService,
    RailCacheService,
    RailApiService,
    RailIncidentHistoryService,
  ],
  exports: [RailService],
})
export class RailModule {}
