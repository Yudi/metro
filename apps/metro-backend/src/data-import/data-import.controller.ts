import { Controller, Get, Post, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DataImportService } from './data-import.service';
import {
  GTFSDatasetResponseDto,
  ImportStatusDto,
} from './dto/gtfs-dataset.dto';
import { DevelopmentOnlyGuard } from '../shared/guards/development-only.guard';
import { DevOnly } from '../shared/decorators/development-only.decorator';

@ApiTags('GTFS Data Import')
@Controller('gtfs')
export class DataImportController {
  private readonly logger = new Logger(DataImportController.name);

  constructor(private readonly dataImportService: DataImportService) {}

  @Get('debug/status')
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  @ApiOperation({
    summary: 'Get import status',
    description: 'Get the current status of GTFS data import process',
  })
  @ApiResponse({
    status: 200,
    description: 'Import status retrieved successfully',
    type: ImportStatusDto,
  })
  getImportStatus(): ImportStatusDto {
    return this.dataImportService.getImportStatus();
  }

  @Post('debug/import')
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  @ApiOperation({
    summary: 'Trigger manual import',
    description: 'Manually trigger GTFS data import process',
  })
  @ApiResponse({
    status: 200,
    description: 'Import started successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Import already in progress',
  })
  async triggerImport() {
    try {
      const result = await this.dataImportService.startImport();
      return {
        success: true,
        message: 'Import completed successfully',
        result,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Manual import failed:', errorMessage);
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  @Post('debug/clear-and-import')
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  @ApiOperation({
    summary: '[DEV ONLY] Clear all data and force complete re-import',
    description:
      'Development only: Clear all GTFS data and tracking, then trigger a fresh import',
  })
  @ApiResponse({
    status: 200,
    description: 'Clear and import completed successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Import already in progress',
  })
  @ApiResponse({
    status: 403,
    description: 'Not available in production',
  })
  async clearAndImport() {
    try {
      const result = await this.dataImportService.clearAndReimport();
      return {
        success: true,
        message: 'Clear and import completed successfully',
        result,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Clear and import failed:', errorMessage);
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  @Post('debug/reset-status')
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  @ApiOperation({
    summary: '[DEV ONLY] Reset import status to idle',
    description:
      'Development only: Manually reset the import status to idle (use with caution)',
  })
  @ApiResponse({
    status: 200,
    description: 'Status reset successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Not available in production',
  })
  async resetStatus() {
    this.dataImportService.resetStatus();
    return {
      success: true,
      message: 'Import status reset to idle',
    };
  }

  @Get('debug/current')
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  @ApiOperation({
    summary: 'Get current dataset',
    description: 'Get information about the current GTFS dataset',
  })
  @ApiResponse({
    status: 200,
    description: 'Current dataset retrieved successfully',
    type: GTFSDatasetResponseDto,
  })
  async getCurrentDataset(): Promise<GTFSDatasetResponseDto | null> {
    return await this.dataImportService.getLatestDataset();
  }

  @Get('debug/info')
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  @ApiOperation({
    summary: 'Get dataset info',
    description: 'Get detailed information about the current GTFS dataset',
  })
  @ApiResponse({
    status: 200,
    description: 'Dataset info retrieved successfully',
    type: GTFSDatasetResponseDto,
  })
  async getDatasetInfo(): Promise<GTFSDatasetResponseDto | null> {
    return await this.dataImportService.getCurrentDatasetInfo();
  }
}
