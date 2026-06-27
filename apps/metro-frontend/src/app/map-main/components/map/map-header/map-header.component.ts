import {
  Component,
  input,
  output,
  computed,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DisplayMode } from '../map.types';
import {
  GeolocationService,
  LocationPermissionState,
} from '@metro/shared/geolocation';

@Component({
  selector: 'app-map-header',
  imports: [
    MatButtonToggleModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './map-header.component.html',
  styleUrl: './map-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapHeaderComponent {
  readonly displayMode = input.required<DisplayMode>();
  readonly hasSelections = input<boolean>(false);
  readonly hasFeatures = input<boolean>(false);
  readonly locationPermission = input<LocationPermissionState>('prompt');
  readonly isRequestingLocation = input<boolean>(false);
  readonly isLocationDisabled = input<boolean>(false);

  readonly geolocationService = inject(GeolocationService);

  readonly displayModeChange = output<DisplayMode>();
  readonly searchClick = output<void>();
  readonly exploreClick = output<void>();
  readonly layersClick = output<void>();
  readonly centerClick = output<void>();
  readonly centerOnUserClick = output<void>();
  readonly clearClick = output<void>();

  /** Whether the nearby toggle should be disabled */
  readonly isNearbyDisabled = computed(() => {
    const permission = this.locationPermission();
    return permission === 'denied' || permission === 'unavailable';
  });

  /** Tooltip for the nearby toggle based on permission state */
  readonly nearbyTooltip = computed(() => {
    const permission = this.locationPermission();
    if (permission === 'denied') {
      return 'Acesso à localização negado. Permita nas configurações do navegador.';
    }
    if (permission === 'unavailable') {
      return 'Localização não disponível neste dispositivo.';
    }
    return 'Mostrar paradas próximas à sua localização';
  });

  onDisplayModeChange(value: DisplayMode): void {
    this.displayModeChange.emit(value);
  }
}
