import { Controller, Get, Query } from '@nestjs/common';
import { RailIncidentHistoryService } from './rail-incident-history.service';
import { IncidentHistoryResponse } from '@metro/shared/utils';

@Controller('rail/incidents')
export class RailIncidentHistoryController {
  constructor(
    private readonly incidentHistoryService: RailIncidentHistoryService,
  ) {}

  @Get()
  fetchIncidentHistory(
    @Query('dataInicio') dataInicio: string,
    @Query('dataFim') dataFim: string,
  ): Promise<IncidentHistoryResponse> {
    return this.incidentHistoryService.fetchIncidents(dataInicio, dataFim);
  }
}
