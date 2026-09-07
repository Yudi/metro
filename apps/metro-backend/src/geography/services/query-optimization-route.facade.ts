import { PrismaService } from '../../prisma/prisma.service';
import { BusFare, BusRoute } from '../entities/geography.entity';
import { BusRouteRow, mapBusRoute, parseBusFares } from './bus-catalog.utils';
import { compareBusRoutes, uniqueIds } from './query-optimization.utils';

/** Query facade for route-centric catalog reads and fare projections. */
export class QueryOptimizationRouteFacade {
  constructor(private readonly prisma: PrismaService) {}

  async getRoutesForMultipleStops(
    stopIds: string[],
  ): Promise<Map<string, BusRoute[]>> {
    const uniqueStopIds = uniqueIds(stopIds);
    if (uniqueStopIds.length === 0) {
      return new Map();
    }

    const routes = await this.prisma.$queryRaw<
      Array<BusRouteRow & { requested_stop_id: string }>
    >`
      WITH requested_stops AS (
        SELECT requested_stop_id
        FROM unnest(${uniqueStopIds}::TEXT[]) AS requested_stop_id
      ),
      resolved_stops AS (
        SELECT
          requested.requested_stop_id,
          COALESCE(member.physical_stop_id, requested.requested_stop_id) AS physical_stop_id
        FROM requested_stops requested
        LEFT JOIN "public"."physical_stop_members" member
          ON member.source_stop_id = requested.requested_stop_id
      ),
      expanded_stops AS (
        SELECT DISTINCT
          resolved.requested_stop_id,
          COALESCE(member.source_stop_id, resolved.physical_stop_id) AS source_stop_id
        FROM resolved_stops resolved
        LEFT JOIN "public"."physical_stop_members" member
          ON member.physical_stop_id = resolved.physical_stop_id
      )
      SELECT DISTINCT ON (expanded.requested_stop_id, route.route_id)
        expanded.requested_stop_id,
        route.id,
        route.route_id,
        route.agency_id,
        route.route_short_name,
        route.route_long_name,
        route.route_type,
        route.route_color,
        route.route_text_color,
        route.source_agency,
        route.source_id,
        COALESCE(fares.fares, '[]'::jsonb) AS fares
      FROM expanded_stops expanded
      INNER JOIN "public"."Gtfs_StopTime" stop_time
        ON stop_time.stop_id = expanded.source_stop_id
      INNER JOIN "public"."Gtfs_Trip" trip
        ON trip.trip_id = stop_time.trip_id
      INNER JOIN "public"."Gtfs_Route" route
        ON route.route_id = trip.route_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object('price', fare.price, 'currency', fare.currency_type)
          ORDER BY fare.price, fare.currency_type
        ) AS fares
        FROM (
          SELECT DISTINCT attribute.price, attribute.currency_type
          FROM "public"."Gtfs_FareRule" rule
          INNER JOIN "public"."Gtfs_FareAttribute" attribute
            ON attribute.fare_id = rule.fare_id
          WHERE rule.route_id = route.route_id
        ) fare
      ) fares ON TRUE
      ORDER BY
        expanded.requested_stop_id,
        route.route_id,
        CASE WHEN LOWER(COALESCE(route.source_agency, '')) = 'sptrans' THEN 0 ELSE 1 END
    `;

    const result = new Map<string, BusRoute[]>();
    for (const stopId of uniqueStopIds) {
      result.set(stopId, []);
    }
    for (const row of routes) {
      result.get(row.requested_stop_id)?.push(mapBusRoute(row));
    }
    for (const routesForStop of result.values()) {
      routesForStop.sort(compareBusRoutes);
    }
    return result;
  }

