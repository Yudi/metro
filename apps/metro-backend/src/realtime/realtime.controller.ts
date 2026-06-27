import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OlhoVivoApiService } from './services/olhovivo-api.service';
import { RealtimePollingService } from './services/realtime-polling.service';

/**
 * REST API endpoints for real-time data status and management
 */
@ApiTags('Real-time Bus Data')
@Controller('realtime')
export class RealtimeController {
  constructor(
    private olhoVivoApi: OlhoVivoApiService,
    private pollingService: RealtimePollingService
  ) {}
}
