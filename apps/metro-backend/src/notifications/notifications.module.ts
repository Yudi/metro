import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from '../user/auth.service';
import { SaoPauloTransitModule } from '../cities/sp/sp-transit.module';
import { NotificationTargetsService } from './notification-targets.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsResolver } from './notifications.resolver';
import { NotificationSnapshotService } from './notification-snapshot.service';
import { NotificationEngineService } from './notification-engine.service';
import { NotificationPushService } from './notification-push.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationRealtimeService } from './notification-realtime.service';
import { NotificationsGateway } from './notifications.gateway';

import { NotificationRetentionService } from './notification-retention.service';
import { WsThrottlerGuard } from '../common/guards/ws-throttler.guard';

@Module({
  imports: [
    PrismaModule,
    SaoPauloTransitModule,
  ],
  providers: [
    NotificationRetentionService,
    AuthService,
    WsThrottlerGuard,
    NotificationTargetsService,
    NotificationRealtimeService,
    NotificationSettingsService,
    NotificationsResolver,
    NotificationsGateway,
    NotificationSnapshotService,
    NotificationEngineService,
    NotificationPushService,
    NotificationQueueService,
  ],
  exports: [NotificationRealtimeService],
})
export class NotificationsModule {}
