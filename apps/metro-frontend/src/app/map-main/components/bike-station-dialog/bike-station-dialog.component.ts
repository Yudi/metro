import { DatePipe, TitleCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  isDevMode,
} from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { FavoritesService } from '@metro/shared/api';
import { BikeStation, BikeVehicleAvailability } from '../map/map.types';
import { DialogHeaderComponent } from '../../../shared/components/dialog-header/dialog-header.component';
import {
  closeMapPanelOrDialog,
  MAP_PANEL_REF,
} from '../map/map-panel/map-panel-ref';

export interface BikeStationDialogData {
  station: BikeStation;
}

export interface BikeStationDialogResult {
  action: 'select';
  stationId: string;
}

@Component({
  selector: 'app-bike-station-dialog',
  imports: [
    DatePipe,
    TitleCasePipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatChipsModule,
    DialogHeaderComponent,
  ],
  templateUrl: './bike-station-dialog.component.html',
  styleUrls: ['./bike-station-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.embedded]': 'embedded()' },
})
export class BikeStationDialogComponent {
  readonly embedded = input(false);
  readonly stationOverride = input<BikeStation | null>(null);
  protected readonly panelRef = inject(MAP_PANEL_REF, { optional: true });
  private readonly dialogRef = inject(
    MatDialogRef<BikeStationDialogComponent, BikeStationDialogResult>,
    { optional: true },
  );
  private readonly dialogData = inject<BikeStationDialogData>(MAT_DIALOG_DATA);
  public readonly isDevMode = isDevMode();

  private readonly favoritesService = inject(FavoritesService);

  private readonly stationSignal = signal(this.dialogData.station);
  readonly station = computed(
    () => this.stationOverride() ?? this.stationSignal(),
  );

  readonly favoriteId = computed(() => this.station().stationId);

  readonly isFavorite = computed(() =>
    this.favoritesService.isFavorite(this.favoriteId(), 'bikeStation'),
  );

  readonly hovered = signal(false);

  readonly favoriteIcon = computed(() => {
    const fav = this.isFavorite();
    const hover = this.hovered();

    if (fav) {
      return hover ? 'favorite_border' : 'favorite';
    }
    return hover ? 'favorite' : 'favorite_border';
  });

  readonly availableVehicles = computed(() =>
    this.station().vehicleAvailability.filter((vehicle) => vehicle.count > 0),
  );

  readonly unavailableVehicles = computed(() =>
    this.station().vehicleAvailability.filter((vehicle) => vehicle.count === 0),
  );

  readonly hasElectricBikes = computed(
    () => this.station().hasElectricBikesAvailable,
  );

  readonly detailsLoaded = computed(() => this.station().detailsLoaded);
  readonly detailsError = computed(() => this.station().detailsError ?? false);
  readonly availabilityUnknown = computed(
    () => !this.detailsLoaded() && this.station().effectiveCapacity === 0,
  );

  updateStation(station: BikeStation): void {
    this.stationSignal.set(station);
  }
  isElectric(vehicle: BikeVehicleAvailability): boolean {
    return vehicle.propulsionType === 'electric_assist';
  }

  close(): void {
    closeMapPanelOrDialog(this.panelRef, this.dialogRef);
  }

  toggleFavorite(): void {
    const id = this.favoriteId();
    if (this.isFavorite()) {
      this.favoritesService.removeFavorite(id, 'bikeStation');
    } else {
      this.favoritesService.addFavorite(id, 'bikeStation');
    }
  }

  setFavoriteHover(isHovering: boolean): void {
    this.hovered.set(isHovering);
  }

  formatFormFactor(type: string): string {
    const typeNormalized = type.normalize();
    switch (typeNormalized) {
      case 'bike':
      case 'bicycle':
        return 'Bicicleta';
      default:
        return type;
    }
  }

  formatPropulsionType(type: string): string {
    const typeNormalized = type.normalize();
    switch (typeNormalized) {
      case 'human':
        return 'Propulsão humana';
      case 'electric_assist':
        return 'Elétrica';
      default:
        return type;
    }
  }

  formatVehicleName(name: string): string {
    const nameNormalized = name.normalize();
    switch (nameNormalized) {
      case 'fit':
        return 'FIT comum';
      case 'efit':
        return 'E-FIT';
      default:
        return name;
    }
  }

  selectStation(): void {
    closeMapPanelOrDialog(this.panelRef, this.dialogRef, {
      action: 'select',
      stationId: this.station().stationId,
    });
  }
}
