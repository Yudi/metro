import { Module } from '@nestjs/common';
import {
  RailRealtimeSourcePort,
  RailStatusSourcePort,
} from '@metro/rail-integration-contracts';
import { RailIntegrationClientService } from './rail-integration-client.service';

@Module({
  providers: [
    RailIntegrationClientService,
    {
      provide: RailRealtimeSourcePort,
      useExisting: RailIntegrationClientService,
    },
    {
      provide: RailStatusSourcePort,
      useExisting: RailIntegrationClientService,
    },
  ],
  exports: [RailRealtimeSourcePort, RailStatusSourcePort],
})
export class RailIntegrationClientModule {}
