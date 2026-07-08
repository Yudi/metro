import { Injectable, Logger } from '@nestjs/common';
import {
  SAO_PAULO_LOCAL_HOLIDAYS,
  SPECIAL_RAIL_TIMEZONE,
} from '@metro/shared/utils';
import { format } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';

interface BrasilApiHoliday {
  date: string;
  name: string;
  type: string;
}

export interface RailHoliday {
  date: string;
  name: string;
  type: string;
}

@Injectable()
export class RailHolidayService {
  private readonly logger = new Logger(RailHolidayService.name);
  private readonly brasilApiBaseUrl =
    'https://brasilapi.com.br/api/feriados/v1';
  private readonly requestTimeoutMs = 10_000;
  private readonly requestUserAgent =
    'Projeto-Transporte-Metropolitano-Backend/1.0';

  constructor(private readonly prisma: PrismaService) {}

  async getHolidaysForYear(year: number): Promise<RailHoliday[]> {
    const cachedHolidays = await this.getStoredHolidays(year);

    if (cachedHolidays.length > 0) {
      return this.mergeWithLocalHolidays(year, cachedHolidays);
    }

    const fetchedHolidays = await this.fetchBrasilApiHolidays(year);
    const mergedHolidays = this.mergeWithLocalHolidays(year, fetchedHolidays);

    await this.upsertHolidays(year, mergedHolidays);

    return this.getStoredHolidays(year);
  }

  getTodayInSaoPaulo(now: Date = new Date()): string {
    const saoPauloNow = new Date(
      now.toLocaleString('en-US', { timeZone: SPECIAL_RAIL_TIMEZONE }),
    );

    return format(saoPauloNow, 'yyyy-MM-dd');
  }

  async isHolidayInSaoPaulo(now: Date = new Date()): Promise<boolean> {
    const today = this.getTodayInSaoPaulo(now);
    const year = Number.parseInt(today.slice(0, 4), 10);
    const holidays = await this.getHolidaysForYear(year);

    return holidays.some((holiday) => holiday.date === today);
  }

  private async getStoredHolidays(year: number): Promise<RailHoliday[]> {
    return this.prisma.$queryRaw<RailHoliday[]>`
      SELECT "date", "name", "type"
      FROM "feriados"
      WHERE "year" = ${year}
      ORDER BY "date" ASC
    `;
  }

  private async fetchBrasilApiHolidays(year: number): Promise<RailHoliday[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );

    try {
      const response = await fetch(`${this.brasilApiBaseUrl}/${year}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': this.requestUserAgent,
        },
      });

      if (!response.ok) {
        throw new Error(`BrasilAPI returned HTTP ${response.status}`);
      }

      const payload = (await response.json()) as BrasilApiHoliday[];

      return payload
        .filter((holiday) => !!holiday.date && !!holiday.name)
        .map((holiday) => ({
          date: holiday.date,
          name: holiday.name,
          type: holiday.type || 'national',
        }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Failed to fetch holidays from BrasilAPI: ${message}`);
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private mergeWithLocalHolidays(
    year: number,
    holidays: RailHoliday[],
  ): RailHoliday[] {
    const uniqueByDate = new Map<string, RailHoliday>();

    for (const holiday of holidays) {
      uniqueByDate.set(holiday.date, holiday);
    }

    for (const localHoliday of SAO_PAULO_LOCAL_HOLIDAYS) {
      const localHolidayDate = this.getLocalHolidayDate(year, localHoliday);
      uniqueByDate.set(localHolidayDate, {
        date: localHolidayDate,
        name: localHoliday.name,
        type: localHoliday.type,
      });
    }

    return Array.from(uniqueByDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }

  private getLocalHolidayDate(
    year: number,
    holiday: (typeof SAO_PAULO_LOCAL_HOLIDAYS)[number],
  ): string {
    const month = holiday.month.toString().padStart(2, '0');
    const day = holiday.day.toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async upsertHolidays(
    year: number,
    holidays: RailHoliday[],
  ): Promise<void> {
    if (holidays.length === 0) {
      return;
    }

    await this.prisma.$transaction(
      holidays.map(
        (holiday) =>
          this.prisma.$executeRaw`
          INSERT INTO "feriados" ("id", "year", "date", "name", "type", "lastUpdated")
          VALUES (gen_random_uuid(), ${year}, ${holiday.date}, ${holiday.name}, ${holiday.type}, CURRENT_TIMESTAMP)
          ON CONFLICT ("year", "date")
          DO UPDATE SET
            "name" = EXCLUDED."name",
            "type" = EXCLUDED."type",
            "lastUpdated" = CURRENT_TIMESTAMP
        `,
      ),
    );
  }
}
