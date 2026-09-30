import { CityContextService } from '../../../../cities/city-context.service';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { LocationPermissionState } from '@metro/shared/geolocation';
import type { DisplayMode } from '../map.types';

export type MapHeaderControls = 'primary' | 'secondary' | 'all';

@Component({
  selector: 'app-map-header',
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './map-header.component.html',
  styleUrl: './map-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapHeaderComponent {
  readonly cityContext = inject(CityContextService);
  readonly controls = input<MapHeaderControls>('all');
  readonly displayMode = input.required<DisplayMode>();
  readonly hasSelections = input<boolean>(false);
  readonly hasFeatures = input<boolean>(false);
  readonly layersOpen = input(false);
  readonly locationPermission = input<LocationPermissionState>('prompt');
  readonly isRequestingLocation = input<boolean>(false);
  readonly isLocationDisabled = input<boolean>(false);

  readonly displayModeChange = output<DisplayMode>();
  readonly searchClick = output<void>();
  readonly nearbyClick = output<void>();
  readonly exploreClick = output<void>();
  readonly layersClick = output<void>();
  readonly centerClick = output<void>();
  readonly centerOnUserClick = output<void>();
  readonly clearClick = output<void>();
  readonly fitClick = output<void>();

  readonly showPrimaryControls = computed(
    () => this.controls() !== 'secondary',
  );
  readonly showSecondaryControls = computed(
    () => this.controls() !== 'primary',
  );

  readonly isNearbyDisabled = computed(() => {
    const permission = this.locationPermission();
    return (
      this.isLocationDisabled() ||
      permission === 'denied' ||
      permission === 'unavailable'
    );
  });

  readonly isLocationActionDisabled = computed(() => {
    const permission = this.locationPermission();
    return (
      this.isRequestingLocation() ||
      this.isLocationDisabled() ||
      permission === 'denied' ||
      permission === 'unavailable'
    );
  });

  readonly locationMessage = computed(() => {
    if (this.isRequestingLocation()) return 'Obtendo sua localização.';

    const permission = this.locationPermission();
    if (permission === 'denied') {
      return 'Acesso à localização negado. Permita nas configurações do navegador.';
    }
    if (permission === 'unavailable' || this.isLocationDisabled()) {
      return 'Localização não disponível neste dispositivo.';
    }
    if (permission === 'granted') {
      return this.displayMode() === 'nearby'
        ? 'Centralizar novamente na minha localização.'
        : 'Mostrar paradas próximas à minha localização.';
    }
    return 'Ativar paradas próximas usando minha localização.';
  });

  readonly locationIcon = computed(() =>
    this.displayMode() === 'nearby' ? 'my_location' : 'near_me',
  );

  readonly nearbyDisabledMessage = computed(() => {
    if (this.locationPermission() === 'denied') {
      return 'Permita o acesso à localização nas configurações do navegador para ativar este modo.';
    }
    return 'A localização não está disponível neste dispositivo.';
  });

  readonly optionsLabel = computed(() =>
    this.displayMode() === 'nearby' ? 'Próximos' : 'Opções',
  );

  readonly optionsIcon = computed(() =>
    this.displayMode() === 'nearby' ? 'near_me' : 'tune',
  );

  readonly optionsAriaLabel = computed(() =>
    this.displayMode() === 'nearby' ? 'Opções; modo Próximos ativo' : 'Opções',
  );

  onDisplayModeChange(value: DisplayMode): void {
    this.displayModeChange.emit(value);
  }

  onNearbyClick(): void {
    if (this.isLocationActionDisabled()) return;

    this.nearbyClick.emit();

    if (this.displayMode() === 'nearby') {
      this.centerOnUserClick.emit();
      return;
    }

    this.displayModeChange.emit('nearby');
  }
}
