import { Injectable, Logger } from '@nestjs/common';
import { BikePollingService } from '../../bike/services/bike-polling.service';
import { PrismaService } from '../../prisma/prisma.service';
import { tileToBounds } from '../utils/vector-tile-geometry.util';

@Injectable()
export class BikeVectorTileService {
  private readonly logger = new Logger(BikeVectorTileService.name);
  private readonly tileScreenPixels = 512;
  private readonly clusterMaxZoom = 14;
  private readonly clusterDistancePixels = 72;
  private readonly clusterTightDistancePixels = 32;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bikePolling: BikePollingService,
  ) {}

  /**
   * Generate MVT tile for bike stations from the in-memory GBFS polling cache.
   * This does not call the external GBFS API.
   */
  async generateBikeStationsTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    const cached = this.bikePolling.getCachedSummaryPayload();
    if (!cached || cached.stations.length === 0) {
      return null;
    }

    const { minX, minY, maxX, maxY } = tileToBounds(z, x, y);
    const stationsJson = JSON.stringify(cached.stations);

    try {
      if (z < this.clusterMaxZoom) {
        return this.generateClusteredBikeStationsTile(
          z,
          x,
          y,
          stationsJson,
          minX,
          minY,
          maxX,
          maxY,
        );
      }

      const result = await this.prisma.$queryRaw<[{ mvt: Buffer }]>`
        WITH bounds AS (
          SELECT ST_Transform(
            ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
            4326
          ) AS geom
        ),
        stations AS (
          SELECT
            "stationId" AS station_id,
            latitude,
            longitude,
            capacity,
            "effectiveCapacity" AS effective_capacity,
            "numBikesAvailable" AS num_bikes_available,
            "electricBikesAvailable" AS electric_bikes_available,
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geom
          FROM jsonb_to_recordset(${stationsJson}::jsonb) AS s(
            "stationId" text,
            latitude double precision,
            longitude double precision,
            capacity integer,
            "effectiveCapacity" integer,
            "numBikesAvailable" integer,
            "electricBikesAvailable" integer
          )
        ),
        mvtgeom AS (
          SELECT
            ('x' || substr(md5(station_id), 1, 7))::bit(28)::integer AS id,
            false AS cluster,
            1 AS station_count,
            station_id,
            latitude,
            longitude,
            capacity,
            effective_capacity,
            num_bikes_available,
            electric_bikes_available,
            ST_AsMVTGeom(
              ST_Transform(s.geom, 3857),
              ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
              4096,
              256,
              true
            ) AS geom
          FROM stations s, bounds b
          WHERE ST_Intersects(s.geom, b.geom)
        )
        SELECT ST_AsMVT(mvtgeom.*, 'bike-stations', 4096, 'geom') AS mvt
        FROM mvtgeom
      `;

      return result[0]?.mvt ?? null;
    } catch (error) {
      this.logger.error(
        `Error generating bike stations tile (${z}/${x}/${y}):`,
        error,
      );
      return null;
    }
  }

  private async generateClusteredBikeStationsTile(
    z: number,
    x: number,
    y: number,
    stationsJson: string,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): Promise<Buffer | null> {
    const clusterDistancePixels = this.getBikeClusterDistancePixels(z);
    const clusterSizeMeters =
      ((maxX - minX) / this.tileScreenPixels) * clusterDistancePixels;

    const result = await this.prisma.$queryRaw<[{ mvt: Buffer }]>`
      WITH bounds AS (
        SELECT
          ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857) AS geom_3857,
          ST_Transform(
            ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
            4326
          ) AS geom_4326
      ),
      stations AS (
        SELECT
          "stationId" AS station_id,
          latitude,
          longitude,
          capacity,
          "effectiveCapacity" AS effective_capacity,
          "numBikesAvailable" AS num_bikes_available,
          "electricBikesAvailable" AS electric_bikes_available,
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geom_4326,
          ST_Transform(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326), 3857) AS geom_3857
        FROM jsonb_to_recordset(${stationsJson}::jsonb) AS s(
          "stationId" text,
          latitude double precision,
          longitude double precision,
          capacity integer,
          "effectiveCapacity" integer,
          "numBikesAvailable" integer,
          "electricBikesAvailable" integer
        )
      ),
      station_cells AS (
        SELECT
          FLOOR((ST_X(s.geom_3857) - ${minX}::float8) / ${clusterSizeMeters}::float8)::integer AS cluster_x,
          FLOOR((${maxY}::float8 - ST_Y(s.geom_3857)) / ${clusterSizeMeters}::float8)::integer AS cluster_y,
          s.*
        FROM stations s, bounds b
        WHERE ST_Intersects(s.geom_4326, b.geom_4326)
      ),
      clusters AS (
        SELECT
          cluster_x,
          cluster_y,
          COUNT(*)::integer AS station_count,
          SUM(num_bikes_available)::integer AS num_bikes_available,
          SUM(electric_bikes_available)::integer AS electric_bikes_available,
          SUM(effective_capacity)::integer AS effective_capacity,
          NULLIF(SUM(COALESCE(capacity, 0)), 0)::integer AS capacity,
          ST_Transform(ST_Centroid(ST_Collect(geom_3857)), 4326) AS geom_4326,
          ST_Centroid(ST_Collect(geom_3857)) AS geom_3857
        FROM station_cells
        GROUP BY cluster_x, cluster_y
      ),
      mvtgeom AS (
        SELECT
          ('x' || substr(md5(${z}::text || '/' || ${x}::text || '/' || ${y}::text || '/' || cluster_x::text || '/' || cluster_y::text), 1, 7))::bit(28)::integer AS id,
          true AS cluster,
          station_count,
          num_bikes_available,
          electric_bikes_available,
          effective_capacity,
          capacity,
          ST_Y(geom_4326) AS latitude,
          ST_X(geom_4326) AS longitude,
          ST_AsMVTGeom(
            geom_3857,
            ST_MakeEnvelope(${minX}::float8, ${minY}::float8, ${maxX}::float8, ${maxY}::float8, 3857),
            4096,
            256,
            true
          ) AS geom
        FROM clusters
      )
      SELECT ST_AsMVT(mvtgeom.*, 'bike-stations', 4096, 'geom') AS mvt
      FROM mvtgeom
    `;

    return result[0]?.mvt ?? null;
  }

  private getBikeClusterDistancePixels(z: number): number {
    if (z >= 14) {
      return this.clusterTightDistancePixels;
    }

    return this.clusterDistancePixels;
  }
}
