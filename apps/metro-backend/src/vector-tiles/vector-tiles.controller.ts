import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  HttpStatus,
  ParseIntPipe,
  Header,
  InternalServerErrorException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  VectorTilesService,
  VectorTileLayer,
  VectorTileOptions,
} from './vector-tiles.service';
import { RailVectorTileService } from './services/rail-vector-tile.service';
import { SubwayStationProcessorService } from './services/subway-station-processor.service';
import { DevelopmentOnlyGuard } from '../common/guards/development-only.guard';
import { DevOnly } from '../common/decorators/development-only.decorator';

/**
 * Controller for serving Mapbox Vector Tiles (MVT)
 *
 * Endpoints follow the standard {z}/{x}/{y}.pbf pattern used by map libraries.
 * Tiles are cached and served with appropriate headers for browser caching.
 */
@ApiTags('Vector Tiles')
@Controller('tiles')
@Throttle({
  default: { limit: 1_200, ttl: 60_000 },
  strict: { limit: 1_200, ttl: 60_000 },
})
export class VectorTilesController {
  constructor(
    private readonly vectorTilesService: VectorTilesService,
    private readonly railVectorTileService: RailVectorTileService,
    private readonly subwayStationProcessor: SubwayStationProcessorService,
  ) {}

  @Get('rail-stations/:z/:x/:y.pbf')
  @Header('Content-Type', 'application/x-protobuf')
  @Header('Content-Encoding', 'identity')
  @Header('Cache-Control', 'public, max-age=300, must-revalidate')
  @Header('Access-Control-Allow-Origin', '*')
  @ApiOperation({
    summary: 'Get rail stations vector tile',
    description:
      'Returns a Mapbox Vector Tile (MVT) containing rail station points for the specified tile coordinates.',
  })
  @ApiParam({
    name: 'z',
    description: 'Zoom level (0-22)',
    type: Number,
    example: 12,
  })
  @ApiParam({
    name: 'x',
    description: 'Tile X coordinate',
    type: Number,
    example: 1234,
  })
  @ApiParam({
    name: 'y',
    description: 'Tile Y coordinate',
    type: Number,
    example: 2345,
  })
  @ApiResponse({
    status: 200,
    description: 'MVT binary data',
    content: {
      'application/x-protobuf': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 204, description: 'Empty tile (no features in area)' })
  async getSubwayStationsTile(
    @Param('z', ParseIntPipe) z: number,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendVectorTile(res, VectorTileLayer.RAIL_STATIONS, z, x, y);
  }

  @Get('rail-routes/:z/:x/:y.pbf')
  @Header('Content-Type', 'application/x-protobuf')
  @Header('Content-Encoding', 'identity')
  @Header('Cache-Control', 'public, max-age=300, must-revalidate')
  @Header('Access-Control-Allow-Origin', '*')
  @ApiOperation({
    summary: 'Get rail routes vector tile',
    description:
      'Returns a Mapbox Vector Tile (MVT) containing rail route lines for the specified tile coordinates.',
  })
  @ApiParam({
    name: 'z',
    description: 'Zoom level (0-22)',
    type: Number,
    example: 12,
  })
  @ApiParam({
    name: 'x',
    description: 'Tile X coordinate',
    type: Number,
    example: 1234,
  })
  @ApiParam({
    name: 'y',
    description: 'Tile Y coordinate',
    type: Number,
    example: 2345,
  })
  @ApiResponse({
    status: 200,
    description: 'MVT binary data',
    content: {
      'application/x-protobuf': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 204, description: 'Empty tile (no features in area)' })
  async getSubwayRoutesTile(
    @Param('z', ParseIntPipe) z: number,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendVectorTile(res, VectorTileLayer.RAIL_ROUTES, z, x, y);
  }

  @Get('bus-routes/:z/:x/:y.pbf')
  @Header('Content-Type', 'application/x-protobuf')
  @Header('Content-Encoding', 'identity')
  @Header('Cache-Control', 'public, max-age=300')
  @Header('Access-Control-Allow-Origin', '*')
  @ApiOperation({
    summary: 'Get selected bus route vector tile',
    description:
      'Returns a Mapbox Vector Tile (MVT) containing bus route shapes for requested route IDs.',
  })
  async getBusRoutesTile(
    @Param('z', ParseIntPipe) z: number,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
    @Query('routeIds') routeIds: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const parsedRouteIds = this.parseCsv(routeIds, 'routeIds');
    if (parsedRouteIds.length === 0) {
      throw new BadRequestException(
        'routeIds must contain at least one identifier',
      );
    }

    await this.sendVectorTile(res, VectorTileLayer.BUS_ROUTES, z, x, y, {
      routeIds: parsedRouteIds,
    });
  }

  @Get('bus-stops/:z/:x/:y.pbf')
  @Header('Content-Type', 'application/x-protobuf')
  @Header('Content-Encoding', 'identity')
  @Header('Cache-Control', 'public, max-age=300')
  @Header('Access-Control-Allow-Origin', '*')
  @ApiOperation({
    summary: 'Get bus stop vector tile',
    description:
      'Returns a Mapbox Vector Tile (MVT) containing bus-serving stops in the requested tile bounds at zoom level 16 or higher.',
  })
  async getBusStopsTile(
    @Param('z', ParseIntPipe) z: number,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendVectorTile(res, VectorTileLayer.BUS_STOPS, z, x, y);
  }

  @Get('bike-stations/:z/:x/:y.pbf')
  @Header('Content-Type', 'application/x-protobuf')
  @Header('Content-Encoding', 'identity')
  @Header('Cache-Control', 'public, no-cache')
  @Header('Access-Control-Allow-Origin', '*')
  @ApiOperation({
    summary: 'Get bike station vector tile',
    description:
      'Returns a Mapbox Vector Tile (MVT) containing bike stations from the current polling cache. Stable URLs are revalidated with ETags so WebSocket refreshes receive current availability without retransmitting unchanged tiles.',
  })
  async getBikeStationsTile(
    @Param('z', ParseIntPipe) z: number,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendVectorTile(res, VectorTileLayer.BIKE_STATIONS, z, x, y);
  }

  @Post('debug/refresh-merged-stations')
  @UseGuards(DevelopmentOnlyGuard)
  @DevOnly()
  @ApiOperation({
    summary: '[DEV ONLY] Refresh merged stations',
    description:
      'Development only: Re-processes and merges all rail and subway stations. Use this after updating station normalization logic.',
  })
  @ApiResponse({
    status: 200,
    description: 'Stations refreshed successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Not available in production',
  })
  async refreshMergedStations() {
    try {
      // Refresh both rail (GeoSampa) and subway (GTFS) stations
      // RailVectorTileService handles both station processing and MVT view refresh
      // SubwayStationProcessor handles MVT views internally
      await Promise.all([
        this.railVectorTileService.refreshMvtViews(),
        this.subwayStationProcessor.refreshMergedStations(),
      ]);

      return {
        success: true,
        message: 'Merged stations refreshed successfully',
      };
    } catch {
      throw new InternalServerErrorException({
        code: 'STATION_REFRESH_FAILED',
        message: 'Failed to refresh merged stations',
      });
    }
  }

  private validateTileCoordinates(z: number, x: number, y: number): void {
    if (z < 0 || z > 22) {
      throw new BadRequestException('Zoom level must be between 0 and 22');
    }

    const maxCoordinate = 2 ** z - 1;
    if (x < 0 || x > maxCoordinate || y < 0 || y > maxCoordinate) {
      throw new BadRequestException(
        `Tile coordinates must be between 0 and ${maxCoordinate} for zoom ${z}`,
      );
    }
  }

  private async sendVectorTile(
    res: Response,
    layer: VectorTileLayer,
    z: number,
    x: number,
    y: number,
    options?: VectorTileOptions,
  ): Promise<void> {
    this.validateTileCoordinates(z, x, y);

    const tile = await this.vectorTilesService.getTile(layer, z, x, y, options);

    if (!tile || tile.length === 0) {
      res.status(HttpStatus.NO_CONTENT).end();
      return;
    }

    res.send(tile);
  }

  private parseCsv(value: string | undefined, argumentName: string): string[] {
    if (value === undefined) {
      return [];
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(
        `${argumentName} must be a comma-separated string`,
      );
    }

    const items = value.split(',').map((item) => item.trim());
    if (items.length > 100 || items.some((item) => !isSafeIdentifier(item))) {
      throw new BadRequestException(
        `${argumentName} must contain at most 100 non-empty identifiers of up to 128 characters`,
      );
    }

    return Array.from(new Set(items));
  }
}

function isSafeIdentifier(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 128 &&
    !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  );
}
