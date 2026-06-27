import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import {
  FavoritesService,
  LoggerService,
  RailGraphqlService,
} from '@metro/shared/api';
import { emptyFavorites } from '@metro/shared/utils';
import { GeolocationService } from '@metro/shared/geolocation';
import { MapMainComponent } from './map-main.component';

import { BikeStationsService } from './services/bike-stations.service';
import { RealtimeWebsocketService } from './services/realtime-websocket.service';
import { RealtimeVehicleLayerService } from './services/realtime-vehicle-layer.service';
import { CptmVehicleLayerService } from './services/cptm-vehicle-layer.service';
import { UserLocationLayerService } from './services/user-location-layer.service';

describe('Bus', () => {
  let component: MapMainComponent;
  let fixture: ComponentFixture<MapMainComponent>;
  beforeEach(async () => {
    const activatedRouteStub = {
      snapshot: { queryParamMap: convertToParamMap({}) },
      queryParamMap: of(convertToParamMap({})),
    } as Partial<ActivatedRoute>;

    await TestBed.configureTestingModule({
      imports: [MapMainComponent],
      providers: [
        { provide: ActivatedRoute, useValue: activatedRouteStub },
        {
          provide: BikeStationsService,
          useValue: {
            stations: () => [],
            refreshTick: () => 0,
            activate: () => Promise.resolve(),
            disconnect: jest.fn(),
          },
        },
        {
          provide: FavoritesService,
          useValue: {
            favorites: signal({ ...emptyFavorites }).asReadonly(),
          },
        },
        {
          provide: RailGraphqlService,
          useValue: {
            fetchSpecialServices: () => of([]),
            specialServices: signal([]).asReadonly(),
          },
        },
        {
          provide: RealtimeWebsocketService,
          useValue: {
            connected: signal(false).asReadonly(),
            lastUpdateTimestamp: signal<number | null>(null).asReadonly(),
            vehiclePositions: signal(new Map()).asReadonly(),
            stopArrivals: signal(new Map()).asReadonly(),
            POLL_INTERVAL_MS: 30_000,
            subscribeToRoute: jest.fn(),
          },
        },
        {
          provide: RealtimeVehicleLayerService,
          useValue: {
            getLayer: () => null,
          },
        },
        {
          provide: CptmVehicleLayerService,
          useValue: {
            getLayer: () => null,
          },
        },
        {
          provide: GeolocationService,
          useValue: {
            permission: signal('prompt').asReadonly(),
            isDisabled: signal(false).asReadonly(),
            isRequesting: signal(false).asReadonly(),
          },
        },
        {
          provide: UserLocationLayerService,
          useValue: {
            addToMap: jest.fn(),
            stopTracking: jest.fn(),
            removeFromMap: jest.fn(),
            centerOnUser: () => Promise.resolve(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MapMainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
