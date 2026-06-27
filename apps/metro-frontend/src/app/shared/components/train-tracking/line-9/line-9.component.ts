import { ChangeDetectionStrategy, Component } from '@angular/core';
import { L9_STATIONS } from '@metro/shared/utils';
import { LineTrackingComponent } from '../line-tracking/line-tracking.component';

@Component({
  selector: 'app-line-9',
  imports: [LineTrackingComponent],
  template: `
    <app-line-tracking
      lineCode="L9"
      assetPrefix="l9"
      [stations]="stations"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Line9Component {
  readonly stations = L9_STATIONS;
}
