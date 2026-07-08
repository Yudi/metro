import { Injectable } from '@nestjs/common';
import {
  addMinutes,
  differenceInMinutes,
  format,
  isAfter,
  isBefore,
  isSunday,
  isWeekend,
  parse,
  setMilliseconds,
  setSeconds,
  startOfDay,
} from 'date-fns';
import {
  AEROMOVEL_GRU_OPERATION,
  EXPRESSO_AEROPORTO_SCHEDULE,
  EXPRESSO_LINHA_10_SCHEDULE,
  RailStatusCode,
  RailStatusColor,
  RAIL_LINES,
  SPECIAL_RAIL_LINE_CODES,
  SPECIAL_RAIL_LINE_KEYWORDS,
  SPECIAL_RAIL_TIMEZONE,
  STATUS_CODE_TO_COLOR,
  STATUS_CODE_TO_LABEL,
} from '@metro/shared/utils';
import { RailLine } from './entities/rail-line-status.entity';
import {
  SpecialRailDeparture,
  SpecialRailIssue,
  SpecialRailLine,
} from './entities/rail-special-line.entity';

const LINE10 = RAIL_LINES.find((line) => line.code === 10);

@Injectable()
export class RailSpecialLinesService {
  getSpecialLinesStatus(
    regularLines: RailLine[],
    now: Date = new Date(),
    options: { isHoliday?: boolean } = {},
  ): SpecialRailLine[] {
    const saoPauloNow = this.getSaoPauloNow(now);

    return [
      this.buildExpressoAeroportoStatus(regularLines, saoPauloNow),
      this.buildExpressoLinha10Status(
        regularLines,
        saoPauloNow,
        options.isHoliday ?? false,
      ),
      this.buildAeromovelGruStatus(saoPauloNow),
    ];
  }

  private buildExpressoAeroportoStatus(
    regularLines: RailLine[],
    now: Date,
  ): SpecialRailLine {
    const issues = this.findIssuesByKeyword(
      regularLines,
      SPECIAL_RAIL_LINE_KEYWORDS.EXPRESSO_AEROPORTO,
    );

    if (issues.length > 0) {
      return this.buildSpecialLine({
        code: SPECIAL_RAIL_LINE_CODES.EXPRESSO_AEROPORTO,
        line: 'Expresso Aeroporto',
        colorName: 'Preto',
        colorHex: '#000000',
        statusCode: 'OperacaoComImpactoPontual',
        statusLabel: 'Alterações',
        issues,
      });
    }

    if (this.isAfterMidnightAndBeforeOrAt(now, '04:00')) {
      return this.buildSpecialLine({
        code: SPECIAL_RAIL_LINE_CODES.EXPRESSO_AEROPORTO,
        line: 'Expresso Aeroporto',
        colorName: 'Preto',
        colorHex: '#000000',
        statusCode: 'OperacaoEncerrada',
      });
    }

    const nextDeparture = this.getNextExpressoAeroportoDeparture(now);

    return this.buildSpecialLine({
      code: SPECIAL_RAIL_LINE_CODES.EXPRESSO_AEROPORTO,
      line: 'Expresso Aeroporto',
      colorName: 'Preto',
      colorHex: '#000000',
      statusCode: 'OperacaoNormal',
      nextDepartures: nextDeparture
        ? [{ label: 'Próxima partida', time: nextDeparture }]
        : [],
    });
  }

  private buildExpressoLinha10Status(
    regularLines: RailLine[],
    now: Date,
    isHoliday: boolean,
  ): SpecialRailLine {
    const line10 = regularLines.find((line) => line.code === 10);
    const line10Description = line10?.description;

    const hasExpressoIssue =
      !!line10Description &&
      this.descriptionContains(
        line10Description,
        SPECIAL_RAIL_LINE_KEYWORDS.EXPRESSO,
      ) &&
      !this.descriptionContains(
        line10Description,
        SPECIAL_RAIL_LINE_KEYWORDS.EXPRESSO_AEROPORTO,
      );

    if (hasExpressoIssue) {
      return this.buildSpecialLine({
        code: SPECIAL_RAIL_LINE_CODES.EXPRESSO_LINHA_10,
        line: 'Expresso Linha 10',
        colorName: LINE10?.colorName ?? 'Turquesa',
        colorHex: LINE10?.colorHex ?? '#00A499',
        statusCode: 'OperacaoComImpactoPontual',
        statusLabel: 'Alterações',
        issues:
          line10 && line10Description
            ? [
                {
                  code: line10.code,
                  line: line10.line,
                  description: line10Description,
                },
              ]
            : [],
      });
    }

    const isWeekendDay = isWeekend(now);
    const closedUntil = this.parseTime(
      now,
      EXPRESSO_LINHA_10_SCHEDULE.closedUntil,
    );
    const closedAfter = this.parseTime(
      now,
      EXPRESSO_LINHA_10_SCHEDULE.closedAfter,
    );
    const isClosedByTime =
      !isAfter(now, closedUntil) || isAfter(now, closedAfter);

    if (
      isHoliday ||
      (EXPRESSO_LINHA_10_SCHEDULE.weekdaysOnly && isWeekendDay) ||
      isClosedByTime
    ) {
      return this.buildSpecialLine({
        code: SPECIAL_RAIL_LINE_CODES.EXPRESSO_LINHA_10,
        line: 'Expresso Linha 10',
        colorName: LINE10?.colorName ?? 'Turquesa',
        colorHex: LINE10?.colorHex ?? '#00A499',
        statusCode: 'OperacaoEncerrada',
      });
    }

    const nextSantoAndre = this.findNextDeparture(
      EXPRESSO_LINHA_10_SCHEDULE.departures.santoAndre,
      now,
    );
    const nextTamanduatei = this.findNextDeparture(
      EXPRESSO_LINHA_10_SCHEDULE.departures.tamanduatei,
      now,
    );

    const nextDepartures: SpecialRailDeparture[] = [];

    if (nextSantoAndre) {
      nextDepartures.push({ label: 'Santo André', time: nextSantoAndre });
    }

    if (nextTamanduatei) {
      nextDepartures.push({ label: 'Tamanduateí', time: nextTamanduatei });
    }

    return this.buildSpecialLine({
      code: SPECIAL_RAIL_LINE_CODES.EXPRESSO_LINHA_10,
      line: 'Expresso Linha 10',
      colorName: LINE10?.colorName ?? 'Turquesa',
      colorHex: LINE10?.colorHex ?? '#00A499',
      statusCode:
        nextDepartures.length > 0 ? 'OperacaoNormal' : 'OperacaoEncerrada',
      nextDepartures,
    });
  }

