import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { tileToBounds } from '../utils/vector-tile-geometry.util';
import { RailVectorTileService } from './rail-vector-tile.service';
import { railRoutesSql } from '../../rail-import/services/rail-route-interop.sql';

type RailMvtViewName = 'mvt_rail_stations' | 'mvt_rail_routes';

@Injectable()
export class RailTileService {
  private readonly logger = new Logger(RailTileService.name);
  private readonly existingRailMvtViews = new Set<RailMvtViewName>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly railVectorTileService: RailVectorTileService,
  ) {}

  async generateRailStationsTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    const viewExists = await this.ensureRailMvtViewExists('mvt_rail_stations');
    if (!viewExists) {
      throw new Error('Rail stations vector-tile view is unavailable');
    }

    const { minX, minY, maxX, maxY } = tileToBounds(z, x, y);

    try {
      const result = await this.prisma.$queryRaw<[{ mvt: Buffer }]>`
        WITH mvtgeom AS (
          SELECT
            m."primaryId" AS id,
            s.name,
            to_jsonb(s.agencies)::text AS agencies,
            to_jsonb(s.lines)::text AS lines,
            s.is_merged,
            ST_AsMVTGeom(
              s.geom_3857,
              ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
              4096,
              256,
              true
            ) AS geom
          FROM mvt_rail_stations s
          INNER JOIN merged_rail_stations m ON m.id = s.id
          WHERE ST_Intersects(
            s.geom_3857,
            ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857)
          )
        )
        SELECT ST_AsMVT(mvtgeom.*, 'rail-stations', 4096, 'geom') AS mvt
        FROM mvtgeom
      `;

      return result[0]?.mvt ?? null;
    } catch (error) {
      this.logger.error(
        `Error generating rail stations tile (${z}/${x}/${y}):`,
        error,
      );
      throw error;
    }
  }

  async generateRailRoutesTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    const viewExists = await this.ensureRailMvtViewExists('mvt_rail_routes');
    if (!viewExists) {
      throw new Error('Rail routes vector-tile view is unavailable');
    }

    const { minX, minY, maxX, maxY } = tileToBounds(z, x, y);

    try {
      const result = await this.prisma.$queryRaw<[{ mvt: Buffer }]>`
        ${railRoutesSql()},
        mvtgeom AS (
          SELECT
            r.id,
            r.name,
            r.line_number,
            r.agency,
            r.line_number AS line_code,
            r.color_hex,
            r.agency AS inferred_agency,
            r.source,
            ST_AsMVTGeom(
              r.geom_3857,
              ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
              4096,
              256,
              true
            ) AS geom
          FROM selected_rail_routes r
          WHERE ST_Intersects(
            r.geom_3857,
            ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857)
          )
        )
        SELECT ST_AsMVT(mvtgeom.*, 'rail-routes', 4096, 'geom') AS mvt
        FROM mvtgeom
      `;

      return result[0]?.mvt ?? null;
    } catch (error) {
      this.logger.error(
        `Error generating rail routes tile (${z}/${x}/${y}):`,
        error,
      );
      throw error;
    }
  }

  private async ensureRailMvtViewExists(
    viewName: RailMvtViewName,
  ): Promise<boolean> {
    if (this.existingRailMvtViews.has(viewName)) {
      return true;
    }

    if (await this.railMvtViewExists(viewName)) {
      this.existingRailMvtViews.add(viewName);
      return true;
    }

    this.logger.warn(
      `Rail MVT view "${viewName}" does not exist, attempting to refresh rail MVT views`,
    );

    try {
      await this.railVectorTileService.refreshMvtViews();
    } catch (error) {
      this.logger.error('Failed to create missing rail MVT views:', error);
      throw error;
    }

    if (await this.railMvtViewExists(viewName)) {
      this.existingRailMvtViews.add('mvt_rail_stations');
      this.existingRailMvtViews.add('mvt_rail_routes');
      return true;
    }

    this.logger.warn(
      `Rail MVT view "${viewName}" is still unavailable after refresh`,
    );
    throw new Error(`Rail MVT view "${viewName}" is unavailable after refresh`);
  }

  private async railMvtViewExists(viewName: RailMvtViewName): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<[{ exists: boolean }]>`
        SELECT to_regclass(${`public.${viewName}`}) IS NOT NULL AS exists
      `;
      return result[0]?.exists ?? false;
    } catch (error) {
      this.logger.error(`Failed to check rail MVT view "${viewName}":`, error);
      throw error;
    }
  }
}
