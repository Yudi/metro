import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BusFare, BusRoute, BusStop } from '../entities/geography.entity';
import { BusRouteRow, BusStopRow, mapBusStop } from './bus-catalog.utils';
import {
  StopServiceInfo,
  buildStopAgencies,
  emptyStopServiceInfo,
  uniqueIds,
} from './query-optimization.utils';
import { QueryOptimizationRouteFacade } from './query-optimization-route.facade';

interface StopServiceRow {
  stop_id: string;
  serves_rail: boolean;
  serves_bus: boolean;
  rail_route_short_names: string[] | null;
  bus_agencies: string[] | null;
}

/**
 * Optimized query service for common catalog operations.
 *
 * Catalog reads use the normalized Gtfs_* views. A source stop is expanded
 * through physical_stop_members before route lookups so either side of a
 * matched SPTrans/Artesp stop sees the combined service.
 */
@Injectable()
export class QueryOptimizationService {
  private readonly routeQueries: QueryOptimizationRouteFacade;

  constructor(private prisma: PrismaService) {
    this.routeQueries = new QueryOptimizationRouteFacade(this.prisma);
  }

  async batchCheckSubwayStations(stopIds: string[]): Promise<Set<string>> {
    const serviceInfo = await this.batchGetStopServiceInfo(stopIds);
    return new Set(
      Array.from(serviceInfo.entries())
        .filter(([, info]) => info.servesRail)
        .map(([stopId]) => stopId),
    );
  }

  async batchGetStopAgencies(
    stopIds: string[],
  ): Promise<Map<string, string[]>> {
    const serviceInfo = await this.batchGetStopServiceInfo(stopIds);
    return new Map(
      Array.from(serviceInfo.entries()).map(([stopId, info]) => [
        stopId,
        info.agencies,
      ]),
    );
  }

