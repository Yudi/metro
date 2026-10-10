import { Injectable } from '@nestjs/common';
import {
  encodeBusDirectionFavorite,
  matchBusDirectionFavorite,
  parseBusDirectionFavorite,
  parseBusLineFavorite,
  getBusLineDirectionAnchor,
} from '@metro/shared/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { BusRouteDirection } from '../entities/bus-route-direction.entity';
import { GeometryData } from '../entities/geography.entity';
import { BusRouteRow, mapBusRoute } from './bus-catalog.utils';

interface DirectionRow extends BusRouteRow {
  direction_id: number | null;
  destination: string;
  shape_ids: string[];
  stops: Array<{ latitude: number; longitude: number; name: string }>;
  serves_stop: boolean;
}

/** Resolve a saved geographic direction against the current feed, never its IDs. */
@Injectable()
export class BusDirectionService {
  constructor(private readonly prisma: PrismaService) {}

  async geometry(direction: BusRouteDirection): Promise<GeometryData | null> {
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
      return tx.$queryRaw<Array<{ coordinates: number[][] }>>`
      SELECT ST_AsGeoJSON(geom)::json->'coordinates' AS coordinates
      FROM "public"."Gtfs_Shape"
      WHERE shape_id = ANY(${direction.shapeIds}::text[]) AND geom IS NOT NULL
      ORDER BY ST_Length(geom::geography) DESC, shape_id LIMIT 1
    `;
    }, { maxWait: 2_000, timeout: 10_000 });
    return rows[0] ? { type: 'LineString', coordinates: rows[0].coordinates } : null;
  }

  async forRoutes(ids: string[], stopId?: string): Promise<BusRouteDirection[]> {
    if (ids.length === 0) return [];
    return this.loadDirections(ids, [], [], stopId);
  }

  async forStop(stopId: string): Promise<BusRouteDirection[]> {
    const routes = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
      return tx.$queryRaw<Array<{ route_id: string }>>`
      SELECT DISTINCT trip.route_id FROM "public"."Gtfs_Trip" trip
      INNER JOIN "public"."Gtfs_StopTime" stop_time ON stop_time.trip_id = trip.trip_id
      WHERE stop_time.stop_id = ${stopId} OR stop_time.stop_id IN (
        SELECT source_stop_id FROM "public"."physical_stop_members"
        WHERE physical_stop_id = COALESCE((
          SELECT physical_stop_id FROM "public"."physical_stop_members"
          WHERE source_stop_id = ${stopId} LIMIT 1
        ), ${stopId})
      )
    `;
    }, { maxWait: 2_000, timeout: 10_000 });
    return this.forRoutes(routes.map((route) => route.route_id), stopId);
  }

  async forFavorites(codes: string[]): Promise<BusRouteDirection[]> {
    const snapshots = codes.flatMap((code) => {
      const identity = parseBusDirectionFavorite(code) ?? parseBusLineFavorite(code);
      return identity ? [identity] : [];
    });
    const legacy = codes.filter((code) => !code.startsWith('bus:'));
    if (legacy.length === 0 && snapshots.length === 0) return [];
    const candidates = await this.loadDirections(
      legacy,
      snapshots.map((identity) => identity.sourceAgency),
      snapshots.map((identity) => identity.shortName),
    );
    return codes.flatMap((code) => {
      const lineAnchor = getBusLineDirectionAnchor(code);
      if (lineAnchor) {
        const match = matchBusDirectionFavorite(lineAnchor, candidates);
        return match ? candidates
          .filter((candidate) => candidate.routeId === match.routeId)
          .map((candidate) => ({ ...candidate, requestedCode: code })) : [];
      }
      if (parseBusDirectionFavorite(code)) {
        const match = matchBusDirectionFavorite(code, candidates);
        return match ? [{ ...match, favoriteCode: code, requestedCode: code }] : [];
      }
      // Legacy whole-line favorites expand only after their current route resolves.
      return candidates
        .filter((candidate) => candidate.routeId === code)
        .map((candidate) => ({ ...candidate, requestedCode: code }));
    });
  }

  private async loadDirections(
    routeIds: string[],
    agencies: string[],
    shortNames: string[],
    stopId?: string,
  ): Promise<BusRouteDirection[]> {
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
      return tx.$queryRaw<DirectionRow[]>`
      WITH selected_routes AS MATERIALIZED (
        SELECT route.*
        FROM "public"."Gtfs_Route" route
        WHERE (route.route_id = ANY(${routeIds}::text[])
          OR EXISTS (
            SELECT 1 FROM unnest(${agencies}::text[], ${shortNames}::text[]) identity(agency, short_name)
            WHERE LOWER(route.source_agency) = identity.agency
              AND UPPER(TRIM(route.route_short_name)) = UPPER(TRIM(identity.short_name))
          ))
          AND (route.route_type IN (3, 11) OR route.route_type BETWEEN 700 AND 799)
      ),
      requested_source_stops AS MATERIALIZED (
        SELECT ${stopId ?? ''} AS stop_id
        UNION
        SELECT source_stop_id FROM "public"."physical_stop_members"
        WHERE physical_stop_id = COALESCE((
          SELECT physical_stop_id FROM "public"."physical_stop_members"
          WHERE source_stop_id = ${stopId ?? ''} LIMIT 1
        ), ${stopId ?? ''})
      ),
      trip_summaries AS MATERIALIZED (
        SELECT trip.route_id, trip.direction_id, trip.trip_headsign, trip.shape_id, trip.trip_id,
          COUNT(stop_time.stop_sequence) AS stop_count,
          (ARRAY_AGG(stop_time.stop_id ORDER BY stop_time.stop_sequence))[1] AS origin_stop_id,
          (ARRAY_AGG(stop_time.stop_id ORDER BY stop_time.stop_sequence))[COUNT(stop_time.stop_sequence)::int] AS destination_stop_id,
          BOOL_OR(stop_time.stop_id IN (SELECT stop_id FROM requested_source_stops)) AS serves_stop
        FROM "public"."Gtfs_Trip" trip
        INNER JOIN selected_routes route ON route.route_id = trip.route_id
        INNER JOIN "public"."Gtfs_StopTime" stop_time ON stop_time.trip_id = trip.trip_id
        GROUP BY trip.route_id, trip.direction_id, trip.trip_headsign, trip.shape_id, trip.trip_id
      ),
      patterns AS MATERIALIZED (
        SELECT DISTINCT ON (route_id, direction_id, trip_headsign, shape_id, origin_stop_id, destination_stop_id)
          summary.*,
          BOOL_OR(serves_stop) OVER (
            PARTITION BY route_id, direction_id, trip_headsign, shape_id, origin_stop_id, destination_stop_id
          ) AS pattern_serves_stop
        FROM trip_summaries summary
        ORDER BY route_id, direction_id, trip_headsign, shape_id, origin_stop_id, destination_stop_id,
          stop_count DESC, trip_id
      ),
      pattern_stops AS (
        SELECT pattern.route_id, pattern.direction_id, pattern.trip_headsign, pattern.shape_id, pattern.trip_id,
          itinerary.stops, pattern.pattern_serves_stop AS serves_stop
        FROM patterns pattern
        CROSS JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
            'latitude', stop.stop_lat, 'longitude', stop.stop_lon, 'name', stop.stop_name
          ) ORDER BY stop_time.stop_sequence) AS stops
          FROM "public"."Gtfs_StopTime" stop_time
          INNER JOIN "public"."Gtfs_Stop" stop ON stop.stop_id = stop_time.stop_id
          WHERE stop_time.trip_id = pattern.trip_id
        ) itinerary
        WHERE jsonb_array_length(itinerary.stops) >= 2
      ),
      anchored_patterns AS (
        SELECT pattern.*,
          concat_ws(':',
            round((stops->0->>'latitude')::numeric, 3),
            round((stops->0->>'longitude')::numeric, 3),
            round((stops->-1->>'latitude')::numeric, 3),
            round((stops->-1->>'longitude')::numeric, 3),
            CASE WHEN ST_DistanceSphere(
              ST_SetSRID(ST_MakePoint((stops->0->>'longitude')::float8, (stops->0->>'latitude')::float8), 4326),
              ST_SetSRID(ST_MakePoint((stops->-1->>'longitude')::float8, (stops->-1->>'latitude')::float8), 4326)
            ) < 500 THEN round((stops->((jsonb_array_length(stops) - 1) / 3)->>'latitude')::numeric, 2) END,
            CASE WHEN ST_DistanceSphere(
              ST_SetSRID(ST_MakePoint((stops->0->>'longitude')::float8, (stops->0->>'latitude')::float8), 4326),
              ST_SetSRID(ST_MakePoint((stops->-1->>'longitude')::float8, (stops->-1->>'latitude')::float8), 4326)
            ) < 500 THEN round((stops->((jsonb_array_length(stops) - 1) / 3)->>'longitude')::numeric, 2) END
          ) AS terminal_pattern
        FROM pattern_stops pattern
      ),
      direction_patterns AS (
        SELECT pattern.*,
          ARRAY_AGG(shape_id) OVER (
            PARTITION BY route_id, direction_id, trip_headsign, terminal_pattern
          ) AS shape_ids,
          BOOL_OR(serves_stop) OVER (
            PARTITION BY route_id, direction_id, trip_headsign, terminal_pattern
          ) AS direction_serves_stop,
          ROW_NUMBER() OVER (
            PARTITION BY route_id, direction_id, trip_headsign, terminal_pattern
            ORDER BY jsonb_array_length(stops) DESC, trip_id
          ) AS representative
        FROM anchored_patterns pattern
      )
      SELECT route.*, COALESCE(fares.fares, '[]'::jsonb) AS fares, pattern.direction_id,
        COALESCE(NULLIF(TRIM(pattern.trip_headsign), ''), pattern.stops->-1->>'name') AS destination,
        pattern.shape_ids, pattern.stops, pattern.direction_serves_stop AS serves_stop
      FROM direction_patterns pattern
      INNER JOIN selected_routes route ON route.route_id = pattern.route_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('price', fare.price, 'currency', fare.currency_type)) AS fares
        FROM (
          SELECT DISTINCT attribute.price, attribute.currency_type
          FROM "public"."Gtfs_FareRule" rule
          INNER JOIN "public"."Gtfs_FareAttribute" attribute ON attribute.fare_id = rule.fare_id
          WHERE rule.route_id = route.route_id
        ) fare
      ) fares ON TRUE
      WHERE pattern.representative = 1
        AND (${stopId ?? ''} = '' OR pattern.direction_serves_stop)
      ORDER BY route.route_id, pattern.direction_id, destination
    `;
    }, { maxWait: 2_000, timeout: 10_000 });

    const directions = new Map<string, BusRouteDirection>();
    for (const row of rows) {
      const origin = row.stops[0];
      const destination = row.stops[row.stops.length - 1];
      const via = row.stops[Math.floor((row.stops.length - 1) / 3)];
      if (!origin || !destination || !via) continue;
      const route = mapBusRoute(row);
      const identity = {
        sourceAgency: route.sourceAgency,
        shortName: route.shortName,
        originLatitude: origin.latitude,
        originLongitude: origin.longitude,
        destinationLatitude: destination.latitude,
        destinationLongitude: destination.longitude,
        viaLatitude: via.latitude,
        viaLongitude: via.longitude,
      };
      const favoriteCode = encodeBusDirectionFavorite(identity);
      if (!favoriteCode) continue;
      const catalogKey = `${route.routeId}:${favoriteCode}`;
      const existing = directions.get(catalogKey);
      const shapeIds = [...new Set([...(existing?.shapeIds ?? []), ...row.shape_ids.filter(Boolean)])];
      directions.set(catalogKey, {
        ...route,
        ...identity,
        favoriteCode,
        requestedCode: row.route_id,
        destination: row.destination,
        directionId: row.direction_id ?? 0,
        shapeIds,
      });
    }
    return [...directions.values()];
  }
}
