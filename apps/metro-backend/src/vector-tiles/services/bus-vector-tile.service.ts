import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { tileToBounds } from '../utils/vector-tile-geometry.util';
import { VectorTileOptions } from '../vector-tile.types';

@Injectable()
export class BusVectorTileService {
  private readonly logger = new Logger(BusVectorTileService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate MVT tile for selected bus route shapes.
   *
   * The route filter is mandatory so the endpoint never becomes an
   * accidental "all bus shapes" export.
   */
  async generateBusRoutesTile(
    z: number,
    x: number,
    y: number,
    options: VectorTileOptions,
  ): Promise<Buffer | null> {
    const routeIds = this.normalizeIds(options.routeIds);
    if (routeIds.length === 0) {
      return null;
    }

    const { minX, minY, maxX, maxY } = tileToBounds(z, x, y);

    try {
      const result = await this.prisma.$queryRaw<[{ mvt: Buffer }]>`
        WITH bounds AS (
          SELECT ST_Transform(
            ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
            4326
          ) AS geom
        ),
        selected_routes AS (
          SELECT route_id
          FROM "SPTrans_Route"
          WHERE route_id = ANY(${routeIds}::text[])
        ),
        route_shapes AS (
          SELECT DISTINCT ON (sh.shape_id)
            sh.shape_id,
            r.route_id,
            r.route_short_name,
            r.route_long_name,
            r.route_color,
            r.route_text_color,
            sh.geom
          FROM selected_routes sr
          INNER JOIN "SPTrans_Trip" t ON t.route_id = sr.route_id
          INNER JOIN "SPTrans_Shape" sh ON sh.shape_id = t.shape_id
          INNER JOIN "SPTrans_Route" r ON r.route_id = t.route_id
          WHERE sh.geom IS NOT NULL
            AND r.route_id NOT LIKE 'METRÔ%'
            AND r.route_id NOT LIKE 'CPTM%'
        ),
        mvtgeom AS (
          SELECT
            ('x' || substr(md5(shape_id), 1, 7))::bit(28)::integer AS id,
            shape_id,
            route_id,
            route_short_name,
            route_long_name,
            route_color,
            route_text_color,
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
      `;

      return result[0]?.mvt ?? null;
    } catch (error) {
      this.logger.error(
        `Error generating bus routes tile (${z}/${x}/${y}):`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate MVT tile for selected or nearby bus stops.
   *
   * At least one filter is required: routeIds, stopIds, or a nearby circle.
   * This avoids sending every bus stop to the client.
   */
  async generateBusStopsTile(
    z: number,
    x: number,
    y: number,
    options: VectorTileOptions,
  ): Promise<Buffer | null> {
    const routeIds = this.normalizeIds(options.routeIds);
    const stopIds = this.normalizeIds(options.stopIds);
    const nearby = this.normalizeNearby(options.nearby);

    if (routeIds.length === 0 && stopIds.length === 0 && !nearby) {
      return null;
    }

    const { minX, minY, maxX, maxY } = tileToBounds(z, x, y);

    try {
      const hasRouteFilter = routeIds.length > 0;
      const hasStopFilter = stopIds.length > 0;
      const hasNearbyFilter = nearby !== null;
      const nearbyLatitude = nearby?.latitude ?? 0;
      const nearbyLongitude = nearby?.longitude ?? 0;
      const nearbyRadiusMeters = nearby?.radiusMeters ?? 0;

      const result = await this.prisma.$queryRaw<[{ mvt: Buffer }]>`
        WITH bounds AS (
          SELECT ST_Transform(
            ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
            4326
          ) AS geom
        ),
        candidate_stops AS (
          SELECT
            s.id,
            s.stop_id,
            s.stop_name,
            s.stop_desc,
            s.stop_lat,
            s.stop_lon,
            ST_SetSRID(ST_MakePoint(s.stop_lon, s.stop_lat), 4326) AS geom
          FROM "SPTrans_Stop" s
          WHERE (
            (
              ${hasRouteFilter}
              AND EXISTS (
                SELECT 1
                FROM "SPTrans_StopTime" st
                INNER JOIN "SPTrans_Trip" t ON t.trip_id = st.trip_id
                INNER JOIN "SPTrans_Route" r ON r.route_id = t.route_id
                WHERE st.stop_id = s.stop_id
                  AND (
                    r.route_id = ANY(${routeIds}::text[])
                  )
                  AND r.route_id NOT LIKE 'METRÔ%'
                  AND r.route_id NOT LIKE 'CPTM%'
              )
            )
            OR (
              ${hasStopFilter}
              AND s.stop_id = ANY(${stopIds}::text[])
            )
            OR (
              ${hasNearbyFilter}
              AND ST_DWithin(
                ST_SetSRID(ST_MakePoint(s.stop_lon, s.stop_lat), 4326)::geography,
                ST_SetSRID(ST_MakePoint(${nearbyLongitude}::float8, ${nearbyLatitude}::float8), 4326)::geography,
                ${nearbyRadiusMeters}::float8
              )
            )
          )
          AND EXISTS (
            SELECT 1
            FROM "SPTrans_StopTime" st
            INNER JOIN "SPTrans_Trip" t ON t.trip_id = st.trip_id
            INNER JOIN "SPTrans_Route" r ON r.route_id = t.route_id
            WHERE st.stop_id = s.stop_id
              AND r.route_id NOT LIKE 'METRÔ%'
              AND r.route_id NOT LIKE 'CPTM%'
          )
        ),
        mvtgeom AS (
          SELECT
            cs.id,
            cs.stop_id,
            cs.stop_name,
            cs.stop_desc,
            cs.stop_lat,
            cs.stop_lon,
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
      `;

      return result[0]?.mvt ?? null;
    } catch (error) {
      this.logger.error(
        `Error generating bus stops tile (${z}/${x}/${y}):`,
        error,
      );
      return null;
    }
  }

  normalizeIds(ids: string[] | undefined): string[] {
    return Array.from(
      new Set(
        (ids ?? [])
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
          .slice(0, 100),
      ),
    );
  }

  normalizeNearby(
    nearby: VectorTileOptions['nearby'],
  ): VectorTileOptions['nearby'] | null {
    if (!nearby) {
      return null;
    }

    if (
      !Number.isFinite(nearby.latitude) ||
      !Number.isFinite(nearby.longitude) ||
      !Number.isFinite(nearby.radiusMeters)
    ) {
      return null;
    }

    if (
      nearby.latitude < -90 ||
      nearby.latitude > 90 ||
      nearby.longitude < -180 ||
      nearby.longitude > 180
    ) {
      return null;
    }

    return {
      latitude: nearby.latitude,
      longitude: nearby.longitude,
      radiusMeters: Math.min(Math.max(nearby.radiusMeters, 50), 5000),
    };
  }
}
