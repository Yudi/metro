import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  healthCheck() {
    return this.appService.healthCheck();
  }

  @Get('health/live')
  livenessCheck() {
    return this.appService.healthCheck();
  }

  @Get('health/ready')
  async readinessCheck() {
    const status = await this.appService.readinessCheck();
    if (!status.ready) {
      throw new ServiceUnavailableException(status);
    }
    return status;
  }
}
