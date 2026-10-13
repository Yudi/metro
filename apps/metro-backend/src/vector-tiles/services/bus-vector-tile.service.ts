import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { isBusDirectionFavorite, isBusLineFavorite } from '@metro/shared/utils';
import { Prisma } from '../../../generated/prisma/client';
import { BusDirectionService } from '../../geography/services/bus-direction.service';
import type { BusRouteDirection } from '../../geography/entities/bus-route-direction.entity';
import { PrismaService } from '../../prisma/prisma.service';
import { tileToBounds } from '../utils/vector-tile-geometry.util';
import { VectorTileOptions } from '../vector-tile.types';

interface ResolvedBusFilters {
  legacyRouteIds: string[];
  directions: BusRouteDirection[];
}

@Injectable()
export class BusVectorTileService {
  private readonly logger = new Logger(BusVectorTileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly busDirections: BusDirectionService,
  ) {}

  /**
   * Generate MVT tile for selected bus route shapes.
   *
   * The route filter is mandatory so the endpoint never becomes an
   * accidental "all bus shapes" export.
   * Materialized ID sets keep filters indexable through both feed views.
   */
  async generateBusRoutesTile(
    z: number,
    x: number,
    y: number,
    options: VectorTileOptions,
  ): Promise<Buffer | null> {
    const routeIds = this.normalizeIds(options.routeIds);
    if (routeIds.length === 0) {
      throw new BadRequestException(
        'routeIds must contain at least one identifier',
      );
    }

    const filters = await this.resolveRouteFilters(routeIds);
    if (
      filters.legacyRouteIds.length === 0 &&
      filters.directions.length === 0
    ) {
      return null;
    }

    const { minX, minY, maxX, maxY } = tileToBounds(z, x, y);
    const directionJson = JSON.stringify(
      filters.directions.map((direction) => ({
        route_id: direction.routeId,
        direction_id: direction.directionId,
        destination: direction.destination,
        is_circular: direction.isCircular,
        favorite_code: direction.favoriteCode,
        shape_ids: direction.shapeIds,
      })),
    );

    try {
      return await this.queryTile(Prisma.sql`
        WITH bounds AS (
          SELECT ST_Transform(
            ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
            4326
          ) AS geom
        ),
        selected_routes AS MATERIALIZED (
          SELECT *
          FROM "public"."Gtfs_Route"
          WHERE route_id = ANY(${filters.legacyRouteIds}::text[])
            AND NOT (route_type IN (1, 2) OR route_id LIKE 'METRÔ%' OR route_id LIKE 'CPTM%')
        ),
        selected_directions AS MATERIALIZED (
          SELECT direction.route_id, direction.direction_id,
            direction.destination, direction.is_circular, direction.favorite_code, direction.shape_ids
          FROM jsonb_to_recordset(${directionJson}::jsonb) AS direction(
            route_id text,
            direction_id integer,
            destination text,
            is_circular boolean,
            favorite_code text,
            shape_ids text[]
          )
        ),
        selected_trips AS MATERIALIZED (
          SELECT DISTINCT route_id, shape_id
          FROM "public"."Gtfs_Trip"
          WHERE route_id = ANY(ARRAY(SELECT route_id FROM selected_routes))
            AND shape_id IS NOT NULL
        ),
        selected_shapes AS MATERIALIZED (
          SELECT shape_id, geom
          FROM "public"."Gtfs_Shape"
          WHERE shape_id = ANY(ARRAY(SELECT shape_id FROM selected_trips))
            AND geom IS NOT NULL
        ),
        legacy_route_shapes AS (
          SELECT DISTINCT ON (r.route_id, sh.shape_id)
            sh.shape_id,
            r.route_id AS feature_route_id,
            r.route_short_name,
            r.route_long_name,
            r.route_color,
            r.route_text_color,
            r.source_agency,
            r.source_id,
            NULL::text AS destination,
            NULL::text AS favorite_code,
            NULL::integer AS direction_id,
            NULL::boolean AS is_circular,
            (LOWER(COALESCE(r.source_agency, 'sptrans')) = 'sptrans'
              AND NOT (r.route_type IN (1, 2) OR r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')) AS supports_realtime,
            sh.geom
          FROM selected_routes r
          INNER JOIN selected_trips t ON t.route_id = r.route_id
          INNER JOIN selected_shapes sh ON sh.shape_id = t.shape_id
          ORDER BY r.route_id, sh.shape_id
        ),
        direction_route_shapes AS (
          SELECT DISTINCT ON (direction.favorite_code, shape.shape_id)
            shape.shape_id,
            direction.favorite_code AS feature_route_id,
            route.route_short_name,
            route.route_long_name,
            route.route_color,
            route.route_text_color,
            route.source_agency,
            route.source_id,
            direction.destination,
            direction.favorite_code,
            direction.direction_id,
            direction.is_circular,
            (LOWER(COALESCE(route.source_agency, 'sptrans')) = 'sptrans'
              AND NOT (route.route_type IN (1, 2) OR route.route_id LIKE 'METRÔ%' OR route.route_id LIKE 'CPTM%')) AS supports_realtime,
            gtfs_shape.geom
          FROM selected_directions direction
          INNER JOIN "public"."Gtfs_Route" route
            ON route.route_id = direction.route_id
            AND NOT (route.route_type IN (1, 2) OR route.route_id LIKE 'METRÔ%' OR route.route_id LIKE 'CPTM%')
          CROSS JOIN LATERAL unnest(direction.shape_ids) AS shape(shape_id)
          INNER JOIN "public"."Gtfs_Trip" trip
            ON trip.route_id = direction.route_id
            AND trip.direction_id = direction.direction_id
            AND trip.shape_id = shape.shape_id
          INNER JOIN "public"."Gtfs_Shape" gtfs_shape
            ON gtfs_shape.shape_id = trip.shape_id
            AND gtfs_shape.geom IS NOT NULL
          ORDER BY direction.favorite_code, shape.shape_id
        ),
        route_shapes AS (
          SELECT * FROM legacy_route_shapes
          UNION ALL
          SELECT * FROM direction_route_shapes
        ),
        mvtgeom AS (
          SELECT
            ('x' || substr(md5(feature_route_id || ':' || shape_id), 1, 7))::bit(28)::integer AS id,
            shape_id,
            feature_route_id AS route_id,
            route_short_name,
            route_long_name,
            route_color,
            route_text_color,
            source_agency,
            source_id,
            destination,
            favorite_code,
            direction_id,
            is_circular,
            supports_realtime,
            ST_AsMVTGeom(
              ST_Transform(rs.geom, 3857),
              ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
              4096,
              256,
              true
            ) AS geom
          FROM route_shapes rs, bounds b
          WHERE ST_Intersects(rs.geom, b.geom)
        )
        SELECT ST_AsMVT(mvtgeom.*, 'bus-routes', 4096, 'geom') AS mvt
        FROM mvtgeom
      `);
    } catch (error) {
      this.logger.error(
        `Error generating bus routes tile (${z}/${x}/${y}):`,
        error,
      );
      throw error;
    }
  }

