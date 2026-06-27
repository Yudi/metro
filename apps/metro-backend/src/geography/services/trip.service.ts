import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BusStop, BusRoute, Trip } from '../entities/geography.entity';
import { BusStopService } from './bus-stop.service';
import { SubwayStationService } from './subway-station.service';
import { shouldMergeStations } from '@metro/shared/utils';

interface GtfsRouteRow {
  id: number;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
}

interface GtfsTripRow {
  id: number;
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign: string;
  direction_id: number;
  shape_id: string;
}

interface GtfsStopRow {
  id: number;
  stop_id: string;
  stop_name: string;
  stop_desc: string | null;
  stop_lat: number;
  stop_lon: number;
}

@Injectable()
export class TripService {
  private readonly logger = new Logger(TripService.name);

  constructor(
    private prisma: PrismaService,
    private busStopService: BusStopService,
    private subwayStationService: SubwayStationService
  ) {}

  async getTripsForRoute(routeId: string): Promise<Trip[]> {
    this.logger.debug(`getTripsForRoute called with routeId="${routeId}"`);
    const route = await this.findRouteByRouteId(routeId);

    if (!route) {
      this.logger.debug(`No route found for "${routeId}"`);
      return [];
    }

    this.logger.debug(
      `Using route ${route.route_id} (${route.route_short_name}) for trips`
    );

    const trips = await this.prisma.$queryRaw<GtfsTripRow[]>`
      SELECT id, route_id, service_id, trip_id, trip_headsign, direction_id, shape_id
      FROM "SPTrans_Trip"
      WHERE route_id = ${route.route_id}
      LIMIT 20
    `;

    this.logger.debug(
      `Found ${trips.length} trips with shapes: ${trips
        .map((t) => t.shape_id)
        .join(', ')}`
    );

    return trips.map((trip) => ({
      id: trip.trip_id,
      routeId: trip.route_id,
      serviceId: trip.service_id,
      tripId: trip.trip_id,
      tripHeadsign: trip.trip_headsign,
      directionId: trip.direction_id,
      shapeId: trip.shape_id,
    }));
  }

  async getStopsForRoute(routeId: string): Promise<BusStop[]> {
    const route = await this.findRouteByRouteId(routeId);

    if (!route) {
      return [];
    }

    // Get all trips for this route
    const trips = await this.prisma.$queryRaw<Array<{ trip_id: string }>>`
      SELECT trip_id
      FROM "SPTrans_Trip"
      WHERE route_id = ${route.route_id}
    `;

    if (trips.length === 0) {
      return [];
    }

    const tripIds = trips.map((trip) => trip.trip_id);

    // Get all stop_times for these trips
    const stopTimes = await this.prisma.$queryRaw<Array<{ stop_id: string }>>`
      SELECT DISTINCT stop_id
      FROM "SPTrans_StopTime"
      WHERE trip_id = ANY(${tripIds}::text[])
    `;

    if (stopTimes.length === 0) {
      return [];
    }

    const stopIds = stopTimes.map((st) => st.stop_id);

    // Get the actual stop data
    const stops = await this.prisma.$queryRaw<GtfsStopRow[]>`
      SELECT id, stop_id, stop_name, stop_desc, stop_lat, stop_lon
      FROM "SPTrans_Stop"
      WHERE stop_id = ANY(${stopIds}::text[])
    `;

    // Batch check which stops are subway stations for efficiency
    const stopIdList = stops.map((s) => s.stop_id);
    const subwayStopIds = await this.busStopService.batchCheckSubwayStations(
      stopIdList
    );
    const stopAgencies = await this.busStopService.batchGetStopAgencies(
      stopIdList
    );

    return stops.map((stop) => ({
      id: stop.stop_id,
      stopId: stop.stop_id,
      name: stop.stop_name,
      description: stop.stop_desc || undefined,
      latitude: stop.stop_lat,
      longitude: stop.stop_lon,
      isSubwayStation: subwayStopIds.has(stop.stop_id),
      agencies: stopAgencies.get(stop.stop_id),
    }));
  }

