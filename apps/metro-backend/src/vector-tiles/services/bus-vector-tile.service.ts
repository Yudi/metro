import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
      throw new BadRequestException(
        'routeIds must contain at least one identifier',
      );
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
          FROM "public"."Gtfs_Route"
          WHERE route_id = ANY(${routeIds}::text[])
        ),
        route_shapes AS (
          SELECT DISTINCT ON (r.route_id, sh.shape_id)
            sh.shape_id,
            r.route_id,
            r.route_short_name,
            r.route_long_name,
            r.route_color,
            r.route_text_color,
            r.source_agency,
            r.source_id,
            (LOWER(COALESCE(r.source_agency, 'sptrans')) = 'sptrans'
              AND NOT (r.route_type IN (1, 2) OR r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')) AS supports_realtime,
            sh.geom
          FROM selected_routes sr
          INNER JOIN "public"."Gtfs_Trip" t ON t.route_id = sr.route_id
          INNER JOIN "public"."Gtfs_Shape" sh ON sh.shape_id = t.shape_id
          INNER JOIN "public"."Gtfs_Route" r ON r.route_id = t.route_id
          WHERE sh.geom IS NOT NULL
            AND NOT (r.route_type IN (1, 2) OR r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')
          ORDER BY r.route_id, sh.shape_id, t.trip_id
        ),
        mvtgeom AS (
          SELECT
            ('x' || substr(md5(route_id || ':' || shape_id), 1, 7))::bit(28)::integer AS id,
            shape_id,
            route_id,
            route_short_name,
            route_long_name,
            route_color,
            route_text_color,
            source_agency,
            source_id,
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
      `;

      return result[0]?.mvt ?? null;
    } catch (error) {
      this.logger.error(
        `Error generating bus routes tile (${z}/${x}/${y}):`,
        error,
      );
      throw error;
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
      throw new BadRequestException(
        'At least one route, stop, or nearby filter is required',
      );
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
        canonical_stops AS (
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
        grouped_stops AS (
          SELECT canonical.physical_stop_id, canonical.stop_id
          FROM canonical_stops canonical
          UNION ALL
          SELECT canonical.physical_stop_id, member_stop.stop_id
          FROM canonical_stops canonical
          INNER JOIN "public"."physical_stop_members" member
            ON member.physical_stop_id = canonical.physical_stop_id
          INNER JOIN "public"."Gtfs_Stop" member_stop
            ON member_stop.stop_id = member.source_stop_id
        ),
        merged_ids AS (
          SELECT
            physical_stop_id,
            ARRAY_AGG(DISTINCT stop_id ORDER BY stop_id) AS merged_stop_ids
          FROM grouped_stops
          GROUP BY physical_stop_id
        ),
        representatives AS (
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
        ),
        candidate_stops AS (
          SELECT representatives.*
          FROM representatives
          WHERE (
            (
              ${hasRouteFilter}
              AND EXISTS (
                SELECT 1
                FROM grouped_stops member_stop
                INNER JOIN "public"."Gtfs_StopTime" st
                  ON st.stop_id = member_stop.stop_id
                INNER JOIN "public"."Gtfs_Trip" t
                  ON t.trip_id = st.trip_id
                INNER JOIN "public"."Gtfs_Route" r
                  ON r.route_id = t.route_id
                WHERE member_stop.physical_stop_id = representatives.physical_stop_id
                  AND r.route_id = ANY(${routeIds}::text[])
                  AND NOT (r.route_type IN (1, 2) OR r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')
              )
            )
            OR (
              ${hasStopFilter}
              AND EXISTS (
                SELECT 1
                FROM grouped_stops member_stop
                WHERE member_stop.physical_stop_id = representatives.physical_stop_id
                  AND member_stop.stop_id = ANY(${stopIds}::text[])
              )
            )
            OR (
              ${hasNearbyFilter}
              AND ST_DWithin(
                representatives.geom::geography,
                ST_SetSRID(ST_MakePoint(${nearbyLongitude}::float8, ${nearbyLatitude}::float8), 4326)::geography,
                ${nearbyRadiusMeters}::float8
              )
            )
          )
          AND EXISTS (
            SELECT 1
            FROM grouped_stops member_stop
            INNER JOIN "public"."Gtfs_StopTime" st
              ON st.stop_id = member_stop.stop_id
            INNER JOIN "public"."Gtfs_Trip" t ON t.trip_id = st.trip_id
            INNER JOIN "public"."Gtfs_Route" r ON r.route_id = t.route_id
            WHERE member_stop.physical_stop_id = representatives.physical_stop_id
              AND NOT (r.route_type IN (1, 2) OR r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')
          )
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
      `;

      return result[0]?.mvt ?? null;
    } catch (error) {
      this.logger.error(
        `Error generating bus stops tile (${z}/${x}/${y}):`,
        error,
      );
      throw error;
    }
  }

  normalizeIds(ids: string[] | undefined): string[] {
    const values = ids ?? [];
    if (values.length > 100) {
      throw new BadRequestException('A maximum of 100 identifiers is supported');
    }

    const normalized = values.map((id) => id.trim());
    if (normalized.some((id) => !isSafeIdentifier(id))) {
      throw new BadRequestException(
        'Identifiers must be non-empty and contain at most 128 characters',
      );
    }

    return Array.from(new Set(normalized));
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
      throw new BadRequestException(
        'Nearby coordinates and radius must be finite',
      );
    }

    if (
      nearby.latitude < -90 ||
      nearby.latitude > 90 ||
      nearby.longitude < -180 ||
      nearby.longitude > 180
    ) {
      throw new BadRequestException(
        'Nearby coordinates are outside their valid ranges',
      );
    }

    if (nearby.radiusMeters <= 0 || nearby.radiusMeters > 5_000) {
      throw new BadRequestException(
        'Nearby radius must be greater than 0 and at most 5000 meters',
      );
    }

    return {
      latitude: nearby.latitude,
      longitude: nearby.longitude,
      radiusMeters: Math.min(Math.max(nearby.radiusMeters, 50), 5000),
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
