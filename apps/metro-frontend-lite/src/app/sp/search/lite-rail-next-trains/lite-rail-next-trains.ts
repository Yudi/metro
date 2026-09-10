import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  DEFAULT_TRANSIT_TIME_ZONE,
  ExtendedNextTrainLineCode,
  formatTransitTime,
  getLineColors,
  getRailLineById,
  getTerminalForDestination,
  NextTrainLineCode,
  isApi1RailLine,
  CPTM_LINE_CONFIG,
} from '@metro/shared/utils';
import type { LiteNextTrainArrival } from '../../../shared/search/lite-search.service';
import type {
  DirectionHeadway,
  RailScheduledService,
} from '@metro/shared/utils';
import { LiteSpinner } from '@metro/shared/lite-ui';
import {
  formatLiteScheduledDepartureTime,
  formatLiteScheduledServiceTime,
  getLiteScheduledDepartureTooltip,
  getLiteScheduledServiceLocation,
} from '../../../shared/search/lite-rail-schedule.utils';

export interface LiteNextTrainGroup {
  lineCode: ExtendedNextTrainLineCode;
  stationCode: string;
  trains: LiteNextTrainArrival[];
  scheduledServices?: RailScheduledService[];
  headway?: DirectionHeadway[];
  operationClosed?: boolean;
  outOfSchedule?: boolean;
  hasError?: boolean;
}

@Component({
  selector: 'app-lite-rail-next-trains',
  imports: [LiteSpinner],
  templateUrl: './lite-rail-next-trains.html',
  styleUrl: './lite-rail-next-trains.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiteRailNextTrains {
  readonly groups = input<LiteNextTrainGroup[]>([]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);

  private readonly transitTimeZone = DEFAULT_TRANSIT_TIME_ZONE;

  getLineName(lineCode: ExtendedNextTrainLineCode): string {
    return (
      getRailLineById(lineCode)?.fullName ??
      CPTM_LINE_CONFIG[lineCode as 'EA' | '10X']?.name ??
      lineCode
    );
  }

  getLineColor(lineCode: ExtendedNextTrainLineCode): {
    bg: string;
    text: string;
  } {
    const special = CPTM_LINE_CONFIG[lineCode as 'EA' | '10X'];
    if (special) {
      return { bg: `#${special.bgcolor}`, text: `#${special.fgcolor}` };
    }
    const code = Number(lineCode.replace('L', ''));
    return getLineColors(code);
  }

  getTrainTerminal(train: LiteNextTrainArrival): string {
    const lineCode = train.lineCode as ExtendedNextTrainLineCode;
    if (
      !train.destinationCode ||
      isApi1RailLine(lineCode) ||
      !this.hasTerminalDirections(lineCode)
    ) {
      return train.destinationName || '';
    }

    return getTerminalForDestination(
      lineCode,
      train.stationCode,
      train.destinationCode,
    );
  }

  getScheduledDirection(service: RailScheduledService): string {
    const group = this.groups().find((group) =>
      group.scheduledServices?.includes(service),
    );
    const lineCode = group?.lineCode;
    if (
      !lineCode ||
      !service.destinationCode ||
      !this.hasTerminalDirections(lineCode)
    ) {
      return service.destinationName;
    }

    return getTerminalForDestination(
      lineCode,
      group.stationCode,
      service.destinationCode,
    );
  }

  getArrivalDisplay(train: LiteNextTrainArrival): string {
    if (train.isAtPlatform) {
      return 'Na plataforma';
    }

    return formatTransitTime(train.arrivalTime, {
      timeZone: this.transitTimeZone,
    });
  }

  getScheduledArrivalDisplay(service: RailScheduledService): string {
    return formatLiteScheduledServiceTime(service);
  }

  getScheduledDepartureDisplay(
    departure: NonNullable<RailScheduledService['followingDepartures']>[number],
  ): string {
    return formatLiteScheduledDepartureTime(departure);
  }

  getScheduledLocation(service: RailScheduledService): string {
    return getLiteScheduledServiceLocation(service);
  }

  getScheduledDepartureTooltip(
    departure: NonNullable<RailScheduledService['followingDepartures']>[number],
  ): string {
    return getLiteScheduledDepartureTooltip(departure);
  }

  getIntervalLabel(
    group: LiteNextTrainGroup,
    service: RailScheduledService,
  ): string | null {
    const direction = this.getScheduledDirection(service);
    const headway = group.headway?.find(
      (candidate) =>
        candidate.direction === direction ||
        candidate.direction === service.destinationName,
    );
    if (headway) {
      return this.formatHeadway(headway.averageSeconds);
    }

    return service.intervalLabel?.trim() || null;
  }

  getIntervalTooltip(
    group: LiteNextTrainGroup,
    service: RailScheduledService,
  ): string {
    const direction = this.getScheduledDirection(service);
    return group.headway?.some(
      (candidate) =>
        candidate.direction === direction ||
        candidate.direction === service.destinationName,
    )
      ? 'Intervalo médio observado'
      : 'Intervalo programado · sem dados em tempo real';
  }

  private hasTerminalDirections(
    lineCode: ExtendedNextTrainLineCode,
  ): lineCode is NextTrainLineCode {
    return lineCode === 'L4' || lineCode === 'L8' || lineCode === 'L9';
  }

  private formatHeadway(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    return minutes < 1 ? '<1 min' : `${minutes} min`;
  }
}
