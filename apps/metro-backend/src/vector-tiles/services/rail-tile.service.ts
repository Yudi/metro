import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { tileToBounds } from '../utils/vector-tile-geometry.util';
import { RailVectorTileService } from './rail-vector-tile.service';
import { SELECTED_RAIL_ROUTES_MATERIALIZED_VIEW } from '../../rail-import/services/rail-route-interop.sql';

type RailMvtViewName =
  | 'mvt_rail_stations'
  | 'mvt_rail_routes'
  | typeof SELECTED_RAIL_ROUTES_MATERIALIZED_VIEW;

@Injectable()
export class RailTileService {
  private static readonly MAX_CONCURRENT_ROUTE_TILE_GENERATIONS = 4;
  private static readonly MAX_QUEUED_ROUTE_TILE_GENERATIONS = 32;
  private readonly logger = new Logger(RailTileService.name);
  private readonly existingRailMvtViews = new Set<RailMvtViewName>();
  private activeRouteTileGenerations = 0;
  private readonly waitingRouteTileGenerations: Array<() => void> = [];
  private railMvtViewsRefresh?: Promise<void>;

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
    return this.withRouteTileCapacity(async () => {
      const viewExists = await this.ensureRailMvtViewExists(
        SELECTED_RAIL_ROUTES_MATERIALIZED_VIEW,
      );
      if (!viewExists) {
        throw new Error('Selected rail routes vector-tile view is unavailable');
      }

      const { minX, minY, maxX, maxY } = tileToBounds(z, x, y);

      try {
        const result = await this.prisma.$queryRaw<[{ mvt: Buffer }]>`
          WITH mvtgeom AS (
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
            FROM "public"."mvt_selected_rail_routes" r
            WHERE r.geom_3857 && ST_MakeEnvelope(
              ${minX}::float8,
              ${minY}::float8,
              ${maxX}::float8,
              ${maxY}::float8,
              3857
            )
              AND ST_Intersects(
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
    });
  }

  private async withRouteTileCapacity<T>(action: () => Promise<T>): Promise<T> {
    if (
      this.activeRouteTileGenerations >=
      RailTileService.MAX_CONCURRENT_ROUTE_TILE_GENERATIONS
    ) {
      if (
        this.waitingRouteTileGenerations.length >=
        RailTileService.MAX_QUEUED_ROUTE_TILE_GENERATIONS
      ) {
        throw new ServiceUnavailableException(
          'Rail route tile generation capacity is temporarily full',
        );
      }

      await new Promise<void>((resolve) => {
        this.waitingRouteTileGenerations.push(resolve);
      });
    } else {
      this.activeRouteTileGenerations++;
    }

    try {
      return await action();
    } finally {
      const next = this.waitingRouteTileGenerations.shift();
      if (next) {
        next();
      } else {
        this.activeRouteTileGenerations--;
      }
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
      await this.refreshRailMvtViewsOnce();
    } catch (error) {
      this.logger.error('Failed to create missing rail MVT views:', error);
      throw error;
    }

    if (await this.railMvtViewExists(viewName)) {
      this.existingRailMvtViews.add('mvt_rail_stations');
      this.existingRailMvtViews.add('mvt_rail_routes');
      this.existingRailMvtViews.add(SELECTED_RAIL_ROUTES_MATERIALIZED_VIEW);
      return true;
    }

    this.logger.warn(
      `Rail MVT view "${viewName}" is still unavailable after refresh`,
    );
    throw new Error(`Rail MVT view "${viewName}" is unavailable after refresh`);
  }

  private refreshRailMvtViewsOnce(): Promise<void> {
    if (this.railMvtViewsRefresh) {
      return this.railMvtViewsRefresh;
    }

    const refresh = this.railVectorTileService.refreshMvtViews();
    this.railMvtViewsRefresh = refresh;
    void refresh.then(
      () => {
        if (this.railMvtViewsRefresh === refresh) {
          this.railMvtViewsRefresh = undefined;
        }
      },
      () => {
        if (this.railMvtViewsRefresh === refresh) {
          this.railMvtViewsRefresh = undefined;
        }
      },
    );
    return refresh;
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
