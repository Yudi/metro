import { BadRequestException, Injectable } from '@nestjs/common';
import { Args, Field, Int, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { PrismaService } from '../prisma/prisma.service';
import { BusNoticeService } from './bus-notice.service';

@ObjectType()
class BusOperationalNotice {
  @Field() sourceId!: string;
  @Field() sourceUrl!: string;
  @Field() title!: string;
  @Field() description!: string;
  @Field(() => [String]) routes!: string[];
  @Field() periodText!: string;
  @Field() listedDate!: string;
  @Field() listing!: string;
}

@ObjectType()
class BusNoticesResult {
  @Field() status!: string;
  @Field(() => String, { nullable: true }) lastUpdated!: string | null;
  @Field(() => [BusOperationalNotice]) notices!: BusOperationalNotice[];
}

@ObjectType()
class BusServiceInterval {
  @Field() routeCode!: string;
  @Field() headsign!: string;
  @Field(() => Int) directionId!: number;
  @Field() startTime!: string;
  @Field() endTime!: string;
  @Field(() => Int) headwaySeconds!: number;
}

@ObjectType()
class BusServiceIntervalsResult {
  @Field() status!: string;
  @Field() serviceDate!: string;
  @Field(() => [BusServiceInterval]) intervals!: BusServiceInterval[];
}

export function validateRouteCodes(codes: string[]): string[] {
  if (
    !codes.length ||
    codes.length > 100 ||
    codes.some((code) => !/^[0-9A-Z]{4}-\d{2}$/.test(code))
  ) {
    throw new BadRequestException('Expected 1–100 SPTrans route codes');
  }
  return [...new Set(codes)];
}

@Injectable()
export class BusServiceIntervalsService {
  constructor(private readonly prisma: PrismaService) {}

  async forRoutes(
    codes: string[],
    now = new Date(),
  ): Promise<BusServiceIntervalsResult> {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (key: string) =>
      parts.find((value) => value.type === key)?.value ?? '';
    const serviceDate = `${part('year')}-${part('month')}-${part('day')}`;
    const date = serviceDate.replace(/-/g, '');
    const weekday = new Date(`${serviceDate}T12:00:00Z`).getUTCDay();
    try {
      const rows = await this.prisma.$queryRaw<BusServiceInterval[]>`
        SELECT DISTINCT r.route_short_name AS "routeCode", t.trip_headsign AS headsign,
          t.direction_id AS "directionId", f.start_time AS "startTime", f.end_time AS "endTime",
          f.headway_secs AS "headwaySeconds"
        FROM public."Gtfs_Route" r
        JOIN public."Gtfs_Trip" t ON t.route_id = r.route_id
        JOIN public."Gtfs_Frequency" f ON f.trip_id = t.trip_id
        LEFT JOIN public."Gtfs_Calendar" c ON c.service_id = t.service_id
        WHERE r.source_agency = 'sptrans' AND r.route_short_name = ANY(${codes}::text[])
          AND NOT EXISTS (SELECT 1 FROM public."Gtfs_CalendarDate" e
            WHERE e.service_id = t.service_id AND e.date = ${date} AND e.exception_type = 2)
          AND ((c.start_date <= ${date} AND c.end_date >= ${date}
            AND (ARRAY[c.sunday, c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday])[${weekday + 1}] = 1)
            OR EXISTS (SELECT 1 FROM public."Gtfs_CalendarDate" e
              WHERE e.service_id = t.service_id AND e.date = ${date} AND e.exception_type = 1))
        ORDER BY "routeCode", "directionId", headsign, "startTime", "endTime", "headwaySeconds"
        LIMIT 2001
      `;
      const seconds = (time: string) => {
        const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(time);
        return match
          ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
          : NaN;
      };
      if (
        rows.length > 2000 ||
        rows.some(
          (row) =>
            !Number.isSafeInteger(row.headwaySeconds) ||
            row.headwaySeconds <= 0 ||
            !(seconds(row.endTime) > seconds(row.startTime)),
        )
      )
        throw new Error('Invalid service intervals');
      return { status: 'AVAILABLE', serviceDate, intervals: rows };
    } catch {
      return { status: 'UNAVAILABLE', serviceDate, intervals: [] };
    }
  }
}

@Resolver()
export class BusInformationResolver {
  constructor(
    private readonly notices: BusNoticeService,
    private readonly intervals: BusServiceIntervalsService,
  ) {}

  @Query(() => BusNoticesResult, {
    description:
      'Cached SPTrans operational publications. Never scrapes on demand; listing dates do not prove an active incident.',
  })
  busOperationalNotices(
    @Args('routeCodes', { type: () => [String] }) codes: string[],
  ) {
    return this.notices.forRoutes(validateRouteCodes(codes));
  }

  @Query(() => BusServiceIntervalsResult, {
    description:
      'GTFS frequency windows for the current Sao Paulo service day, measured at route origin. Not stop arrival predictions or exact departures.',
  })
  busServiceIntervals(
    @Args('routeCodes', { type: () => [String] }) codes: string[],
  ) {
    return this.intervals.forRoutes(validateRouteCodes(codes));
  }
}
