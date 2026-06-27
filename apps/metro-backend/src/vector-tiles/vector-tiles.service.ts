import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RAIL_LINES } from '@metro/shared/utils';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BikePollingService } from '../bike/services/bike-polling.service';
import { RailVectorTileService } from './services/rail-vector-tile.service';

/**
 * Available vector tile layers
 */
export enum VectorTileLayer {
  RAIL_STATIONS = 'rail-stations', // Merged Metro + CPTM stations from GeoSampa WFS
  RAIL_ROUTES = 'rail-routes', // Merged Metro + CPTM lines from GeoSampa WFS
  BUS_ROUTES = 'bus-routes',
  BUS_STOPS = 'bus-stops',
  BIKE_STATIONS = 'bike-stations',
  // Legacy layers (deprecated, kept for backwards compatibility)
  SUBWAY_STATIONS = 'subway-stations',
  SUBWAY_ROUTES = 'subway-routes',
}

export interface VectorTileOptions {
  routeIds?: string[];
  stopIds?: string[];
  nearby?: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
}

/**
 * Tile bounds in Web Mercator (EPSG:3857) coordinates
 */
interface TileBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface TileCacheEntry {
  tile: Buffer;
  expiresAt: number;
}

type RailMvtViewName = 'mvt_rail_stations' | 'mvt_rail_routes';

/**
 * Service for generating Mapbox Vector Tiles (MVT) from PostGIS
 *
 * Uses ST_AsMVT to generate binary MVT tiles directly from the database.
 * Tiles are generated on-demand based on z/x/y coordinates.
 */
@Injectable()
export class VectorTilesService implements OnModuleInit {
  private readonly logger = new Logger(VectorTilesService.name);

  // Bounded in-memory tile cache for performance (Redis/edge cache can replace it later).
  private readonly tileCache = new Map<string, TileCacheEntry>();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour cache
  private readonly MAX_CACHE_ENTRIES = 2_000;
  private readonly MAX_CACHE_BYTES = 64 * 1024 * 1024; // 64 MB
  private cacheBytes = 0;
  private readonly BIKE_TILE_SCREEN_PIXELS = 512;
  private readonly BIKE_CLUSTER_MAX_ZOOM = 14;
  private readonly BIKE_CLUSTER_DISTANCE_PIXELS = 72;
  private readonly BIKE_CLUSTER_TIGHT_DISTANCE_PIXELS = 32;

