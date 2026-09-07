import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  BusInformationResolver,
  BusServiceIntervalsService,
} from './bus-information.resolver';
import { BusNoticeService } from './bus-notice.service';
import { BusNoticeHttpClient } from './bus-notice.http';

@Module({
  imports: [PrismaModule],
  providers: [
    BusInformationResolver,
    BusServiceIntervalsService,
    BusNoticeService,
    BusNoticeHttpClient,
  ],
})
export class BusInformationModule {}
