import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-map-status-bar',
  imports: [MatIconModule],
  templateUrl: './map-status-bar.component.html',
  styleUrl: './map-status-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapStatusBarComponent {
  readonly isLoading = input<boolean>(false);
  readonly routeCount = input<number>(0);
  readonly stopCount = input<number>(0);
  readonly visibleCount = input<number>(0);
}
