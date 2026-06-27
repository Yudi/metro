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
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { VectorTilesService, VectorTileLayer } from './vector-tiles.service';
import { RailVectorTileService } from './services/rail-vector-tile.service';
import { SubwayStationProcessorService } from './services/subway-station-processor.service';
import { DevelopmentOnlyGuard } from '../shared/guards/development-only.guard';
import { DevOnly } from '../shared/decorators/development-only.decorator';

/**
 * Controller for serving Mapbox Vector Tiles (MVT)
 *
 * Endpoints follow the standard {z}/{x}/{y}.pbf pattern used by map libraries.
 * Tiles are cached and served with appropriate headers for browser caching.
 */
@ApiTags('Vector Tiles')
@Controller('tiles')
export class VectorTilesController {
  constructor(
    private readonly vectorTilesService: VectorTilesService,
    private readonly railVectorTileService: RailVectorTileService,
    private readonly subwayStationProcessor: SubwayStationProcessorService,
  ) {}

  @Get('rail-stations/:z/:x/:y.pbf')
  @Header('Content-Type', 'application/x-protobuf')
  @Header('Content-Encoding', 'identity')
  @Header('Cache-Control', 'public, max-age=86400') // 24 hour cache
  @Header('Access-Control-Allow-Origin', '*')
  @ApiOperation({
    summary: 'Get subway stations vector tile',
    description:
      'Returns a Mapbox Vector Tile (MVT) containing subway station points for the specified tile coordinates.',
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
    this.validateTileCoordinates(z, x, y);

    const tile = await this.vectorTilesService.getTile(
      VectorTileLayer.RAIL_STATIONS,
      z,
      x,
      y,
    );

    if (!tile || tile.length === 0) {
      res.status(HttpStatus.NO_CONTENT).end();
      return;
    }

    res.send(tile);
  }

  @Get('rail-routes/:z/:x/:y.pbf')
  @Header('Content-Type', 'application/x-protobuf')
  @Header('Content-Encoding', 'identity')
  @Header('Cache-Control', 'public, max-age=86400') // 24 hour cache
  @Header('Access-Control-Allow-Origin', '*')
  @ApiOperation({
    summary: 'Get subway routes vector tile',
    description:
      'Returns a Mapbox Vector Tile (MVT) containing subway route lines for the specified tile coordinates.',
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
    this.validateTileCoordinates(z, x, y);

    const tile = await this.vectorTilesService.getTile(
      VectorTileLayer.RAIL_ROUTES,
      z,
      x,
      y,
    );

    if (!tile || tile.length === 0) {
      res.status(HttpStatus.NO_CONTENT).end();
      return;
    }

    res.send(tile);
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
    this.validateTileCoordinates(z, x, y);

    const tile = await this.vectorTilesService.getTile(
      VectorTileLayer.BUS_ROUTES,
      z,
      x,
      y,
      { routeIds: this.parseCsv(routeIds) },
    );

    if (!tile || tile.length === 0) {
      res.status(HttpStatus.NO_CONTENT).end();
      return;
    }

    res.send(tile);
  }

  @Get('bus-stops/:z/:x/:y.pbf')
  @Header('Content-Type', 'application/x-protobuf')
  @Header('Content-Encoding', 'identity')
  @Header('Cache-Control', 'public, max-age=300')
  @Header('Access-Control-Allow-Origin', '*')
  @ApiOperation({
    summary: 'Get selected or nearby bus stop vector tile',
    description:
      'Returns a Mapbox Vector Tile (MVT) containing bus stops filtered by route IDs, stop IDs, or a nearby circle.',
  })
  async getBusStopsTile(
    @Param('z', ParseIntPipe) z: number,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
    @Query('routeIds') routeIds: string | undefined,
    @Query('stopIds') stopIds: string | undefined,
    @Query('lat') lat: string | undefined,
    @Query('lon') lon: string | undefined,
    @Query('radiusMeters') radiusMeters: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    this.validateTileCoordinates(z, x, y);

    const nearby =
      lat !== undefined && lon !== undefined && radiusMeters !== undefined
        ? {
            latitude: Number(lat),
            longitude: Number(lon),
            radiusMeters: Number(radiusMeters),
          }
        : undefined;

    const tile = await this.vectorTilesService.getTile(
      VectorTileLayer.BUS_STOPS,
      z,
      x,
      y,
      {
        routeIds: this.parseCsv(routeIds),
        stopIds: this.parseCsv(stopIds),
        nearby,
      },
    );

    if (!tile || tile.length === 0) {
      res.status(HttpStatus.NO_CONTENT).end();
      return;
    }

    res.send(tile);
  }

  @Get('bike-stations/:z/:x/:y.pbf')
  @Header('Content-Type', 'application/x-protobuf')
  @Header('Content-Encoding', 'identity')
  @Header('Cache-Control', 'public, max-age=30')
  @Header('Access-Control-Allow-Origin', '*')
  @ApiOperation({
    summary: 'Get bike station vector tile',
    description:
      'Returns a Mapbox Vector Tile (MVT) containing bike stations from the current GBFS polling cache.',
  })
  async getBikeStationsTile(
    @Param('z', ParseIntPipe) z: number,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
    @Res() res: Response,
  ): Promise<void> {
    this.validateTileCoordinates(z, x, y);

    const tile = await this.vectorTilesService.getTile(
      VectorTileLayer.BIKE_STATIONS,
      z,
      x,
      y,
    );

    if (!tile || tile.length === 0) {
      res.status(HttpStatus.NO_CONTENT).end();
      return;
    }

    res.send(tile);
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to refresh stations: ${errorMessage}`,
      };
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

  private parseCsv(value: string | undefined): string[] {
    if (!value) {
      return [];
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 100);
  }
}
