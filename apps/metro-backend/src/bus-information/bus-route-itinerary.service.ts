import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  mapBusRoute,
  normalizeBusSourceAgency,
} from '../geography/services/bus-catalog.utils';
import {
  BusRouteItinerary,
  BusRouteItineraryFrequencyWindow,
  BusRouteItineraryPattern,
  BusRouteItineraryRoute,
  BusRouteItineraryStop,
  ItineraryFrequencyRow,
  ItineraryRouteRow,
  ItineraryStopRow,
  ItineraryTripPatternRow,
} from './bus-route-itinerary.entity';

const MAX_ROUTE_ID_LENGTH = 128;
const MAX_ACTIVE_TRIPS = 20_000;
const MAX_PATTERNS = 200;
const MAX_STOPS_PER_PATTERN = 500;
const MAX_FREQUENCY_ROWS = 40_000;

export function validateItineraryRouteId(routeId: string): string {
  if (
    [...routeId].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new BadRequestException('Invalid routeId');
  }
  const value = routeId.trim();
  if (!value || value.length > MAX_ROUTE_ID_LENGTH) {
    throw new BadRequestException('Invalid routeId');
  }
  return value;
}

export function validateItineraryServiceDate(serviceDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(serviceDate.trim());
  if (!match) {
    throw new BadRequestException('serviceDate must use YYYY-MM-DD format');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException('serviceDate is not a valid calendar date');
  }

  return serviceDate.trim();
}

interface PatternGroup {
  representative: ItineraryTripPatternRow;
  trips: ItineraryTripPatternRow[];
}

interface ItineraryStopMap {
  [tripId: string]: ItineraryStopRow[];
}

@Injectable()
export class BusRouteItineraryService {
  constructor(private readonly prisma: PrismaService) {}

  async getItinerary(
    routeId: string,
    serviceDate: string,
  ): Promise<BusRouteItinerary> {
    const normalizedRouteId = validateItineraryRouteId(routeId);
    const normalizedDate = validateItineraryServiceDate(serviceDate);
    const date = normalizedDate.replace(/-/g, '');
    const weekday = new Date(`${normalizedDate}T12:00:00Z`).getUTCDay();

    let routeRow: ItineraryRouteRow | undefined;
    try {
      const routes = await this.prisma.$queryRaw<ItineraryRouteRow[]>`
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
          COALESCE(fares.fares, '[]'::jsonb) AS fares,
          agency.source_id AS operator_id,
          agency.agency_name AS operator_name,
          agency.agency_url AS operator_url,
          agency.agency_phone AS operator_phone
        FROM public."Gtfs_Route" route
        LEFT JOIN public."Gtfs_Agency" agency
          ON agency.agency_id = route.agency_id
          AND agency.source_agency = route.source_agency
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object('price', fare.price, 'currency', fare.currency_type)
            ORDER BY fare.price, fare.currency_type
          ) AS fares
          FROM (
            SELECT DISTINCT attribute.price, attribute.currency_type
            FROM public."Gtfs_FareRule" rule
            INNER JOIN public."Gtfs_FareAttribute" attribute
              ON attribute.fare_id = rule.fare_id
              AND attribute.source_agency = rule.source_agency
            WHERE rule.route_id = route.route_id
              AND rule.source_agency = route.source_agency
          ) fare
        ) fares ON TRUE
        WHERE route.route_id = ${normalizedRouteId}
        LIMIT 1
      `;
      routeRow = routes[0];
    } catch {
      return this.unavailable(normalizedDate);
    }

    if (!routeRow) {
      return {
        status: 'NOT_FOUND',
        serviceDate: normalizedDate,
        operatorName: null,
        route: null,
        patterns: [],
      };
    }

    const route = this.mapRoute(routeRow);
    const sourceAgency = normalizeBusSourceAgency(routeRow.source_agency);

    try {
      const trips = await this.getActiveTripPatterns(
        normalizedRouteId,
        sourceAgency,
        date,
        weekday,
      );
      if (trips.length > MAX_ACTIVE_TRIPS) {
        throw new Error('Active itinerary trip budget reached');
      }

      if (trips.length === 0) {
        return {
          status: 'AVAILABLE',
          serviceDate: normalizedDate,
          operatorName: routeRow.operator_name,
          route,
          patterns: [],
        };
      }

      const groups = this.groupPatterns(trips);
      if (groups.length > MAX_PATTERNS) {
        throw new Error('Itinerary pattern budget reached');
      }

      const representativeTripIds = groups.map(
        (group) => group.representative.tripId,
      );
      const stops = await this.getRepresentativeStops(
        representativeTripIds,
        sourceAgency,
      );
      const frequencies = await this.getFrequencies(
        trips.map((trip) => trip.tripId),
        sourceAgency,
      );

      return {
        status: 'AVAILABLE',
        serviceDate: normalizedDate,
        operatorName: routeRow.operator_name,
        route,
        patterns: this.buildPatterns(groups, stops, frequencies),
      };
    } catch {
      return {
        status: 'UNAVAILABLE',
        serviceDate: normalizedDate,
        operatorName: routeRow.operator_name,
        route,
        patterns: [],
      };
    }
  }

