import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from '../user/auth.service';
import { RailModule } from '../rail/rail.module';
import { NextTrainModule } from '../next-train/next-train.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RailIntegrationClientModule } from '../rail-integration/rail-integration-client.module';
import { GeographyModule } from '../geography/geography.module';
import { BusInformationModule } from '../bus-information/bus-information.module';
import { NotificationTargetsService } from './notification-targets.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsResolver } from './notifications.resolver';
import { NotificationSnapshotService } from './notification-snapshot.service';
import { NotificationEngineService } from './notification-engine.service';
import { NotificationPushService } from './notification-push.service';
import { NotificationQueueService } from './notification-queue.service';

import { NotificationRetentionService } from './notification-retention.service';

@Module({
  imports: [PrismaModule, RailModule, NextTrainModule, RealtimeModule, RailIntegrationClientModule, GeographyModule, BusInformationModule],
  providers: [NotificationRetentionService, AuthService, NotificationTargetsService, NotificationSettingsService, NotificationsResolver, NotificationSnapshotService, NotificationEngineService, NotificationPushService, NotificationQueueService],
})
export class NotificationsModule {}
