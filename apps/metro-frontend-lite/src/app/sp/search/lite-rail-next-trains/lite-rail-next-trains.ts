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
import { LiteNextTrainArrival } from '../../../services/lite-search.service';
import { LiteSpinner } from '@metro/shared/lite-ui';

export interface LiteNextTrainGroup {
  lineCode: ExtendedNextTrainLineCode;
  stationCode: string;
  trains: LiteNextTrainArrival[];
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
    if (!train.destinationCode || isApi1RailLine(lineCode)) {
      return train.destinationName || '';
    }

    return getTerminalForDestination(
      lineCode as NextTrainLineCode,
      train.stationCode,
      train.destinationCode,
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
}
