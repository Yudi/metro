import { getRailLineByCode } from '@metro/shared/utils';
import { Prisma } from '../../../generated/prisma/client';
import {
  RAIL_DATASETS,
  type RailLineDatasetConfig,
} from '../config/rail-datasets.config';

/** Resolve route geometry for map tiles and train context. SPTrans shapes are
 * joined through trips, using the longest shape per route.
 */
export function railRoutesSql(
  configuration: readonly RailLineDatasetConfig[] = RAIL_DATASETS,
): Prisma.Sql {
  const lineValues = Prisma.join(
    configuration.map((config) => {
      const line = getRailLineByCode(config.lineCode);
      if (!line) {
        throw new Error(`Unknown rail dataset line: ${config.lineCode}`);
      }
      return Prisma.sql`(${line.code}::smallint, ${config.source}::text,
        ${line.fullName}::text, ${line.agency}::text, ${line.colorHex}::text,
        ${[...config.gtfsRouteIds]}::text[])`;
    }),
  );

  return Prisma.sql`
    WITH line_config(line_code, source, name, agency, color_hex, gtfs_route_ids) AS (
      VALUES ${lineValues}
    ),
    sptrans_shapes AS (
      SELECT DISTINCT ON (config.line_code, r.route_id)
        config.line_code, r.route_id, sh.geom
      FROM line_config config
      CROSS JOIN LATERAL UNNEST(config.gtfs_route_ids) AS mapping(route_id)
      INNER JOIN "public"."SPTrans_Route" r ON r.route_id = mapping.route_id
      INNER JOIN "public"."SPTrans_Trip" t ON t.route_id = r.route_id
      INNER JOIN "public"."SPTrans_Shape" sh ON sh.shape_id = t.shape_id
      WHERE sh.geom IS NOT NULL AND NOT ST_IsEmpty(sh.geom)
        AND ST_NPoints(sh.geom) >= 2
      ORDER BY config.line_code, r.route_id, ST_Length(sh.geom::geography) DESC,
        sh.shape_id
    ),
    sptrans_lines AS (
      SELECT line_code,
        ST_UnaryUnion(ST_Collect(ST_Transform(geom, 3857))) AS geom_3857
      FROM sptrans_shapes
      GROUP BY line_code
    ),
    geosampa_lines AS (
      SELECT r.line_number AS line_code,
        ST_UnaryUnion(ST_Collect(r.geom_3857)) AS geom_3857
      FROM "public"."mvt_rail_routes" r
      WHERE r.geom_3857 IS NOT NULL AND NOT ST_IsEmpty(r.geom_3857)
      GROUP BY r.line_number
    ),
    selected_rail_routes AS (
      SELECT config.line_code AS id, config.line_code AS line_number,
        config.name, config.agency, config.color_hex,
        CASE
          WHEN config.source = 'sptrans' AND sp.geom_3857 IS NOT NULL THEN 'sptrans'
          WHEN config.source = 'geosampa' AND geo.geom_3857 IS NOT NULL THEN 'geosampa'
          WHEN sp.geom_3857 IS NOT NULL THEN 'sptrans'
          ELSE 'geosampa'
        END AS source,
        CASE config.source
          WHEN 'sptrans' THEN COALESCE(sp.geom_3857, geo.geom_3857)
          ELSE COALESCE(geo.geom_3857, sp.geom_3857)
        END AS geom_3857
      FROM line_config config
      LEFT JOIN sptrans_lines sp ON sp.line_code = config.line_code
      LEFT JOIN geosampa_lines geo ON geo.line_code = config.line_code
      WHERE sp.geom_3857 IS NOT NULL OR geo.geom_3857 IS NOT NULL
    )
  `;
}
