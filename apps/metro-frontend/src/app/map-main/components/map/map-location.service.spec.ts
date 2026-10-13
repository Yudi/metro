import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GeolocationService } from '@metro/shared/geolocation';
import { Subject } from 'rxjs';
import type { AddressSearchDialogResult } from '../address-search-dialog/address-search-dialog.component';
import { MapDisplayService } from './map-display.service';
import { MapLocationService } from './map-location.service';
import { UserLocationLayerService } from './user-location-layer.service';

describe('MapLocationService', () => {
  const location = { latitude: -23.55, longitude: -46.63 };
  let service: MapLocationService;
  let result: Subject<AddressSearchDialogResult | undefined>;
  let visible: ReturnType<typeof signal<boolean>>;
  let show: jest.Mock;
  let stopTracking: jest.Mock;
  let point: jest.Mock;
  let display: { showAddressLocation: jest.Mock; clearAddressLocation: jest.Mock; centerOn: jest.Mock };
  let openSnackBar: jest.Mock;

  beforeEach(() => {
    result = new Subject();
    visible = signal(false);
    show = jest.fn(async () => { visible.set(true); return true; });
    stopTracking = jest.fn(() => visible.set(false));
    point = jest.fn();
    display = {
      showAddressLocation: jest.fn(),
      clearAddressLocation: jest.fn(),
      centerOn: jest.fn(),
    };
    openSnackBar = jest.fn();
    TestBed.configureTestingModule({ providers: [
      MapLocationService,
      { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => result }) } },
      { provide: MatSnackBar, useValue: { open: openSnackBar } },
      { provide: MapDisplayService, useValue: { ...display, createFocusRequest: () => ({ point }) } },
      { provide: UserLocationLayerService, useValue: { isVisible: visible, show, stopTracking } },
      { provide: GeolocationService, useValue: {
        location: signal(location),
        permission: signal('denied'),
        permissionMessage: () => 'Acesso à localização negado.',
      } },
    ] });
    service = TestBed.inject(MapLocationService);
  });

  it('centers on a searched address without loading stop data', () => {
    service.openAddressSearch();
    result.next({ ...location, label: 'Praça da Sé' });
    expect(display.showAddressLocation).toHaveBeenCalledWith(-23.55, -46.63, 'Praça da Sé');
    expect(display.centerOn).toHaveBeenCalledWith([-46.63, -23.55], 16);
    expect(show).not.toHaveBeenCalled();
  });

  it('toggles tracking and centers only when enabling the location marker', async () => {
    await service.toggleUserLocation();
    expect(point).toHaveBeenCalledWith([-46.63, -23.55], 16);
    expect(visible()).toBe(true);
    await service.toggleUserLocation();
    expect(stopTracking).toHaveBeenCalledTimes(1);
    expect(visible()).toBe(false);
    expect(point).toHaveBeenCalledTimes(1);
  });

  it('does not move the map after a pending location request is turned off', async () => {
    let complete!: (success: boolean) => void;
    show.mockImplementation(() => {
      visible.set(true);
      return new Promise<boolean>((resolve) => { complete = resolve; });
    });
    const pending = service.toggleUserLocation();
    await service.toggleUserLocation();
    complete(true);
    await pending;
    expect(point).not.toHaveBeenCalled();
    expect(visible()).toBe(false);
  });

  it('lets address search supersede a pending location navigation even when canceled', async () => {
    let complete!: (success: boolean) => void;
    show.mockImplementation(() => {
      visible.set(true);
      return new Promise<boolean>((resolve) => { complete = resolve; });
    });
    const pending = service.toggleUserLocation();
    service.openAddressSearch();
    result.next(undefined);
    complete(true);
    await pending;
    expect(point).not.toHaveBeenCalled();
  });

  it('keeps the current view when location fails', async () => {
    show.mockResolvedValue(false);
    await service.toggleUserLocation();
    expect(point).not.toHaveBeenCalled();
    expect(display.centerOn).not.toHaveBeenCalled();
    expect(openSnackBar).toHaveBeenCalledWith('Acesso à localização negado.', 'Fechar', { duration: 4000 });
  });
});