  private buildAeromovelGruStatus(now: Date): SpecialRailLine {
    const openFrom = this.parseTime(now, AEROMOVEL_GRU_OPERATION.openFrom);
    const isOpen = !isBefore(now, openFrom) || this.isExactlyMidnight(now);

    return this.buildSpecialLine({
      code: SPECIAL_RAIL_LINE_CODES.AEROMOVEL_GRU,
      line: 'Aeromóvel GRU',
      colorName: 'Azul',
      colorHex: '#186dbf',
      statusCode: isOpen ? 'OperacaoNormal' : 'OperacaoEncerrada',
      statusLabel: isOpen ? 'Aberto' : undefined,
    });
  }

  private buildSpecialLine(params: {
    code: string;
    line: string;
    colorName: string;
    colorHex: string;
    statusCode: RailStatusCode;
    statusLabel?: string;
    nextDepartures?: SpecialRailDeparture[];
    issues?: SpecialRailIssue[];
  }): SpecialRailLine {
    return {
      code: params.code,
      line: params.line,
      colorName: params.colorName,
      colorHex: params.colorHex,
      statusCode: params.statusCode,
      statusLabel:
        params.statusLabel ?? STATUS_CODE_TO_LABEL[params.statusCode],
      statusColor: this.getStatusColor(params.statusCode),
      nextDepartures: params.nextDepartures ?? [],
      issues: params.issues ?? [],
    };
  }

  private getStatusColor(statusCode: RailStatusCode): RailStatusColor {
    return STATUS_CODE_TO_COLOR[statusCode];
  }

  private getSaoPauloNow(now: Date): Date {
    return new Date(
      now.toLocaleString('en-US', { timeZone: SPECIAL_RAIL_TIMEZONE }),
    );
  }

  private toMinutePrecision(date: Date): Date {
    return setMilliseconds(setSeconds(date, 0), 0);
  }

  private parseTime(referenceDate: Date, time: string): Date {
    return parse(time, 'HH:mm', referenceDate);
  }

  private isExactlyMidnight(date: Date): boolean {
    const normalized = this.toMinutePrecision(date);
    return format(normalized, 'HH:mm') === '00:00';
  }

  private isAfterMidnightAndBeforeOrAt(date: Date, maxTime: string): boolean {
    if (this.isExactlyMidnight(date)) {
      return false;
    }

    const maxDate = this.parseTime(date, maxTime);
    return !isAfter(date, maxDate);
  }

  private getNextExpressoAeroportoDeparture(now: Date): string {
    const normalizedNow = this.toMinutePrecision(now);

    if (this.isExactlyMidnight(normalizedNow)) {
      return '00:00';
    }

    const intervalMinutes = isSunday(normalizedNow)
      ? EXPRESSO_AEROPORTO_SCHEDULE.sundayIntervalMinutes
      : EXPRESSO_AEROPORTO_SCHEDULE.weekdayIntervalMinutes;

    const firstDeparture = this.parseTime(
      normalizedNow,
      EXPRESSO_AEROPORTO_SCHEDULE.firstDeparture,
    );
    if (isBefore(normalizedNow, firstDeparture)) {
      return EXPRESSO_AEROPORTO_SCHEDULE.firstDeparture;
    }

    const minutesFromMidnight = differenceInMinutes(
      normalizedNow,
      startOfDay(normalizedNow),
    );
    const roundedMinutes =
      Math.ceil(minutesFromMidnight / intervalMinutes) * intervalMinutes;
    const roundedDeparture = addMinutes(
      startOfDay(normalizedNow),
      roundedMinutes,
    );

    return format(roundedDeparture, 'HH:mm');
  }

  private findNextDeparture(
    departures: readonly string[],
    now: Date,
  ): string | null {
    const normalizedNow = this.toMinutePrecision(now);

    for (const departure of departures) {
      const departureTime = this.parseTime(normalizedNow, departure);

      if (!isBefore(departureTime, normalizedNow)) {
        return format(departureTime, 'HH:mm');
      }
    }

    return null;
  }

  private findIssuesByKeyword(
    lines: RailLine[],
    keyword: string,
  ): SpecialRailIssue[] {
    const issues: SpecialRailIssue[] = [];

    for (const line of lines) {
      if (
        !line.description ||
        !this.descriptionContains(line.description, keyword)
      ) {
        continue;
      }

      issues.push({
        code: line.code,
        line: line.line,
        description: line.description,
      });
    }

    return issues;
  }

  private descriptionContains(description: string, keyword: string): boolean {
    const normalizedDescription = this.normalizeText(description);
    const normalizedKeyword = this.normalizeText(keyword);
    return normalizedDescription.includes(normalizedKeyword);
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
