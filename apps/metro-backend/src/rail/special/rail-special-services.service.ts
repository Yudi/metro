import { Injectable, Logger } from '@nestjs/common';
import { RailRealtimeSourcePort } from '@metro/rail-integration-contracts';
import type { SpecialRailService } from '@metro/shared/utils';

@Injectable()
export class RailSpecialServicesService {
  private readonly logger = new Logger(RailSpecialServicesService.name);

  constructor(private readonly externalRailProvider: RailRealtimeSourcePort) {}

  async getAvailableServices(): Promise<SpecialRailService[]> {
    try {
      return await this.externalRailProvider.getAvailableSpecialRailServices();
    } catch (error) {
      this.logger.warn('Could not load runtime special rail services', error);
      return [];
    }
  }
}
