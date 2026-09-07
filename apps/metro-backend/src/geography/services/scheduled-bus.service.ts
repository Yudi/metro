import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { extractBusPlatform } from '../../transit-data/physical-stop-matcher';
import { ScheduledBusDeparture } from '../entities/geography.entity';

const TIME_ZONE = 'America/Sao_Paulo';
const LOOKAHEAD_DAYS = 7;
const DAY_MS = 86_400_000;

export interface ScheduledStopTimeRow {
  routeId: string;
  routeShortName: string;
  tripId: string;
  headsign: string;
  directionId: number;
  departure: string;
  stopName: string;
  stopDescription?: string | null;
  platformCode?: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Sunday first, matching Date.getUTCDay(). */
  weekdays: Array<number | null>;
  exceptions: Array<{ date: string; exceptionType: number }> | null;
}

function serviceDays(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((item) => item.type === type)?.value);
  const civilMidnight = Date.UTC(part('year'), part('month') - 1, part('day'));
  const offsets = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    timeZoneName: 'longOffset',
  });
  // The importer accepts GTFS hours 00..99, so check four previous service days.
  return Array.from({ length: LOOKAHEAD_DAYS + 5 }, (_, index) => {
    const civilDate = new Date(civilMidnight + (index - 4) * DAY_MS);
    const offsetName =
      offsets
        .formatToParts(new Date(civilDate.getTime() + DAY_MS / 2))
        .find((item) => item.type === 'timeZoneName')?.value ?? '';
    const offset = /GMT([+-])(\d{2}):(\d{2})/.exec(offsetName);
    if (!offset) throw new Error('Unable to determine GTFS service timezone');
    const offsetMs =
      (Number(offset[2]) * 60 + Number(offset[3])) *
      60_000 *
      (offset[1] === '+' ? 1 : -1);
    return {
      date: civilDate.toISOString().slice(0, 10).replace(/-/g, ''),
      weekday: civilDate.getUTCDay(),
      // GTFS service time is measured from local noon minus twelve hours.
      start: civilDate.getTime() - offsetMs,
    };
  });
}

/** Evaluate published service days; never turn static times into live predictions. */
export function selectScheduledDepartures(
  rows: readonly ScheduledStopTimeRow[],
  now: Date,
  limit: number,
  perRouteLimit?: number,
): ScheduledBusDeparture[] {
  const days = serviceDays(now);
  const from = now.getTime();
  const until = from + LOOKAHEAD_DAYS * DAY_MS;
  const result: ScheduledBusDeparture[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const time = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(row.departure);
    if (!time) continue;
    const seconds =
      Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]);
    for (const day of days) {
      const exceptions =
        row.exceptions?.filter((exception) => exception.date === day.date) ??
        [];
      if (exceptions.some((exception) => exception.exceptionType === 2))
        continue;
      const added = exceptions.some(
        (exception) => exception.exceptionType === 1,
      );
      if (
        !added &&
        !(
          row.startDate &&
          row.endDate &&
          day.date >= row.startDate &&
          day.date <= row.endDate &&
          row.weekdays[day.weekday] === 1
        )
      )
        continue;
      const instant = day.start + seconds * 1000;
      if (instant < from || instant > until) continue;
      const departureTime = new Date(instant).toISOString();
      const key = `${row.tripId}|${departureTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        routeId: row.routeId,
        routeShortName: row.routeShortName,
        tripId: row.tripId,
        headsign: row.headsign,
        directionId: row.directionId,
        departureTime,
        sourceAgency: 'artesp',
        platformCode: extractBusPlatform(
          row.stopName,
          row.stopDescription,
          row.platformCode,
        ),
      });
    }
  }
  const sorted = result.sort(
    (a, b) =>
      a.departureTime.localeCompare(b.departureTime) ||
      a.routeShortName.localeCompare(b.routeShortName) ||
      a.tripId.localeCompare(b.tripId),
  );
  if (perRouteLimit === undefined) return sorted.slice(0, limit);

  const routeCounts = new Map<string, number>();
  return sorted.filter((departure) => {
    const count = routeCounts.get(departure.routeId) ?? 0;
    if (count >= perRouteLimit) return false;
    routeCounts.set(departure.routeId, count + 1);
    return true;
  });
}

@Injectable()
export class ScheduledBusService {
  constructor(private readonly prisma: PrismaService) {}

  async getDepartures(
    stopId: string,
    limit = 12,
    now = new Date(),
    perRouteLimit?: number,
  ): Promise<ScheduledBusDeparture[]> {
    if (
      !stopId.trim() ||
      stopId.length > 128 ||
      [...stopId].some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    ) {
      throw new BadRequestException('Invalid stopId');
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException('limit must be between 1 and 50');
    }
    if (
      perRouteLimit !== undefined &&
      (!Number.isSafeInteger(perRouteLimit) ||
        perRouteLimit < 1 ||
        perRouteLimit > 5)
    ) {
      throw new BadRequestException('perRouteLimit must be between 1 and 5');
    }
    // Retrieve only this physical stop's scheduled rows through indexed source IDs.
    // Calendar evaluation happens once per row in the pure, time-testable selector.
    // Frequency templates are not exact departures; this Artesp snapshot has none.
    const rows = await this.prisma.$queryRaw<ScheduledStopTimeRow[]>`
      WITH physical_stop AS (
        SELECT COALESCE((SELECT physical_stop_id FROM public.physical_stop_members
          WHERE source_stop_id = ${stopId.trim()}), ${stopId.trim()}) AS id
      ), members AS (
        SELECT COALESCE(member.source_stop_id, physical.id) AS stop_id
        FROM physical_stop physical
        LEFT JOIN public.physical_stop_members member ON member.physical_stop_id = physical.id
      ), exceptions AS (
        SELECT service_id, jsonb_agg(jsonb_build_object('date', date, 'exceptionType', exception_type)) AS dates
        FROM public."Gtfs_CalendarDate" GROUP BY service_id
      )
      SELECT DISTINCT r.route_id AS "routeId", r.route_short_name AS "routeShortName",
        t.trip_id AS "tripId", t.trip_headsign AS headsign, t.direction_id AS "directionId",
        st.departure_time AS departure, s.stop_name AS "stopName", s.stop_desc AS "stopDescription",
        s.platform_code AS "platformCode", c.start_date AS "startDate", c.end_date AS "endDate",
        ARRAY[c.sunday, c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday] AS weekdays,
        exceptions.dates AS exceptions
      FROM members
      JOIN public."Gtfs_StopTime" st ON st.stop_id = members.stop_id
      JOIN public."Gtfs_Trip" t ON t.trip_id = st.trip_id
      JOIN public."Gtfs_Route" r ON r.route_id = t.route_id AND r.source_agency = 'artesp'
      JOIN public."Gtfs_Stop" s ON s.stop_id = st.stop_id
      LEFT JOIN public."Gtfs_Calendar" c ON c.service_id = t.service_id
      LEFT JOIN exceptions ON exceptions.service_id = t.service_id
      WHERE r.route_type = 3
        AND NOT EXISTS (SELECT 1 FROM public."Gtfs_Frequency" frequency WHERE frequency.trip_id = t.trip_id)
    `;
    return selectScheduledDepartures(rows, now, limit, perRouteLimit);
  }
}