  async getRoutesForStop(stopId: string): Promise<BusRoute[]> {
    // Get the stop data first to check if it's a subway station
    const mainStop = await this.busStopService.getBusStop(stopId);

    if (!mainStop) {
      return [];
    }

    let stopIdsToCheck: string[];

    if (mainStop.isSubwayStation) {
      // For subway stations, find all stops with similar names that ALSO serve subway routes
      // Get all subway stations first
      const allSubwayStops = await this.prisma.$queryRaw<
        Array<{ stop_id: string; stop_name: string }>
      >`
        SELECT DISTINCT s.stop_id, s.stop_name
        FROM "SPTrans_Stop" s
        INNER JOIN "SPTrans_StopTime" st ON s.stop_id = st.stop_id
        INNER JOIN "SPTrans_Trip" t ON st.trip_id = t.trip_id
        INNER JOIN "SPTrans_Route" r ON t.route_id = r.route_id
        WHERE (r.route_id LIKE 'METRÔ%' OR r.route_id LIKE 'CPTM%')
      `;

      // Filter using flexible matching logic from shared utility
      const matchingStops = allSubwayStops.filter((stop) =>
        shouldMergeStations(mainStop.name, stop.stop_name)
      );

      stopIdsToCheck = matchingStops.map((s) => s.stop_id);

      this.logger.debug(
        `getRoutesForStop("${stopId}") - subway station "${
          mainStop.name
        }", found ${
          stopIdsToCheck.length
        } matching subway stations: ${matchingStops
          .map((s) => s.stop_name)
          .join(', ')}`
      );
    } else {
      // For regular bus stops, only check the specific stop (no merging)
      stopIdsToCheck = [stopId];
      this.logger.debug(
        `getRoutesForStop("${stopId}") - bus stop, checking single stop only`
      );
    }

    // Get all stop_times for the determined stops
    const stopTimes = await this.prisma.$queryRaw<Array<{ trip_id: string }>>`
      SELECT DISTINCT trip_id
      FROM "SPTrans_StopTime"
      WHERE stop_id = ANY(${stopIdsToCheck}::text[])
    `;

    if (stopTimes.length === 0) {
      return [];
    }

    const tripIds = stopTimes.map((st) => st.trip_id);

    // Get all trips for these stop_times
    const trips = await this.prisma.$queryRaw<Array<{ route_id: string }>>`
      SELECT DISTINCT route_id
      FROM "SPTrans_Trip"
      WHERE trip_id = ANY(${tripIds}::text[])
    `;

    if (trips.length === 0) {
      return [];
    }

    const routeIds = trips.map((trip) => trip.route_id);

    // Get the actual route data
    const routes = await this.prisma.$queryRaw<GtfsRouteRow[]>`
      SELECT id, route_id, route_short_name, route_long_name, route_type, route_color, route_text_color
      FROM "SPTrans_Route"
      WHERE route_id = ANY(${routeIds}::text[])
    `;

    this.logger.debug(
      `Found ${routes.length} routes for stop "${stopId}": ${routes
        .map((r) => r.route_short_name)
        .join(', ')}`
    );

    return routes.map((route) => ({
      id: route.route_id,
      routeId: route.route_id,
      shortName: route.route_short_name,
      longName: route.route_long_name,
      routeType: route.route_type,
      color: route.route_color,
      textColor: route.route_text_color,
    }));
  }

  private async findRouteByRouteId(
    routeId: string,
  ): Promise<GtfsRouteRow | undefined> {
    const routes = await this.prisma.$queryRaw<GtfsRouteRow[]>`
      SELECT id, route_id, route_short_name, route_long_name, route_type, route_color, route_text_color
      FROM "SPTrans_Route"
      WHERE route_id = ${routeId}
      LIMIT 1
    `;
    return routes[0];
  }

}
