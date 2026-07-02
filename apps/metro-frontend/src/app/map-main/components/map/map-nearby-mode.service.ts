import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GeolocationService } from '@metro/shared/geolocation';
import {
  SAO_PAULO_CITY_CENTER,
  SAO_PAULO_CITY_CENTER_COORDINATES,
} from '@metro/shared/utils';
import { LoggerService } from '@metro/shared/api';
import {
  ExploreDialogComponent,
  ExploreDialogResult,
} from '../explore-dialog/explore-dialog.component';
import { UserLocationLayerService } from '../../services/user-location-layer.service';
import { MapService } from '../../services/map.service';
import { MapDataLoaderService } from './map-data-loader.service';
import { MapDisplayService } from './map-display.service';
import { MapStateService } from './map-state.service';

@Injectable({
  providedIn: 'root',
})
export class MapNearbyModeService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly mapState = inject(MapStateService);
  private readonly dataLoader = inject(MapDataLoaderService);
  private readonly displayService = inject(MapDisplayService);
  private readonly logger = inject(LoggerService);
  private readonly mapService = inject(MapService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly userLocationLayer = inject(UserLocationLayerService);

  openExploreModal(): void {
    const dialogRef = this.dialog.open<
      ExploreDialogComponent,
      undefined,
      ExploreDialogResult | undefined
    >(ExploreDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      maxHeight: '80vh',
      panelClass: 'search-dialog-panel',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) {
        return;
      }

      if (result.action === 'manual') {
        this.startExploreLocationSelection();
        return;
      }

      this.setExploreLocation(result.latitude, result.longitude, result.label);
    });
  }

  activateNearbyMode(): void {
    this.logger.debug('Activating nearby mode');
    this.mapState.displayMode.set('nearby');
    this.displayService.clearExploreLocation();
    this.showNearbyStops();

    this.userLocationLayer.show().then((success) => {
      if (success) {
        this.logger.debug('User location layer visible');
      }
    });
  }

  deactivateNearbyMode(): void {
    this.logger.debug('Deactivating nearby mode');

    this.mapState.displayMode.set('selected');
    this.userLocationLayer.hide();
    this.displayService.clearExploreLocation();
    this.mapState.nearbyCenter.set(null);
    this.displayService.clearNearbyFeatures();
    this.dataLoader.refreshDisplayedData();
  }

  toggleNearbyMode(): void {
    if (this.mapState.displayMode() === 'nearby') {
      this.deactivateNearbyMode();
    } else {
      this.activateNearbyMode();
    }
  }

  private async showNearbyStops(): Promise<void> {
    if (!this.geolocationService.isSupported()) {
      this.logger.warn('Geolocation not supported');
      this.snackBar.open('Localização não disponível', 'Fechar', {
        duration: 3000,
      });
      this.fallbackToDefaultLocation();
      return;
    }

    if (this.geolocationService.permission() === 'denied') {
      this.snackBar.open(
        'Acesso à localização negado. Permita nas configurações do navegador.',
        'Fechar',
        { duration: 4000 },
      );
      this.fallbackToDefaultLocation();
      return;
    }

    this.snackBar.open('Obtendo sua localização...', 'Fechar', {
      duration: 2000,
    });

    const location = await this.geolocationService.requestLocation();

    if (location) {
      this.logger.debug('Geolocation success', location);
      this.dataLoader.loadNearbyStops(location.latitude, location.longitude);
      this.displayService.centerOn([location.longitude, location.latitude], 14);
      this.snackBar.open('Mostrando paradas próximas', 'Fechar', {
        duration: 2000,
      });
    } else {
      const permission = this.geolocationService.permission();
      let errorMessage =
        'Falha ao obter localização. Usando localização padrão.';

      if (permission === 'denied') {
        errorMessage =
          'Acesso à localização negado. Usando localização padrão.';
      }

      this.snackBar.open(errorMessage, 'Fechar', { duration: 4000 });
      this.fallbackToDefaultLocation();
    }
  }

  private fallbackToDefaultLocation(): void {
    this.logger.info('Using default location: São Paulo center');
    this.dataLoader.loadNearbyStops(
      SAO_PAULO_CITY_CENTER.latitude,
      SAO_PAULO_CITY_CENTER.longitude,
    );
    this.displayService.centerOn(SAO_PAULO_CITY_CENTER_COORDINATES, 14);
  }

  private startExploreLocationSelection(): void {
    const snackRef = this.snackBar.open(
      'Toque no mapa para escolher um local',
      'Cancelar',
    );

    snackRef.onAction().subscribe(() => {
      this.mapService.cancelPointSelection();
    });

    this.mapService.startPointSelection(({ lat, lon }) => {
      snackRef.dismiss();
      this.setExploreLocation(lat, lon, 'Local escolhido');
    });
  }

  private setExploreLocation(lat: number, lon: number, label: string): void {
    this.logger.debug('Setting explore location', { lat, lon, label });
    this.userLocationLayer.hide();
    this.displayService.clearExploreLocation();
    this.mapState.displayMode.set('nearby');
    this.displayService.showExploreLocation(lat, lon, label);
    this.dataLoader.loadNearbyStops(lat, lon);
    this.displayService.centerOn([lon, lat], 14);
    this.snackBar.open('Mostrando paradas próximas ao local', 'Fechar', {
      duration: 2500,
    });
  }
}
