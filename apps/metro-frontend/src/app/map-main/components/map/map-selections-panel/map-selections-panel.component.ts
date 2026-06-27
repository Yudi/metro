import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { SelectedRoute, SelectedStop, SelectedBikeStation } from '../map.types';

@Component({
  selector: 'app-map-selections-panel',
  imports: [MatIconModule, MatButtonModule, MatChipsModule],
  templateUrl: './map-selections-panel.component.html',
  styleUrl: './map-selections-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapSelectionsPanelComponent {
  readonly selectedRoutes = input.required<Map<string, SelectedRoute>>();
  readonly selectedStops = input.required<Map<string, SelectedStop>>();
  readonly selectedBikeStations = input<Map<string, SelectedBikeStation>>(
    new Map()
  );

  readonly removeRoute = output<string>();
  readonly removeStop = output<string>();
  readonly removeBikeStation = output<string>();
  readonly clearAll = output<void>();

  get routes(): SelectedRoute[] {
    return Array.from(this.selectedRoutes().values());
  }

  get stops(): SelectedStop[] {
    return Array.from(this.selectedStops().values());
  }

  get bikeStations(): SelectedBikeStation[] {
    return Array.from(this.selectedBikeStations().values());
  }

  get totalSelections(): number {
    return (
      this.selectedRoutes().size +
      this.selectedStops().size +
      this.selectedBikeStations().size
    );
  }

  getRouteDisplayName(route: SelectedRoute): string {
    return `${route.shortName} - ${route.longName}`;
  }
}