  private readonly bikePollListener = this.handleBikePollComplete.bind(this);
  private readonly existingRailMvtViews = new Set<RailMvtViewName>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly bikePolling: BikePollingService,
    private readonly railVectorTileService: RailVectorTileService,
  ) {}

  onModuleInit(): void {
    this.bikePolling.onPollComplete(this.bikePollListener);
  }

  /**
   * Get a vector tile for the specified layer and coordinates
   *
   * @param layer The layer to generate tile for
   * @param z Zoom level
   * @param x Tile X coordinate
   * @param y Tile Y coordinate
   * @returns MVT binary data as Buffer
   */
  async getTile(
    layer: VectorTileLayer,
    z: number,
    x: number,
    y: number,
    options: VectorTileOptions = {},
  ): Promise<Buffer | null> {
    const cacheKey = `${layer}/${z}/${x}/${y}/${this.getOptionsCacheKey(options)}`;

    const cached = this.getCachedTile(cacheKey);
    if (cached) {
      return cached;
    }

    // Generate tile based on layer type
    let tile: Buffer | null = null;

    switch (layer) {
      case VectorTileLayer.RAIL_STATIONS:
        tile = await this.generateRailStationsTile(z, x, y);
        break;
      case VectorTileLayer.RAIL_ROUTES:
        tile = await this.generateRailRoutesTile(z, x, y);
        break;
      case VectorTileLayer.BUS_ROUTES:
        tile = await this.generateBusRoutesTile(z, x, y, options);
        break;
      case VectorTileLayer.BUS_STOPS:
        tile = await this.generateBusStopsTile(z, x, y, options);
        break;
      case VectorTileLayer.BIKE_STATIONS:
        tile = await this.generateBikeStationsTile(z, x, y);
        break;
      // Legacy layers (deprecated)
      case VectorTileLayer.SUBWAY_STATIONS:
        tile = await this.generateSubwayStationsTile(z, x, y);
        break;
      case VectorTileLayer.SUBWAY_ROUTES:
        tile = await this.generateSubwayRoutesTile(z, x, y);
        break;
      default:
        this.logger.warn(`Unknown layer: ${layer}`);
        return null;
    }

    // Cache the tile if it has content
    if (tile && tile.length > 0) {
      this.setCachedTile(cacheKey, tile);
    }

    return tile;
  }

  private getCachedTile(cacheKey: string): Buffer | null {
    const cached = this.tileCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.deleteCachedTile(cacheKey);
      return null;
    }

    this.tileCache.delete(cacheKey);
    this.tileCache.set(cacheKey, cached);
    return cached.tile;
  }

  private setCachedTile(cacheKey: string, tile: Buffer): void {
    if (tile.length > this.MAX_CACHE_BYTES) {
      return;
    }

    this.deleteCachedTile(cacheKey);
    this.tileCache.set(cacheKey, {
      tile,
      expiresAt: Date.now() + this.CACHE_TTL,
    });
    this.cacheBytes += tile.length;
    this.pruneTileCache();
  }

  private pruneTileCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.tileCache) {
      if (entry.expiresAt <= now) {
        this.deleteCachedTile(key);
      }
    }

    while (
      this.tileCache.size > this.MAX_CACHE_ENTRIES ||
      this.cacheBytes > this.MAX_CACHE_BYTES
    ) {
      const oldestKey = this.tileCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.deleteCachedTile(oldestKey);
    }
  }

  private deleteCachedTile(cacheKey: string): void {
    const existing = this.tileCache.get(cacheKey);
    if (!existing) {
      return;
    }

    this.cacheBytes -= existing.tile.length;
    this.tileCache.delete(cacheKey);
  }

  /**
   * Generate MVT tile for rail stations (Metro + CPTM stations from GeoSampa WFS)
   */
  private async generateRailStationsTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    const viewExists = await this.ensureRailMvtViewExists('mvt_rail_stations');
    if (!viewExists) {
      return null;
    }

    const { minX, minY, maxX, maxY } = this.tileToBounds(z, x, y);

    try {
      // Query mvt_rail_stations view (merged stations from local PostGIS data)
      // View columns: id, name, agencies[], lines[], is_merged, geom_3857
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
   * Generate MVT tile for rail routes (Metro + CPTM lines from GeoSampa WFS)
   */
  private async generateRailRoutesTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    const viewExists = await this.ensureRailMvtViewExists('mvt_rail_routes');
    if (!viewExists) {
      return null;
    }

    const { minX, minY, maxX, maxY } = this.tileToBounds(z, x, y);

    try {
      // Query mvt_rail_routes view (created from local PostGIS data)
      // View columns: id, name, line_number, agency, geom_3857
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

  /**
   * Generate MVT tile for subway stations (LEGACY - from SPTrans GTFS)
   * @deprecated Use generateRailStationsTile instead
   */
  private async generateSubwayStationsTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    const { minX, minY, maxX, maxY } = this.tileToBounds(z, x, y);

    try {
      // Use ST_AsMVT to generate the tile with parameterized query
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
   * Generate MVT tile for subway routes
   */
  private async generateSubwayRoutesTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    const { minX, minY, maxX, maxY } = this.tileToBounds(z, x, y);

    try {
      // Use ST_AsMVT to generate the tile with parameterized query
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

  /**
   * Generate MVT tile for selected bus route shapes.
   *
   * The route filter is mandatory so the endpoint never becomes an
   * accidental "all bus shapes" export.
   */
  private async generateBusRoutesTile(
    z: number,
    x: number,
    y: number,
    options: VectorTileOptions,
  ): Promise<Buffer | null> {
    const routeIds = this.normalizeIds(options.routeIds);
    if (routeIds.length === 0) {
      return null;
    }

    const { minX, minY, maxX, maxY } = this.tileToBounds(z, x, y);

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
  private async generateBusStopsTile(
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

    const { minX, minY, maxX, maxY } = this.tileToBounds(z, x, y);

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

  /**
   * Generate MVT tile for bike stations from the in-memory GBFS polling cache.
   * This does not call the external GBFS API.
   */
  private async generateBikeStationsTile(
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer | null> {
    const cached = this.bikePolling.getCachedSummaryPayload();
    if (!cached || cached.stations.length === 0) {
      return null;
    }

    const { minX, minY, maxX, maxY } = this.tileToBounds(z, x, y);
    const stationsJson = JSON.stringify(cached.stations);

    try {
      if (z < this.BIKE_CLUSTER_MAX_ZOOM) {
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
      ((maxX - minX) / this.BIKE_TILE_SCREEN_PIXELS) * clusterDistancePixels;

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
      return this.BIKE_CLUSTER_TIGHT_DISTANCE_PIXELS;
    }

    return this.BIKE_CLUSTER_DISTANCE_PIXELS;
  }

  /**
   * Convert tile coordinates to Web Mercator bounds
   * Using the standard XYZ tile scheme
   */
  private tileToBounds(z: number, x: number, y: number): TileBounds {
    const n = Math.pow(2, z);
    const worldSize = 20037508.34 * 2; // Web Mercator world size
    const tileSize = worldSize / n;

    const minX = -20037508.34 + x * tileSize;
    const maxX = minX + tileSize;
    const maxY = 20037508.34 - y * tileSize;
    const minY = maxY - tileSize;

    return { minX, minY, maxX, maxY };
  }

  private normalizeIds(ids: string[] | undefined): string[] {
    return Array.from(
      new Set(
        (ids ?? [])
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
          .slice(0, 100),
      ),
    );
  }

  private normalizeNearby(
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

  private getOptionsCacheKey(options: VectorTileOptions): string {
    const routeIds = this.normalizeIds(options.routeIds).sort();
    const stopIds = this.normalizeIds(options.stopIds).sort();
    const nearby = this.normalizeNearby(options.nearby);

    return JSON.stringify({
      routeIds,
      stopIds,
      nearby: nearby
        ? {
            latitude: nearby.latitude.toFixed(6),
            longitude: nearby.longitude.toFixed(6),
            radiusMeters: Math.round(nearby.radiusMeters),
          }
        : null,
    });
  }

  private handleBikePollComplete(): void {
    this.clearLayerCache(VectorTileLayer.BIKE_STATIONS);
  }

  /**
   * Clear the tile cache (useful after data updates)
   */
  clearCache(): void {
    this.tileCache.clear();
    this.cacheBytes = 0;
    this.logger.debug('Vector tile cache cleared');
  }

  /**
   * Clear cache for a specific layer
   */
  clearLayerCache(layer: VectorTileLayer): void {
    const prefix = `${layer}/`;
    for (const key of this.tileCache.keys()) {
      if (key.startsWith(prefix)) {
        this.deleteCachedTile(key);
      }
    }
    this.logger.debug(`Vector tile cache cleared for layer: ${layer}`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.tileCache.size,
      keys: Array.from(this.tileCache.keys()),
    };
  }
}
