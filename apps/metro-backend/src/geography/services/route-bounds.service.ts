import { Injectable } from '@nestjs/common';
import { isBusDirectionFavorite, isBusLineFavorite } from '@metro/shared/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { AsyncTtlCache } from '../../common/cache/async-ttl-cache';
import { BoundingBox } from '../entities/geography.entity';
import { BusDirectionService } from './bus-direction.service';

/** Camera bounds cover complete shapes, independently of the visible map tiles. */
@Injectable()
export class RouteBoundsService {
  private readonly cache = new AsyncTtlCache<BoundingBox | null>(30_000, 256);

  constructor(
    private readonly prisma: PrismaService,
    private readonly directions: BusDirectionService,
  ) {}

  getBounds(routeId: string): Promise<BoundingBox | null> {
    return this.cache.getOrLoad(routeId, () => this.loadBounds(routeId));
  }

  private async loadBounds(routeId: string): Promise<BoundingBox | null> {
    const isFavorite = isBusDirectionFavorite(routeId) || isBusLineFavorite(routeId);
    const shapeIds = isFavorite
      ? [...new Set((await this.directions.forFavorites([routeId]))
          .flatMap((direction) => direction.shapeIds))]
      : null;
    if (shapeIds?.length === 0) return null;

    const rows = await this.prisma.$queryRaw<Array<{
      minLat: number | null;
      maxLat: number | null;
      minLng: number | null;
      maxLng: number | null;
    }>>`
      WITH selected_shapes AS (
        SELECT DISTINCT trip.shape_id
        FROM "public"."Gtfs_Trip" trip
        WHERE trip.route_id = ${routeId} AND ${shapeIds === null}
        UNION
        SELECT unnest(${shapeIds ?? []}::text[])
      ), bounds AS (
        SELECT ST_Extent(shape.geom) AS extent
        FROM selected_shapes selected
        INNER JOIN "public"."Gtfs_Shape" shape ON shape.shape_id = selected.shape_id
        WHERE shape.geom IS NOT NULL AND NOT ST_IsEmpty(shape.geom)
      )
      SELECT ST_YMin(extent) AS "minLat", ST_YMax(extent) AS "maxLat",
        ST_XMin(extent) AS "minLng", ST_XMax(extent) AS "maxLng"
      FROM bounds
    `;
    const bounds = rows[0];
    if (!bounds || bounds.minLat === null || bounds.maxLat === null ||
      bounds.minLng === null || bounds.maxLng === null) return null;
    return {
      minLat: bounds.minLat, maxLat: bounds.maxLat,
      minLng: bounds.minLng, maxLng: bounds.maxLng,
    };
  }
}
