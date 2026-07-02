import { Injectable, Logger } from '@nestjs/common';
import { RAIL_LINES } from '@metro/shared/utils';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { tileToBounds } from '../utils/vector-tile-geometry.util';
import { RailVectorTileService } from './rail-vector-tile.service';

type RailMvtViewName = 'mvt_rail_stations' | 'mvt_rail_routes';

@Injectable()
export class RailTileService {
  private readonly logger = new Logger(RailTileService.name);
  private readonly existingRailMvtViews = new Set<RailMvtViewName>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly railVectorTileService: RailVectorTileService,
  ) {}

  /**
   * Generate MVT tile for rail stations (Metro + CPTM stations from GeoSampa WFS).
   */
  async generateRailStationsTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    const viewExists = await this.ensureRailMvtViewExists('mvt_rail_stations');
    if (!viewExists) {
      return null;
    }

    const { minX, minY, maxX, maxY } = tileToBounds(z, x, y);

    try {
      const result = await this.prisma.$queryRaw<[{ mvt: Buffer }]>`
        WITH mvtgeom AS (
          SELECT
            s.id,
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
      return null;
    }
  }

  /**
   * Generate MVT tile for rail routes (Metro + CPTM lines from GeoSampa WFS).
   */
  async generateRailRoutesTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    const viewExists = await this.ensureRailMvtViewExists('mvt_rail_routes');
    if (!viewExists) {
      return null;
    }

    const { minX, minY, maxX, maxY } = tileToBounds(z, x, y);

    try {
      const railLineMetadata = this.getRailLineMetadataValues();
      const result = await this.prisma.$queryRaw<[{ mvt: Buffer }]>`
        WITH line_metadata(line_code, color_hex, inferred_agency) AS (
          VALUES ${railLineMetadata}
        ),
        mvtgeom AS (
          SELECT
            r.id,
            r.name,
            r.line_number,
            r.agency,
            lm.line_code,
            lm.color_hex,
            lm.inferred_agency,
            ST_AsMVTGeom(
              r.geom_3857,
              ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
              4096,
              256,
              true
            ) AS geom
          FROM mvt_rail_routes r
          LEFT JOIN line_metadata lm ON lm.line_code = r.line_number
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
      return null;
    }
  }

  /**
   * Generate MVT tile for subway stations (LEGACY - from SPTrans GTFS).
   *
   * @deprecated Use generateRailStationsTile instead.
   */
  async generateSubwayStationsTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    const { minX, minY, maxX, maxY } = tileToBounds(z, x, y);

    try {
      const result = await this.prisma.$queryRaw<[{ mvt: Buffer }]>`
        WITH bounds AS (
          SELECT ST_Transform(
            ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
            4326
          ) AS geom
        ),
        mvtgeom AS (
          SELECT
            s.id,
            s.stop_id,
            s.name,
            s.agencies::text[] as agencies,
            s.route_short_names::text[] as route_short_names,
            ST_AsMVTGeom(
              ST_Transform(s.geom, 3857),
              ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
              4096,
              256,
              true
            ) AS geom
          FROM mvt_subway_stations s, bounds b
          WHERE ST_Intersects(s.geom, b.geom)
        )
        SELECT ST_AsMVT(mvtgeom.*, 'subway-stations', 4096, 'geom') AS mvt
        FROM mvtgeom
      `;

      return result[0]?.mvt ?? null;
    } catch (error) {
      this.logger.error(
        `Error generating subway stations tile (${z}/${x}/${y}):`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate MVT tile for subway routes.
   */
  async generateSubwayRoutesTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    const { minX, minY, maxX, maxY } = tileToBounds(z, x, y);

    try {
      const result = await this.prisma.$queryRaw<[{ mvt: Buffer }]>`
        WITH bounds AS (
          SELECT ST_Transform(
            ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
            4326
          ) AS geom
        ),
        mvtgeom AS (
          SELECT
            r.id,
            r.route_id,
            r.short_name,
            r.long_name,
            r.color,
            r.text_color,
            ST_AsMVTGeom(
              ST_Transform(r.geom, 3857),
              ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
              4096,
              256,
              true
            ) AS geom
          FROM mvt_subway_routes r, bounds b
          WHERE ST_Intersects(r.geom, b.geom)
        )
        SELECT ST_AsMVT(mvtgeom.*, 'subway-routes', 4096, 'geom') AS mvt
        FROM mvtgeom
      `;

      return result[0]?.mvt ?? null;
    } catch (error) {
      this.logger.error(
        `Error generating subway routes tile (${z}/${x}/${y}):`,
        error,
      );
      return null;
    }
  }

  private getRailLineMetadataValues(): Prisma.Sql {
    return Prisma.join(
      RAIL_LINES.map((line) =>
        Prisma.sql`(${line.code}::smallint, ${line.colorHex}::text, ${line.agency}::text)`,
      ),
    );
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
      return false;
    }

    if (await this.railMvtViewExists(viewName)) {
      this.existingRailMvtViews.add('mvt_rail_stations');
      this.existingRailMvtViews.add('mvt_rail_routes');
      return true;
    }

    this.logger.warn(
      `Rail MVT view "${viewName}" is still unavailable after refresh`,
    );
    return false;
  }

  private async railMvtViewExists(viewName: RailMvtViewName): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<[{ exists: boolean }]>`
        SELECT to_regclass(${`public.${viewName}`}) IS NOT NULL AS exists
      `;
      return result[0]?.exists ?? false;
    } catch (error) {
      this.logger.error(`Failed to check rail MVT view "${viewName}":`, error);
      return false;
    }
  }
}