  private async getActiveTripPatterns(
    routeId: string,
    sourceAgency: 'sptrans' | 'artesp',
    date: string,
    weekday: number,
  ): Promise<ItineraryTripPatternRow[]> {
    return this.prisma.$queryRaw<ItineraryTripPatternRow[]>`
      WITH active_trips AS (
        SELECT DISTINCT
          t.trip_id,
          t.service_id,
          t.trip_headsign,
          t.direction_id,
          t.shape_id
        FROM public."Gtfs_Trip" t
        INNER JOIN public."Gtfs_Route" r
          ON r.route_id = t.route_id
          AND r.source_agency = t.source_agency
        LEFT JOIN public."Gtfs_Calendar" c
          ON c.service_id = t.service_id
          AND c.source_agency = t.source_agency
        WHERE t.route_id = ${routeId}
          AND t.source_agency = ${sourceAgency}
          AND NOT EXISTS (
            SELECT 1
            FROM public."Gtfs_CalendarDate" removed
            WHERE removed.service_id = t.service_id
              AND removed.source_agency = t.source_agency
              AND removed.date = ${date}
              AND removed.exception_type = 2
          )
          AND (
            EXISTS (
              SELECT 1
              FROM public."Gtfs_CalendarDate" added
              WHERE added.service_id = t.service_id
                AND added.source_agency = t.source_agency
                AND added.date = ${date}
                AND added.exception_type = 1
            )
            OR (
              c.service_id IS NOT NULL
              AND c.start_date <= ${date}
              AND c.end_date >= ${date}
              AND (ARRAY[c.sunday, c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday])[${weekday + 1}] = 1
            )
          )
      )
      SELECT
        active.trip_id AS "tripId",
        active.service_id AS "serviceId",
        active.trip_headsign AS headsign,
        active.direction_id AS "directionId",
        active.shape_id AS "shapeId",
        ARRAY_AGG(stop_time.stop_id ORDER BY stop_time.stop_sequence, stop_time.stop_id) AS "stopIds",
        ARRAY_AGG(stop_time.stop_sequence ORDER BY stop_time.stop_sequence, stop_time.stop_id) AS "stopSequences",
        (ARRAY_AGG(stop_time.departure_time ORDER BY stop_time.stop_sequence, stop_time.stop_id))[1] AS "firstDeparture",
        (ARRAY_AGG(stop_time.arrival_time ORDER BY stop_time.stop_sequence DESC, stop_time.stop_id DESC))[1] AS "lastArrival"
      FROM active_trips active
      INNER JOIN public."Gtfs_StopTime" stop_time
        ON stop_time.trip_id = active.trip_id
        AND stop_time.source_agency = ${sourceAgency}
      GROUP BY
        active.trip_id,
        active.service_id,
        active.trip_headsign,
        active.direction_id,
        active.shape_id
      ORDER BY active.trip_id
      LIMIT ${MAX_ACTIVE_TRIPS + 1}
    `;
  }

