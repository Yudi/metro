import { Resolver, Query } from '@nestjs/graphql';
import { RailService } from './rail.service';
import { SpecialRailLine } from './entities/rail-special-line.entity';
import { RailSpecialLinesService } from './rail-special-lines.service';
import { SpecialRailInfoCard } from './entities/rail-special-info-card.entity';
import { RailSpecialInfoService } from './rail-special-info.service';
import { SpecialRailService } from './entities/rail-special-service.entity';
import { RailSpecialServicesService } from './rail-special-services.service';
import { RailHolidayService } from './rail-holiday.service';

@Resolver(() => SpecialRailLine)
export class RailSpecialResolver {
  constructor(
    private readonly railService: RailService,
    private readonly railSpecialLinesService: RailSpecialLinesService,
    private readonly railSpecialInfoService: RailSpecialInfoService,
    private readonly railSpecialServicesService: RailSpecialServicesService,
    private readonly railHolidayService: RailHolidayService,
  ) {}

  @Query(() => [SpecialRailLine], {
    name: 'railSpecialLinesStatus',
    description:
      'Get status of special rail services with fixed schedules (EA, 10X, GRU)',
  })
  async getSpecialLinesStatus(): Promise<SpecialRailLine[]> {
    const regularLinesStatus = await this.railService.getLinesStatus();
    const now = new Date();
    const isHoliday = await this.railHolidayService.isHolidayInSaoPaulo(now);

    return this.railSpecialLinesService.getSpecialLinesStatus(
      regularLinesStatus.lines,
      now,
      { isHoliday },
    );
  }

  @Query(() => [SpecialRailInfoCard], {
    name: 'railSpecialInfoCardsStatus',
    description: 'Get informational rail cards displayed with special services',
  })
  async getSpecialInfoCardsStatus(): Promise<SpecialRailInfoCard[]> {
    return this.railSpecialInfoService.getSpecialInfoCardsStatus();
  }

  @Query(() => [SpecialRailService], {
    name: 'railSpecialServices',
    description:
      'List special rail services currently registered by the upstream provider',
  })
  getSpecialServices(): Promise<SpecialRailService[]> {
    return this.railSpecialServicesService.getAvailableServices();
  }
}
