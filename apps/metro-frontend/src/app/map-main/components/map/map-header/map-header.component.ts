import { CityContextService } from '../../../../cities/city-context.service';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import type { ErrorStateMatcher } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { LocationPermissionState } from '@metro/shared/geolocation';

export type MapHeaderControls = 'primary' | 'secondary' | 'all';

@Component({
  selector: 'app-map-header',
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    ReactiveFormsModule,
  ],
  templateUrl: './map-header.component.html',
  styleUrl: './map-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapHeaderComponent {
  readonly cityContext = inject(CityContextService);
  readonly controls = input<MapHeaderControls>('all');
  readonly hasSelections = input<boolean>(false);
  readonly hasFeatures = input<boolean>(false);
  readonly layersOpen = input(false);
  readonly userLocationVisible = input<boolean>(false);
  readonly locationPermission = input<LocationPermissionState>('prompt');
  readonly isRequestingLocation = input<boolean>(false);
  readonly isLocationDisabled = input<boolean>(false);
  readonly searchControl = input(new FormControl('', { nonNullable: true }));
  readonly searchOpen = input(false);
  readonly searchError = input('');

  readonly searchClick = output<void>();
  readonly addressSearchClick = output<void>();
  readonly userLocationToggle = output<void>();
  readonly layersClick = output<void>();
  readonly centerClick = output<void>();
  readonly clearClick = output<void>();
  readonly fitClick = output<void>();
  readonly searchErrorMatcher: ErrorStateMatcher = {
    isErrorState: (control) =>
      this.searchError().length > 0 || Boolean(control?.invalid),
  };

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>(
    'searchInput',
  );

  readonly showPrimaryControls = computed(
    () => this.controls() !== 'secondary',
  );
  readonly showSecondaryControls = computed(
    () => this.controls() !== 'primary',
  );

  readonly isLocationUnavailable = computed(() => {
    const permission = this.locationPermission();
    return (
      this.isLocationDisabled() ||
      permission === 'denied' ||
      permission === 'unavailable'
    );
  });

  readonly isLocationActionDisabled = computed(() => {
    return (
      !this.userLocationVisible() &&
      (this.isRequestingLocation() || this.isLocationUnavailable())
    );
  });

  readonly locationMessage = computed(() => {
    if (this.isRequestingLocation()) {
      return 'Obtendo sua localização.';
    }

    const permission = this.locationPermission();
    if (permission === 'denied') {
      return this.userLocationVisible()
        ? 'A localização está visível no mapa. Permita o acesso novamente nas configurações do navegador.'
        : 'Acesso à localização negado. Permita nas configurações do navegador.';
    }
    if (permission === 'unavailable' || this.isLocationDisabled()) {
      return this.userLocationVisible()
        ? 'A localização está visível no mapa, mas não pode ser atualizada neste dispositivo.'
        : 'Localização não disponível neste dispositivo.';
    }
    return this.userLocationVisible()
      ? 'Ocultar minha localização no mapa.'
      : 'Mostrar minha localização no mapa.';
  });

  constructor() {
    effect((onCleanup) => {
      const subscription = this.searchControl().valueChanges.subscribe((value) => {
        if (value.trim() && !this.searchOpen()) this.searchClick.emit();
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  focusSearch(): void {
    this.searchInput()?.nativeElement.focus({ preventScroll: true });
  }
}
