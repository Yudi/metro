import { DestroyRef, Service, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GeolocationService } from '@metro/shared/geolocation';
import {
  AddressSearchDialogComponent,
  AddressSearchDialogResult,
} from '../address-search-dialog/address-search-dialog.component';
import { MapDisplayService } from './map-display.service';
import { UserLocationLayerService } from './user-location-layer.service';

/** Map navigation by address or current location, independent of stop loading. */
@Service()
export class MapLocationService {
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly display = inject(MapDisplayService);
  private readonly geolocation = inject(GeolocationService);
  private readonly userLocation = inject(UserLocationLayerService);
  private readonly destroyRef = inject(DestroyRef);
  private locationRequest = 0;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.locationRequest++;
      this.userLocation.stopTracking();
    });
  }

  openAddressSearch(): void {
    this.locationRequest++;
    this.dialog.open<
      AddressSearchDialogComponent,
      undefined,
      AddressSearchDialogResult | undefined
    >(AddressSearchDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      maxHeight: '80vh',
      panelClass: 'search-dialog-panel',
    }).afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (!result) return;
        this.locationRequest++;
        this.display.showAddressLocation(
          result.latitude, result.longitude, result.label,
        );
        this.display.centerOn([result.longitude, result.latitude], 16);
      });
  }

  async toggleUserLocation(): Promise<void> {
    const request = ++this.locationRequest;
    if (this.userLocation.isVisible()) {
      this.userLocation.stopTracking();
      return;
    }
    const focus = this.display.createFocusRequest();
    const success = await this.userLocation.show();
    if (request !== this.locationRequest) return;
    if (!success) {
      const permission = this.geolocation.permission();
      const message = permission === 'denied' || permission === 'unavailable'
        ? this.geolocation.permissionMessage()
        : 'Não foi possível obter sua localização. Tente novamente.';
      this.snackBar.open(message, 'Fechar', {
        duration: 4000,
      });
      return;
    }
    const location = this.geolocation.location();
    if (location && this.userLocation.isVisible()) {
      this.display.clearAddressLocation();
      focus.point([location.longitude, location.latitude], 16);
    }
  }
}
