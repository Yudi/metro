import { ChangeDetectionStrategy, Component } from '@angular/core';
import { L8_STATIONS } from '@metro/shared/utils';
import { LineTrackingComponent } from '../line-tracking/line-tracking.component';

@Component({
  selector: 'app-line-8',
  imports: [LineTrackingComponent],
  template: `
    <app-line-tracking
      lineCode="L8"
      assetPrefix="l8"
      [stations]="stations"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Line8Component {
  readonly stations = L8_STATIONS;
}
