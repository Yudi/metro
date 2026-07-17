import { Injectable } from '@nestjs/common';
import {
  isExpressoAeroportoScheduledAt,
  isExpressoLinha10ScheduledAt,
  SPECIAL_RAIL_LINE_CODES,
  SPECIAL_RAIL_TIMEZONE,
} from '@metro/shared/utils';
import { RailHolidayService } from '../../rail/rail-holiday.service';
import type { LineCode } from './next-train-polling.service';

@Injectable()
export class NextTrainScheduleService {
  private readonly holidaysByDate = new Map<string, boolean>();

  constructor(private readonly railHolidayService: RailHolidayService) {}

  async isOperating(lineCode: LineCode, now: Date): Promise<boolean> {
    if (lineCode === SPECIAL_RAIL_LINE_CODES.EXPRESSO_AEROPORTO) {
      return isExpressoAeroportoScheduledAt(now);
    }

    if (lineCode !== SPECIAL_RAIL_LINE_CODES.EXPRESSO_LINHA_10) {
      return true;
    }

    if (!isExpressoLinha10ScheduledAt(now)) {
      return false;
    }

    const dateKey = this.getSaoPauloDateKey(now);
    let isHoliday = this.holidaysByDate.get(dateKey);
    if (isHoliday === undefined) {
      isHoliday = await this.railHolidayService.isHolidayInSaoPaulo(now);
      this.holidaysByDate.set(dateKey, isHoliday);
    }

    return !isHoliday;
  }

  private getSaoPauloDateKey(now: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: SPECIAL_RAIL_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }
}