  async batchGetStopServiceInfo(
    stopIds: string[],
  ): Promise<Map<string, StopServiceInfo>> {
    const uniqueStopIds = uniqueIds(stopIds);
    if (uniqueStopIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<StopServiceRow[]>`
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
      ),
      summary_rows AS (
        SELECT DISTINCT
          expanded.requested_stop_id,
          summary.serves_rail,
          summary.serves_bus,
          summary.rail_route_short_names,
          summary.bus_agencies
        FROM expanded_stops expanded
        INNER JOIN "public"."gtfs_stop_service_summary" summary
          ON summary.stop_id = expanded.source_stop_id
      ),
      flags AS (
        SELECT
          requested_stop_id AS stop_id,
          BOOL_OR(serves_rail) AS serves_rail,
          BOOL_OR(serves_bus) AS serves_bus
        FROM summary_rows
        GROUP BY requested_stop_id
      ),
      rail_names AS (
        SELECT DISTINCT
          summary.requested_stop_id AS stop_id,
          route_name
        FROM summary_rows summary
        CROSS JOIN LATERAL unnest(
          COALESCE(summary.rail_route_short_names, ARRAY[]::TEXT[])
        ) AS route_name(route_name)
      ),
      bus_names AS (
        SELECT DISTINCT
          summary.requested_stop_id AS stop_id,
          LOWER(agency_name) AS agency_name
        FROM summary_rows summary
        CROSS JOIN LATERAL unnest(
          COALESCE(summary.bus_agencies, ARRAY[]::TEXT[])
        ) AS agency_name(agency_name)
      )
      SELECT
        requested.requested_stop_id AS stop_id,
        COALESCE(flags.serves_rail, FALSE) AS serves_rail,
        COALESCE(flags.serves_bus, FALSE) AS serves_bus,
        COALESCE(
          (
            SELECT ARRAY_AGG(rail_name.route_name ORDER BY rail_name.route_name)
            FROM rail_names rail_name
            WHERE rail_name.stop_id = requested.requested_stop_id
          ),
          ARRAY[]::TEXT[]
        ) AS rail_route_short_names,
        COALESCE(
          (
            SELECT ARRAY_AGG(bus_name.agency_name ORDER BY bus_name.agency_name)
            FROM bus_names bus_name
            WHERE bus_name.stop_id = requested.requested_stop_id
          ),
          ARRAY[]::TEXT[]
        ) AS bus_agencies
      FROM requested_stops requested
      LEFT JOIN flags ON flags.stop_id = requested.requested_stop_id
    `;

    const result = new Map<string, StopServiceInfo>();
    for (const stopId of uniqueStopIds) {
      result.set(stopId, emptyStopServiceInfo());
    }

    for (const row of rows) {
      const railRouteShortNames = row.rail_route_short_names ?? [];
      const busAgencies = row.bus_agencies ?? [];
      result.set(row.stop_id, {
        servesRail: Boolean(row.serves_rail),
        servesBus: Boolean(row.serves_bus),
        agencies: buildStopAgencies(railRouteShortNames, busAgencies),
        railRouteShortNames,
      });
    }

    return result;
  }

  /** Find a route by its exact normalized route_id. */
  async findRouteByMultipleCriteria(
    routeId: string,
  ): Promise<BusRouteRow | null> {
    const routes = await this.prisma.$queryRaw<BusRouteRow[]>`
      SELECT
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
      WHERE route.route_id = ${routeId}
      LIMIT 1
    `;

    return routes[0] ?? null;
  }

  /**
   * Find a canonical representative for a source stop and include all of its
   * matched source IDs. SPTrans is selected first when a group has both feeds.
   */
  async findStopByMultipleCriteria(stopId: string): Promise<BusStopRow | null> {
    const stops = await this.prisma.$queryRaw<BusStopRow[]>`
      WITH resolved_stops AS (
        SELECT COALESCE(member.physical_stop_id, ${stopId}) AS physical_stop_id
        FROM "public"."physical_stop_members" member
        WHERE member.source_stop_id = ${stopId}
        UNION ALL
        SELECT ${stopId}
        WHERE NOT EXISTS (
          SELECT 1
          FROM "public"."physical_stop_members" member
          WHERE member.source_stop_id = ${stopId}
        )
      ),
      group_stops AS (
        SELECT DISTINCT resolved.physical_stop_id, stop.*
        FROM resolved_stops resolved
        INNER JOIN "public"."Gtfs_Stop" stop
          ON stop.stop_id = resolved.physical_stop_id
        UNION ALL
        SELECT DISTINCT resolved.physical_stop_id, stop.*
        FROM resolved_stops resolved
        INNER JOIN "public"."physical_stop_members" member
          ON member.physical_stop_id = resolved.physical_stop_id
        INNER JOIN "public"."Gtfs_Stop" stop
          ON stop.stop_id = member.source_stop_id
      ),
      grouped AS (
        SELECT
          physical_stop_id,
          ARRAY_AGG(DISTINCT stop_id ORDER BY stop_id) AS merged_stop_ids
        FROM group_stops
        GROUP BY physical_stop_id
      )
      SELECT DISTINCT ON (group_stops.physical_stop_id)
        group_stops.id,
        group_stops.stop_id,
        group_stops.stop_name,
        group_stops.stop_desc,
        group_stops.stop_lat,
        group_stops.stop_lon,
        group_stops.source_agency,
        group_stops.source_id,
        group_stops.platform_code,
        group_stops.physical_stop_id,
        grouped.merged_stop_ids
      FROM group_stops
      INNER JOIN grouped
        ON grouped.physical_stop_id = group_stops.physical_stop_id
      ORDER BY
        group_stops.physical_stop_id,
        CASE WHEN LOWER(COALESCE(group_stops.source_agency, '')) = 'sptrans' THEN 0 ELSE 1 END,
        group_stops.stop_id
      LIMIT 1
    `;

    return stops[0] ?? null;
  }

  async getRouteShapesOptimized(
    routeId: string,
  ): Promise<Array<{ shape_id: string; coordinates: number[][] }>> {
    const result = await this.prisma.$queryRaw<
      Array<{ shape_id: string; coordinates: string }>
    >`
      SELECT DISTINCT ON (trip.shape_id)
        trip.shape_id,
        ST_AsGeoJSON(shape.geom)::text AS coordinates
      FROM "public"."Gtfs_Trip" trip
      INNER JOIN "public"."Gtfs_Shape" shape
        ON trip.shape_id = shape.shape_id
      WHERE trip.route_id = ${routeId}
        AND trip.shape_id IS NOT NULL
        AND trip.shape_id <> ''
        AND shape.geom IS NOT NULL
      ORDER BY trip.shape_id
    `;

    return result.flatMap((row) => {
      if (!row.coordinates) return [];
      const parsed = JSON.parse(row.coordinates) as {
        coordinates?: number[][];
      };
      return parsed.coordinates
        ? [{ shape_id: row.shape_id, coordinates: parsed.coordinates }]
        : [];
    });
  }

  /** Get canonical stop representatives used by a route's stop list. */
  async getStopsForRouteOptimized(routeId: string): Promise<BusStopRow[]> {
    return this.prisma.$queryRaw<BusStopRow[]>`
      WITH route_physical_stops AS (
        SELECT DISTINCT
          COALESCE(member.physical_stop_id, stop.stop_id) AS physical_stop_id
        FROM "public"."Gtfs_Stop" stop
        INNER JOIN "public"."Gtfs_StopTime" stop_time
          ON stop.stop_id = stop_time.stop_id
        INNER JOIN "public"."Gtfs_Trip" trip
          ON trip.trip_id = stop_time.trip_id
        LEFT JOIN "public"."physical_stop_members" member
          ON member.source_stop_id = stop.stop_id
        WHERE trip.route_id = ${routeId}
      ),
      route_stops AS (
        SELECT DISTINCT
          physical.physical_stop_id,
          stop.*
        FROM route_physical_stops physical
        INNER JOIN "public"."Gtfs_Stop" stop
          ON stop.stop_id = physical.physical_stop_id
        UNION ALL
        SELECT DISTINCT
          physical.physical_stop_id,
          stop.*
        FROM route_physical_stops physical
        INNER JOIN "public"."physical_stop_members" member
          ON member.physical_stop_id = physical.physical_stop_id
        INNER JOIN "public"."Gtfs_Stop" stop
          ON stop.stop_id = member.source_stop_id
      ),
      grouped AS (
        SELECT
          physical_stop_id,
          ARRAY_AGG(DISTINCT stop_id ORDER BY stop_id) AS merged_stop_ids
        FROM route_stops
        GROUP BY physical_stop_id
      )
      SELECT DISTINCT ON (route_stops.physical_stop_id)
        route_stops.id,
        route_stops.stop_id,
        route_stops.stop_name,
        route_stops.stop_desc,
        route_stops.stop_lat,
        route_stops.stop_lon,
        route_stops.source_agency,
        route_stops.source_id,
        route_stops.platform_code,
        route_stops.physical_stop_id,
        grouped.merged_stop_ids
      FROM route_stops
      INNER JOIN grouped USING (physical_stop_id)
      ORDER BY
        route_stops.physical_stop_id,
        CASE WHEN LOWER(COALESCE(route_stops.source_agency, '')) = 'sptrans' THEN 0 ELSE 1 END,
        route_stops.stop_id
    `;
  }

  /** Get all routes serving one source or matched physical stop group. */
  async getRoutesForStopOptimized(stopId: string): Promise<BusRoute[]> {
    const routes = await this.routeQueries.getRoutesForMultipleStops([stopId]);
    return routes.get(stopId) ?? [];
  }

  async getRoutesForMultipleStops(
    stopIds: string[],
  ): Promise<Map<string, BusRoute[]>> {
    return this.routeQueries.getRoutesForMultipleStops(stopIds);
  }

  async getRoutesById(routeIds: string[]): Promise<BusRoute[]> {
    return this.routeQueries.getRoutesById(routeIds);
  }

  async getStopsById(stopIds: string[]): Promise<BusStop[]> {
    const uniqueStopIds = uniqueIds(stopIds);
    if (uniqueStopIds.length === 0) {
      return [];
    }

    const stops = await this.prisma.$queryRaw<
      Array<BusStopRow & { requested_stop_id: string }>
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
          resolved.physical_stop_id,
          COALESCE(member.source_stop_id, resolved.physical_stop_id) AS source_stop_id
        FROM resolved_stops resolved
        LEFT JOIN "public"."physical_stop_members" member
          ON member.physical_stop_id = resolved.physical_stop_id
      ),
      group_stops AS (
        SELECT DISTINCT expanded.requested_stop_id, expanded.physical_stop_id, stop.*
        FROM expanded_stops expanded
        INNER JOIN "public"."Gtfs_Stop" stop
          ON stop.stop_id = expanded.source_stop_id
      ),
      grouped AS (
        SELECT
          requested_stop_id,
          physical_stop_id,
          ARRAY_AGG(DISTINCT stop_id ORDER BY stop_id) AS merged_stop_ids
        FROM group_stops
        GROUP BY requested_stop_id, physical_stop_id
      )
      SELECT DISTINCT ON (group_stops.physical_stop_id)
        group_stops.requested_stop_id,
        group_stops.id,
        group_stops.stop_id,
        group_stops.stop_name,
        group_stops.stop_desc,
        group_stops.stop_lat,
        group_stops.stop_lon,
        group_stops.source_agency,
        group_stops.source_id,
        group_stops.platform_code,
        group_stops.physical_stop_id,
        grouped.merged_stop_ids
      FROM group_stops
      INNER JOIN grouped
        ON grouped.requested_stop_id = group_stops.requested_stop_id
        AND grouped.physical_stop_id = group_stops.physical_stop_id
      ORDER BY
        group_stops.physical_stop_id,
        CASE WHEN LOWER(COALESCE(group_stops.source_agency, '')) = 'sptrans' THEN 0 ELSE 1 END,
        group_stops.stop_id
    `;

    const serviceInfo = await this.batchGetStopServiceInfo(
      stops.map((stop) => stop.physical_stop_id || stop.stop_id),
    );

    return stops.map((stop) =>
      mapBusStop(stop, serviceInfo.get(stop.physical_stop_id || stop.stop_id)),
    );
  }

  async getBatchRoutesForStops(
    stopIds: string[],
  ): Promise<Map<string, string[]>> {
    return this.routeQueries.getBatchRoutesForStops(stopIds);
  }

  /** Batch fare lookup for search results and other lightweight consumers. */
  async getFaresByRouteIds(
    routeIds: string[],
  ): Promise<Map<string, BusFare[]>> {
    return this.routeQueries.getFaresByRouteIds(routeIds);
  }
}
