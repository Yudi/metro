import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
  isDevMode,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RealtimeStatusComponent } from '../../realtime-status/realtime-status.component';

@Component({
  selector: 'app-map-footer',
  imports: [MatIconModule, MatButtonModule, RealtimeStatusComponent],
  templateUrl: './map-footer.component.html',
  styleUrl: './map-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapFooterComponent {
  readonly hasSelectedFeature = input<boolean>(false);
  public readonly isDevMode = isDevMode();

  readonly featureInfoClick = output<void>();
}
