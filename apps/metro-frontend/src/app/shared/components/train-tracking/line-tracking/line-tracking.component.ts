import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  ExtendedNextTrainLineCode,
  NextTrainStation,
} from '@metro/shared/utils';

@Component({
  selector: 'app-line-tracking',
  templateUrl: './line-tracking.component.html',
  styleUrl: './line-tracking.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineTrackingComponent {
  readonly lineCode = input.required<ExtendedNextTrainLineCode>();
  readonly assetPrefix = input.required<'l8' | 'l9'>();
  readonly stations = input.required<readonly NextTrainStation[]>();

  stationHref(stationCode: string): string {
    return `https://proximotrem.viamobilidade.com.br/?linha=${this.lineCode()}&estacao_origem=${stationCode}`;
  }

  stationIcon(index: number): string {
    const stations = this.stations();

    if (index === 0) {
      return `svg/${this.assetPrefix()}_station_first.svg`;
    }

    if (index === stations.length - 1) {
      return `svg/${this.assetPrefix()}_station_last.svg`;
    }

    return `svg/${this.assetPrefix()}_station.svg`;
  }

  plainIcon(): string {
    return `svg/${this.assetPrefix()}_plain.svg`;
  }

  trackStation(_index: number, station: NextTrainStation): string {
    return station.code;
  }
}
