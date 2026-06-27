import { Injectable } from '@nestjs/common';
import {
  format,
  isAfter,
  isBefore,
  isWeekend,
  parse,
  setMilliseconds,
  setSeconds,
} from 'date-fns';
import {
  RailStatusCode,
  TRANSFER_CPTM_METRO_INFO,
  TRANSFER_CPTM_METRO_STATUS_LABELS,
  SPECIAL_RAIL_TIMEZONE,
  getRailLineByCode,
} from '@metro/shared/utils';
import { SpecialRailInfoCard } from './entities/rail-special-info-card.entity';
import { RailHoliday, RailHolidayService } from './rail-holiday.service';

@Injectable()
export class RailSpecialInfoService {
  constructor(private readonly holidayService: RailHolidayService) {}

  async getSpecialInfoCardsStatus(
    now: Date = new Date(),
  ): Promise<SpecialRailInfoCard[]> {
    const saoPauloNow = this.getSaoPauloNow(now);
    const year = Number.parseInt(format(saoPauloNow, 'yyyy'), 10);
    const holidays = await this.holidayService.getHolidaysForYear(year);

    return [this.buildTransferCardStatus(saoPauloNow, holidays)];
  }

  private buildTransferCardStatus(
    now: Date,
    holidays: RailHoliday[],
  ): SpecialRailInfoCard {
    const statusCode = this.getTransferStatusCode(now, holidays);
    const line3 = getRailLineByCode(3);

    return {
      id: TRANSFER_CPTM_METRO_INFO.id,
      title: TRANSFER_CPTM_METRO_INFO.title,
      subtitle: TRANSFER_CPTM_METRO_INFO.subtitle,
      badgeIcon: TRANSFER_CPTM_METRO_INFO.badgeIcon,
      badgeColorHex: line3?.colorHex ?? '#E61B3B',
      statusCode,
      statusLabel: this.getTransferStatusLabel(statusCode),
    };
  }

  private getTransferStatusCode(
    now: Date,
    holidays: RailHoliday[],
  ): RailStatusCode {
    const inOperation = this.isWithinWindow(
      now,
      TRANSFER_CPTM_METRO_INFO.operationStart,
      TRANSFER_CPTM_METRO_INFO.operationEnd,
    );

    if (!inOperation) {
      return 'OperacaoEncerrada';
    }

    if (this.isFreeTransferWindow(now, holidays)) {
      return 'OperacaoNormal';
    }

    return 'OperacaoComImpactoPontual';
  }

  private getTransferStatusLabel(statusCode: RailStatusCode): string {
    switch (statusCode) {
      case 'OperacaoNormal':
        return TRANSFER_CPTM_METRO_STATUS_LABELS.FREE;
      case 'OperacaoComImpactoPontual':
        return TRANSFER_CPTM_METRO_STATUS_LABELS.PAID;
      default:
        return TRANSFER_CPTM_METRO_STATUS_LABELS.CLOSED;
    }
  }

  private isFreeTransferWindow(now: Date, holidays: RailHoliday[]): boolean {
    if (isWeekend(now) || this.isHoliday(now, holidays)) {
      return true;
    }

    return TRANSFER_CPTM_METRO_INFO.weekdayFreeWindows.some((window) =>
      this.isWithinWindow(now, window.start, window.end),
    );
  }

  private isHoliday(now: Date, holidays: RailHoliday[]): boolean {
    const currentDate = format(now, 'yyyy-MM-dd');
    return holidays.some((holiday) => holiday.date === currentDate);
  }

  private isWithinWindow(
    now: Date,
    startTime: string,
    endTime: string,
  ): boolean {
    const normalizedNow = this.toMinutePrecision(now);
    const start = parse(startTime, 'HH:mm', normalizedNow);

    if (endTime === '00:00') {
      return (
        !isBefore(normalizedNow, start) || this.isExactlyMidnight(normalizedNow)
      );
    }

    const end = parse(endTime, 'HH:mm', normalizedNow);

    return !isBefore(normalizedNow, start) && !isAfter(normalizedNow, end);
  }

  private getSaoPauloNow(now: Date): Date {
    return new Date(
      now.toLocaleString('en-US', { timeZone: SPECIAL_RAIL_TIMEZONE }),
    );
  }

  private isExactlyMidnight(date: Date): boolean {
    return format(this.toMinutePrecision(date), 'HH:mm') === '00:00';
  }

  private toMinutePrecision(date: Date): Date {
    return setMilliseconds(setSeconds(date, 0), 0);
  }
}