  /** Generate one compact, canonical marker for each bus-serving stop in a tile. */
  async generateBusStopsTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    if (z < 16) {
      return null;
    }

    const { minX, minY, maxX, maxY } = tileToBounds(z, x, y);

    try {
      return await this.queryTile(Prisma.sql`
        WITH bounds AS (
          SELECT ST_Transform(
            ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
            4326
          ) AS geom
        ),
        canonical_stops AS MATERIALIZED (
          SELECT
            COALESCE(member.physical_stop_id, stop.stop_id) AS physical_stop_id,
            stop.*
          FROM "public"."Gtfs_Stop" stop
          LEFT JOIN "public"."physical_stop_members" member
            ON member.source_stop_id = stop.stop_id
          CROSS JOIN bounds
          WHERE (member.physical_stop_id IS NULL OR member.physical_stop_id = stop.stop_id)
            AND stop.location IS NOT NULL
            AND stop.location && bounds.geom::geography
        ),
        tile_members AS MATERIALIZED (
          SELECT member.physical_stop_id, member.source_stop_id
          FROM "public"."physical_stop_members" member
          WHERE member.physical_stop_id = ANY(
            ARRAY(SELECT physical_stop_id FROM canonical_stops)
          )
        ),
        member_stops AS MATERIALIZED (
          SELECT stop_id
          FROM "public"."Gtfs_Stop"
          WHERE stop_id = ANY(ARRAY(SELECT source_stop_id FROM tile_members))
        ),
        grouped_stops AS (
          SELECT canonical.physical_stop_id, canonical.stop_id
          FROM canonical_stops canonical
          UNION
          SELECT member.physical_stop_id, member_stop.stop_id
          FROM tile_members member
          INNER JOIN member_stops member_stop
            ON member_stop.stop_id = member.source_stop_id
        ),
        merged_ids AS (
          SELECT
            member_stop.physical_stop_id,
            ARRAY_AGG(DISTINCT member_stop.stop_id ORDER BY member_stop.stop_id) AS merged_stop_ids,
            BOOL_OR(COALESCE(summary.serves_bus, false)) AS serves_bus
          FROM grouped_stops member_stop
          LEFT JOIN "public"."gtfs_stop_service_summary" summary
            ON summary.stop_id = member_stop.stop_id
          GROUP BY member_stop.physical_stop_id
        ),
        candidate_stops AS (
          SELECT
            canonical.physical_stop_id,
            canonical.id,
            canonical.stop_id,
            canonical.stop_name,
            canonical.stop_desc,
            canonical.stop_lat,
            canonical.stop_lon,
            canonical.source_agency,
            canonical.source_id,
            canonical.platform_code,
            merged_ids.merged_stop_ids,
            ST_SetSRID(ST_MakePoint(canonical.stop_lon, canonical.stop_lat), 4326) AS geom
          FROM canonical_stops canonical
          INNER JOIN merged_ids USING (physical_stop_id)
          WHERE merged_ids.serves_bus
        ),
        mvtgeom AS (
          SELECT
            ('x' || substr(md5(cs.physical_stop_id), 1, 7))::bit(28)::integer AS id,
            cs.physical_stop_id,
            cs.stop_id,
            cs.stop_name,
            cs.stop_desc,
            cs.stop_lat,
            cs.stop_lon,
            cs.source_agency,
            cs.source_id,
            cs.platform_code,
            array_to_string(cs.merged_stop_ids, ',') AS merged_stop_ids,
            ST_AsMVTGeom(
              ST_Transform(cs.geom, 3857),
              ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
              4096,
              256,
              true
            ) AS geom
          FROM candidate_stops cs, bounds b
          WHERE ST_Intersects(cs.geom, b.geom)
        )
        SELECT ST_AsMVT(mvtgeom.*, 'bus-stops', 4096, 'geom') AS mvt
        FROM mvtgeom
      `);
    } catch (error) {
      this.logger.error(
        `Error generating bus stops tile (${z}/${x}/${y}):`,
        error,
      );
      throw error;
    }
  }

  private queryTile(query: Prisma.Sql): Promise<Buffer | null> {
    // Cancel expensive SQL in PostgreSQL itself so abandoned map requests
    // cannot hold the shared connection pool indefinitely.
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`SET LOCAL statement_timeout = '5s'`;
        const result = await transaction.$queryRaw<[{ mvt: Buffer }]>(query);
        return result[0]?.mvt ?? null;
      },
      { maxWait: 2_000, timeout: 10_000 },
    );
  }

  normalizeIds(ids: string[] | undefined): string[] {
    const values = ids ?? [];
    if (values.length > 100) {
      throw new BadRequestException(
        'A maximum of 100 identifiers is supported',
      );
    }

    const normalized = values.map((id) => id.trim());
    if (normalized.some((id) => !isSafeIdentifier(id))) {
      throw new BadRequestException(
        'Identifiers must be non-empty and contain at most 128 characters',
      );
    }

    return Array.from(new Set(normalized));
  }

  private async resolveRouteFilters(
    routeIds: string[],
  ): Promise<ResolvedBusFilters> {
    const directionCodes = routeIds.filter((id) => id.startsWith('bus:'));
    const validDirectionCodes = directionCodes.filter((id) => isBusDirectionFavorite(id) || isBusLineFavorite(id));
    const legacyRouteIds = routeIds.filter(
      (id) => !id.startsWith('bus:'),
    );

    return {
      legacyRouteIds,
      directions: validDirectionCodes.length
        ? (await this.busDirections.forFavorites(validDirectionCodes)).map((direction) => ({
            ...direction,
            favoriteCode: isBusLineFavorite(direction.requestedCode) ? direction.requestedCode : direction.favoriteCode,
          }))
        : [],
    };
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
