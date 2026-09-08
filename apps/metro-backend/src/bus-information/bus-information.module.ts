import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  BusInformationResolver,
  BusServiceIntervalsService,
} from './bus-information.resolver';
import { BusNoticeService } from './bus-notice.service';
import { BusNoticeHttpClient } from './bus-notice.http';
import { BusRouteItineraryResolver } from './bus-route-itinerary.resolver';
import { BusRouteItineraryService } from './bus-route-itinerary.service';
import { GeographyModule } from '../geography/geography.module';
import { BusPublishedRouteInformationClient } from './bus-published-route-information.client';
import { BusPublishedRouteInformationResolver } from './bus-published-route-information.resolver';
import { BusPublishedRouteInformationService } from './bus-published-route-information.service';

@Module({
  imports: [PrismaModule, GeographyModule],
  providers: [
    BusInformationResolver,
    BusRouteItineraryResolver,
    BusServiceIntervalsService,
    BusRouteItineraryService,
    BusPublishedRouteInformationResolver,
    BusPublishedRouteInformationService,
    BusPublishedRouteInformationClient,
    BusNoticeService,
    BusNoticeHttpClient,
  ],
})
export class BusInformationModule {}