  private async getRepresentativeStops(
    tripIds: string[],
    sourceAgency: 'sptrans' | 'artesp',
  ): Promise<ItineraryStopMap> {
    const rows = await this.prisma.$queryRaw<ItineraryStopRow[]>`
      SELECT
        stop_time.trip_id AS "tripId",
        stop_time.stop_id AS id,
        stop.stop_name AS name,
        stop.stop_desc AS description,
        stop.platform_code AS "platformCode",
        stop_time.stop_sequence AS sequence,
        stop.stop_lat AS latitude,
        stop.stop_lon AS longitude,
        stop_time.arrival_time AS "arrivalTime",
        stop_time.departure_time AS "departureTime"
      FROM public."Gtfs_StopTime" stop_time
      INNER JOIN public."Gtfs_Stop" stop
        ON stop.stop_id = stop_time.stop_id
        AND stop.source_agency = ${sourceAgency}
      WHERE stop_time.trip_id = ANY(${tripIds}::TEXT[])
        AND stop_time.source_agency = ${sourceAgency}
      ORDER BY stop_time.trip_id, stop_time.stop_sequence, stop_time.stop_id
      LIMIT ${MAX_PATTERNS * MAX_STOPS_PER_PATTERN + 1}
    `;

    if (rows.length > MAX_PATTERNS * MAX_STOPS_PER_PATTERN) {
      throw new Error('Itinerary stop budget reached');
    }

    const result: ItineraryStopMap = {};
    for (const row of rows) {
      if (!result[row.tripId]) result[row.tripId] = [];
      result[row.tripId].push(row);
    }
    return result;
  }

  private async getFrequencies(
    tripIds: string[],
    sourceAgency: 'sptrans' | 'artesp',
  ): Promise<Map<string, ItineraryFrequencyRow[]>> {
    const rows = await this.prisma.$queryRaw<ItineraryFrequencyRow[]>`
      SELECT
        frequency.trip_id AS "tripId",
        frequency.start_time AS "startTime",
        frequency.end_time AS "endTime",
        frequency.headway_secs AS "headwaySeconds"
      FROM public."Gtfs_Frequency" frequency
      WHERE frequency.trip_id = ANY(${tripIds}::TEXT[])
        AND frequency.source_agency = ${sourceAgency}
      ORDER BY frequency.trip_id, frequency.start_time, frequency.end_time, frequency.headway_secs
      LIMIT ${MAX_FREQUENCY_ROWS + 1}
    `;
    if (rows.length > MAX_FREQUENCY_ROWS) {
      throw new Error('Itinerary frequency budget reached');
    }

    const result = new Map<string, ItineraryFrequencyRow[]>();
    for (const row of rows) {
      if (!isGtfsTime(row.startTime) || !isGtfsTime(row.endTime)) {
        throw new Error('Invalid frequency time');
      }
      if (
        !Number.isSafeInteger(row.headwaySeconds) ||
        row.headwaySeconds <= 0
      ) {
        throw new Error('Invalid frequency headway');
      }
      if (gtfsTimeSeconds(row.endTime) <= gtfsTimeSeconds(row.startTime)) {
        throw new Error('Invalid frequency window');
      }
      const current = result.get(row.tripId) ?? [];
      current.push(row);
      result.set(row.tripId, current);
    }
    return result;
  }

  private groupPatterns(rows: ItineraryTripPatternRow[]): PatternGroup[] {
    const grouped = new Map<string, PatternGroup>();
    for (const row of rows) {
      if (
        !row.tripId ||
        !Array.isArray(row.stopIds) ||
        !Array.isArray(row.stopSequences) ||
        row.stopIds.length === 0 ||
        row.stopIds.length !== row.stopSequences.length ||
        row.stopIds.length > MAX_STOPS_PER_PATTERN ||
        row.stopSequences.some((sequence) => !Number.isSafeInteger(sequence))
      ) {
        throw new Error('Invalid itinerary stop pattern');
      }

      const key = JSON.stringify([
        row.directionId,
        row.headsign,
        row.shapeId,
        row.stopIds,
        row.stopSequences,
      ]);
      const group = grouped.get(key);
      if (group) {
        group.trips.push(row);
      } else {
        grouped.set(key, { representative: row, trips: [row] });
      }
    }

    return [...grouped.values()].sort((left, right) =>
      left.representative.tripId.localeCompare(right.representative.tripId),
    );
  }

