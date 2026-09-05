import { Injectable } from '@nestjs/common';
import {
  getRailLineById,
  getStaticRailStationsByLine,
  hardNormalizeString,
} from '@metro/shared/utils';
import { RAIL_MAP_CONTEXT_LIMITS, type RailVehicleMapContext } from '@metro/rail-integration-contracts';
import { PrismaService } from '../../prisma/prisma.service';

const CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000;

interface StationRow {
  id?: string;
  name: string | null;
  originalName: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface PathPointRow {
  path_id: number | string | bigint | null;
  point_index: number | string | bigint | null;
  lat: number | string | null;
  lng: number | string | null;
}

interface CacheEntry {
  context: RailVehicleMapContext;
  expiresAt: number;
}

@Injectable()
export class RailMapContextService {
  private readonly contextCache = new Map<string, CacheEntry>();
  private readonly pendingContexts = new Map<
    string,
    Promise<RailVehicleMapContext | undefined>
  >();

  constructor(private readonly prisma: PrismaService) {}

  async getContext(
    lineCode: string,
  ): Promise<RailVehicleMapContext | undefined> {
    const line = getRailLineById(lineCode.trim());
    if (!line) {
      return undefined;
    }

    const cacheKey = line.lineId;
    const cached = this.contextCache.get(cacheKey);
    const now = Date.now();
    if (cached) {
      if (cached.expiresAt > now) {
        return cached.context;
      }
      this.contextCache.delete(cacheKey);
    }

    const pending = this.pendingContexts.get(cacheKey);
    if (pending) {
      return pending;
    }

    const request = this.loadContext(line);
    this.pendingContexts.set(cacheKey, request);
    try {
      const context = await request;
      if (context) {
        this.contextCache.set(cacheKey, {
          context,
          expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS,
        });
      }
      return context;
    } finally {
      if (this.pendingContexts.get(cacheKey) === request) {
        this.pendingContexts.delete(cacheKey);
      }
    }
  }

  private async loadContext(
    line: NonNullable<ReturnType<typeof getRailLineById>>,
  ): Promise<RailVehicleMapContext | undefined> {
    try {
      const [stationRows, pathRows] = await Promise.all([
        this.loadStationRows(line.colorName),
        this.loadPathPoints(line.code),
      ]);

      const stations = this.mapStations(line.lineId, stationRows);
      if (pathRows.length > RAIL_MAP_CONTEXT_LIMITS.points) {
        return undefined;
      }
      const paths = this.mapPaths(pathRows);
      if (stations.length === 0 || paths.length === 0 ||
        stations.length > RAIL_MAP_CONTEXT_LIMITS.stations ||
        paths.length > RAIL_MAP_CONTEXT_LIMITS.paths) {
        return undefined;
      }

      return { stations, paths };
    } catch {
      return undefined;
    }
  }

  private async loadStationRows(lineName: string): Promise<StationRow[]> {
    return this.prisma.$queryRaw<StationRow[]>`
      SELECT
        id,
        name,
        "originalName",
        latitude,
        longitude
      FROM "public"."merged_rail_stations"
      WHERE ${lineName} = ANY(lines)
    `;
  }

  private async loadPathPoints(lineNumber: number): Promise<PathPointRow[]> {
    return this.prisma.$queryRaw<PathPointRow[]>`
      WITH line_shape AS (
        SELECT ST_LineMerge(
          ST_CollectionExtract(ST_Collect(r.geom_3857 ORDER BY r.id), 2)
        ) AS geom
        FROM "public"."mvt_rail_routes" r
        WHERE r.line_number = ${lineNumber}
          AND r.geom_3857 IS NOT NULL
      ),
      shape_components AS (
        SELECT
          ROW_NUMBER() OVER (ORDER BY dumped.path) AS path_id,
          dumped.geom
        FROM line_shape
        CROSS JOIN LATERAL ST_Dump(line_shape.geom) AS dumped
        WHERE ST_GeometryType(dumped.geom) = 'ST_LineString'
          AND ST_NPoints(dumped.geom) >= 2
      )
      SELECT
        c.path_id,
        point_index,
        ST_Y(
          ST_Transform(ST_PointN(c.geom, point_index), 4326)
        )::DOUBLE PRECISION AS lat,
        ST_X(
          ST_Transform(ST_PointN(c.geom, point_index), 4326)
        )::DOUBLE PRECISION AS lng
      FROM shape_components c
      CROSS JOIN LATERAL generate_series(1, ST_NPoints(c.geom)) AS point_index
      ORDER BY c.path_id, point_index
    `;
  }

  private mapStations(
    lineCode: string,
    rows: StationRow[],
  ): RailVehicleMapContext['stations'] {
    const staticStations = getStaticRailStationsByLine(lineCode) ?? [];
    const mapped: RailVehicleMapContext['stations'] = [];

    for (const staticStation of staticStations) {
      const expectedNames = new Set(
        [staticStation.name, ...(staticStation.alternativeNames ?? [])].map(
          hardNormalizeString,
        ),
      );
      const matches = rows.filter((row) =>
        [row.name, row.originalName]
          .filter((name): name is string => Boolean(name))
          .map(hardNormalizeString)
          .some((name) => expectedNames.has(name)),
      );
      if (matches.length !== 1) {
        continue;
      }

      const latitude = toFiniteNumber(matches[0].latitude);
      const longitude = toFiniteNumber(matches[0].longitude);
      if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        continue;
      }

      mapped.push({ code: staticStation.code, lat: latitude, lng: longitude });
    }

    return mapped;
  }

  private mapPaths(
    rows: PathPointRow[],
  ): RailVehicleMapContext['paths'] {
    const invalidPaths = new Set<number>();
    const grouped = new Map<
      number,
      Array<{
        pointIndex: number;
        point: { lat: number; lng: number };
      }>
    >();

    for (const row of rows) {
      const pathId = toFiniteInteger(row.path_id);
      if (pathId === null || pathId < 1) {
        return [];
      }
      const pointIndex = toFiniteInteger(row.point_index);
      const lat = toFiniteNumber(row.lat);
      const lng = toFiniteNumber(row.lng);
      if (
        pointIndex === null ||
        pointIndex < 1 ||
        lat === null ||
        lng === null ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        invalidPaths.add(pathId);
        continue;
      }

      const points = grouped.get(pathId);
      const entry = { pointIndex, point: { lat, lng } };
      if (points) {
        points.push(entry);
      } else {
        grouped.set(pathId, [entry]);
      }
    }

    return [...grouped.entries()]
      .filter(([pathId]) => !invalidPaths.has(pathId))
      .sort(([first], [second]) => first - second)
      .flatMap(([, entries]) => {
        const ordered = entries.sort((first, second) => first.pointIndex - second.pointIndex);
        if (ordered.length < 2 || ordered.some((entry, index) => entry.pointIndex !== index + 1)) {
          return [];
        }
        return [{ points: ordered.map(({ point }) => point) }];
      });
  }
}

function toFiniteNumber(value: number | string | bigint | null): number | null {
  if (value === null) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toFiniteInteger(value: number | string | bigint | null): number | null {
  const number = toFiniteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}