  async getRoutesById(routeIds: string[]): Promise<BusRoute[]> {
    const uniqueRouteIds = uniqueIds(routeIds);
    if (uniqueRouteIds.length === 0) {
      return [];
    }

    const routes = await this.prisma.$queryRaw<
      Array<BusRouteRow & { coordinates: number[][] | null }>
    >`
      SELECT DISTINCT ON (route.route_id)
        route.id,
        route.route_id,
        route.agency_id,
        route.route_short_name,
        route.route_long_name,
        route.route_type,
        route.route_color,
        route.route_text_color,
        route.source_agency,
        route.source_id,
        COALESCE(fares.fares, '[]'::jsonb) AS fares,
        trip.shape_id,
        ST_AsGeoJSON(shape.geom)::json->'coordinates' AS coordinates
      FROM "public"."Gtfs_Route" route
      LEFT JOIN "public"."Gtfs_Trip" trip
        ON trip.route_id = route.route_id
      LEFT JOIN "public"."Gtfs_Shape" shape
        ON shape.shape_id = trip.shape_id
        AND shape.geom IS NOT NULL
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object('price', fare.price, 'currency', fare.currency_type)
          ORDER BY fare.price, fare.currency_type
        ) AS fares
        FROM (
          SELECT DISTINCT attribute.price, attribute.currency_type
          FROM "public"."Gtfs_FareRule" rule
          INNER JOIN "public"."Gtfs_FareAttribute" attribute
            ON attribute.fare_id = rule.fare_id
          WHERE rule.route_id = route.route_id
        ) fare
      ) fares ON TRUE
      WHERE route.route_id = ANY(${uniqueRouteIds}::TEXT[])
      ORDER BY route.route_id, trip.shape_id
    `;

    return routes.map((route) => mapBusRoute(route));
  }

  async getBatchRoutesForStops(
    stopIds: string[],
  ): Promise<Map<string, string[]>> {
    const uniqueStopIds = uniqueIds(stopIds);
    if (uniqueStopIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ requested_stop_id: string; route_short_name: string }>
    >`
      WITH requested_stops AS (
        SELECT requested_stop_id
        FROM unnest(${uniqueStopIds}::TEXT[]) AS requested_stop_id
      ),
      resolved_stops AS (
        SELECT
          requested.requested_stop_id,
          COALESCE(member.physical_stop_id, requested.requested_stop_id) AS physical_stop_id
        FROM requested_stops requested
        LEFT JOIN "public"."physical_stop_members" member
          ON member.source_stop_id = requested.requested_stop_id
      ),
      expanded_stops AS (
        SELECT DISTINCT
          resolved.requested_stop_id,
          COALESCE(member.source_stop_id, resolved.physical_stop_id) AS source_stop_id
        FROM resolved_stops resolved
        LEFT JOIN "public"."physical_stop_members" member
          ON member.physical_stop_id = resolved.physical_stop_id
      )
      SELECT DISTINCT expanded.requested_stop_id, route.route_short_name
      FROM expanded_stops expanded
      INNER JOIN "public"."Gtfs_StopTime" stop_time
        ON stop_time.stop_id = expanded.source_stop_id
      INNER JOIN "public"."Gtfs_Trip" trip
        ON trip.trip_id = stop_time.trip_id
      INNER JOIN "public"."Gtfs_Route" route
        ON route.route_id = trip.route_id
      ORDER BY expanded.requested_stop_id, route.route_short_name
    `;

    const result = new Map<string, string[]>();
    for (const stopId of uniqueStopIds) {
      result.set(stopId, []);
    }
    for (const row of rows) {
      result.get(row.requested_stop_id)?.push(row.route_short_name);
    }
    return result;
  }

  async getFaresByRouteIds(
    routeIds: string[],
  ): Promise<Map<string, BusFare[]>> {
    const uniqueRouteIds = uniqueIds(routeIds);
    if (uniqueRouteIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ route_id: string; fares: unknown }>
    >`
      SELECT
        route.route_id,
        COALESCE(fares.fares, '[]'::jsonb) AS fares
      FROM "public"."Gtfs_Route" route
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object('price', fare.price, 'currency', fare.currency_type)
          ORDER BY fare.price, fare.currency_type
        ) AS fares
        FROM (
          SELECT DISTINCT attribute.price, attribute.currency_type
          FROM "public"."Gtfs_FareRule" rule
          INNER JOIN "public"."Gtfs_FareAttribute" attribute
            ON attribute.fare_id = rule.fare_id
          WHERE rule.route_id = route.route_id
        ) fare
      ) fares ON TRUE
      WHERE route.route_id = ANY(${uniqueRouteIds}::TEXT[])
    `;

    return new Map(rows.map((row) => [row.route_id, parseBusFares(row.fares)]));
  }
}
