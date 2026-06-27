import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BikePollingService } from './services/bike-polling.service';

@ApiTags('Bike Stations')
@Controller('bike')
export class BikeController {
  constructor(private readonly polling: BikePollingService) {}
}
