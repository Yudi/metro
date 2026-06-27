import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DisplayMode } from '../map.types';

@Component({
  selector: 'app-map-status-bar',
  imports: [MatIconModule],
  templateUrl: './map-status-bar.component.html',
  styleUrl: './map-status-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapStatusBarComponent {
  readonly isLoading = input<boolean>(false);
  readonly displayMode = input.required<DisplayMode>();
  readonly routeCount = input<number>(0);
  readonly stopCount = input<number>(0);
  readonly visibleCount = input<number>(0);
  readonly nearbyRadius = input<number>(500);
  readonly nearbyStopsCount = input<number>(0);
}