  private buildPatterns(
    groups: PatternGroup[],
    stopsByTrip: ItineraryStopMap,
    frequenciesByTrip: Map<string, ItineraryFrequencyRow[]>,
  ): BusRouteItineraryPattern[] {
    return groups.map((group, index) => {
      const representative = group.representative;
      const stopRows = stopsByTrip[representative.tripId] ?? [];
      if (stopRows.length !== representative.stopIds.length) {
        throw new Error('Incomplete itinerary stop pattern');
      }

      const stops = stopRows.map((stop) => this.mapStop(stop));
      const departures = new Set<string>();
      const intervals = new Map<string, BusRouteItineraryFrequencyWindow>();
      for (const trip of group.trips) {
        const frequencies = frequenciesByTrip.get(trip.tripId) ?? [];
        if (frequencies.length > 0) {
          for (const frequency of frequencies) {
            const key = `${frequency.startTime}|${frequency.endTime}|${frequency.headwaySeconds}`;
            intervals.set(key, {
              startTime: frequency.startTime,
              endTime: frequency.endTime,
              headwaySeconds: frequency.headwaySeconds,
              // exact_times is not imported into the provider-shaped tables;
              // every retained interval is therefore explicitly a template.
              exactTimes: false,
            });
          }
        } else if (trip.firstDeparture && isGtfsTime(trip.firstDeparture)) {
          departures.add(trip.firstDeparture);
        }
      }

      const sortedIntervals = [...intervals.values()].sort(
        (left, right) =>
          gtfsTimeSeconds(left.startTime) - gtfsTimeSeconds(right.startTime) ||
          gtfsTimeSeconds(left.endTime) - gtfsTimeSeconds(right.endTime) ||
          left.headwaySeconds - right.headwaySeconds,
      );

      return {
        id: `pattern-${index + 1}`,
        directionId: representative.directionId,
        headsign: representative.headsign,
        shapeId: representative.shapeId || null,
        stops,
        departures: [...departures].sort(
          (left, right) => gtfsTimeSeconds(left) - gtfsTimeSeconds(right),
        ),
        intervals: sortedIntervals,
        durationMinutes: consistentDurationMinutes(group.trips),
      };
    });
  }

  private mapRoute(row: ItineraryRouteRow): BusRouteItineraryRoute {
    return {
      ...mapBusRoute(row),
      operatorId: row.operator_id,
      operatorName: row.operator_name,
      operatorUrl: row.operator_url,
      operatorPhone: row.operator_phone,
    };
  }

  private mapStop(row: ItineraryStopRow): BusRouteItineraryStop {
    if (
      !Number.isFinite(row.latitude) ||
      !Number.isFinite(row.longitude) ||
      !Number.isSafeInteger(row.sequence)
    ) {
      throw new Error('Invalid itinerary stop');
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      sequence: row.sequence,
      latitude: row.latitude,
      longitude: row.longitude,
      platformCode: row.platformCode,
      arrivalTime: row.arrivalTime,
      departureTime: row.departureTime,
    };
  }

  private unavailable(serviceDate: string): BusRouteItinerary {
    return {
      status: 'UNAVAILABLE',
      serviceDate,
      operatorName: null,
      route: null,
      patterns: [],
    };
  }
}

function isGtfsTime(value: string | null | undefined): value is string {
  return (
    typeof value === 'string' && /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.test(value)
  );
}

function gtfsTimeSeconds(value: string): number {
  const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(value);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function consistentDurationMinutes(
  trips: readonly ItineraryTripPatternRow[],
): number | null {
  const durations = trips.map((trip) => {
    if (!isGtfsTime(trip.firstDeparture) || !isGtfsTime(trip.lastArrival)) {
      return null;
    }
    const duration =
      gtfsTimeSeconds(trip.lastArrival) - gtfsTimeSeconds(trip.firstDeparture);
    return duration < 0 ? null : Math.round(duration / 60);
  });
  const first = durations[0];
  if (first === null || first === undefined) return null;
  return durations.every((duration) => duration === first) ? first : null;
}
