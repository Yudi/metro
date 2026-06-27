import { Controller, Post, Get, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RailImportService } from './rail-import.service';
import { ImportProgress, WFSProcessingResult } from './types/wfs.types';
import { DevelopmentOnlyGuard } from '../shared/guards/development-only.guard';
import { DevOnly } from '../shared/decorators/development-only.decorator';

@ApiTags('Rail Import')
@Controller('rail-import')
export class RailImportController {
  private readonly logger = new Logger(RailImportController.name);

  constructor(private readonly railImportService: RailImportService) {}

  @Get('status')
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  @ApiOperation({ summary: 'Get current rail import status' })
  @ApiResponse({
    status: 200,
    description: 'Import status retrieved successfully',
  })
  getStatus(): ImportProgress {
    return this.railImportService.getImportStatus();
  }

  @Post('start')
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  @ApiOperation({ summary: 'Manually trigger rail data import' })
  @ApiResponse({
    status: 200,
    description: 'Import started successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Import already in progress',
  })
  async startImport(): Promise<WFSProcessingResult> {
    this.logger.debug('Manual import triggered via API');
    return await this.railImportService.startImport();
  }

  @Post('clear-and-reimport')
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  @ApiOperation({ summary: 'Clear all rail data and force complete re-import' })
  @ApiResponse({
    status: 200,
    description: 'Data cleared and import started',
  })
  async clearAndReimport(): Promise<WFSProcessingResult> {
    this.logger.debug('Clear and reimport triggered via API');
    return await this.railImportService.clearAndReimport();
  }

  @Post('reset-status')
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  @ApiOperation({ summary: 'Reset import status to idle (manual override)' })
  @ApiResponse({
    status: 200,
    description: 'Status reset successfully',
  })
  resetStatus(): void {
    this.railImportService.resetStatus();
  }

  @Get('datasets')
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  @ApiOperation({ summary: 'Get information about all GeoSampa WFS datasets' })
  @ApiResponse({
    status: 200,
    description: 'Dataset information retrieved successfully',
  })
  async getDatasets() {
    return await this.railImportService.getAllDatasets();
  }
}
