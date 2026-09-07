import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { FavoritesService, LoggerService } from '@metro/shared/api';
import { GeographyGraphQLService } from '../../services/geography-graphql.service';
import { RealtimeWebsocketService } from '../../services/realtime-websocket.service';
import { BusStopDialogComponent, BusStopDialogData } from './bus-stop-dialog.component';

describe('BusStopDialogComponent', () => {
  let component: BusStopDialogComponent;
  let fixture: ComponentFixture<BusStopDialogComponent>;
  let favoritesService: {
    favorites: ReturnType<typeof signal>;
    isFavorite: jest.Mock;
    addFavorite: jest.Mock;
    removeFavorite: jest.Mock;
  };

  const stop = {
    id: '340015325',
    stopId: '340015325',
    name: 'Av. Brigadeiro Faria Lima, 1234',
    latitude: -23.5669,
    longitude: -46.6918,
    isSubwayStation: false,
    sourceAgency: 'SPTRANS',
    sourceId: '340015325',
    mergedStopIds: ['340015325', 'artesp:42'],
  };

  beforeEach(async () => {
    const favorites = signal({
      busStop: ['artesp:42'],
      busRoute: [],
      railStation: [],
      railLine: [],
      bikeStation: [],
    });
    favoritesService = {
      favorites,
      isFavorite: jest.fn((id: string) => favorites().busStop.includes(id)),
      addFavorite: jest.fn(),
      removeFavorite: jest.fn(),
    };
    const data: BusStopDialogData = {
      stop,
      routes: [],
      selectedRoutes: new Set(),
    };

    await TestBed.configureTestingModule({
      imports: [BusStopDialogComponent],
      providers: [
        provideHttpClient(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: jest.fn() } },
        { provide: FavoritesService, useValue: favoritesService },
        {
          provide: LoggerService,
          useValue: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: RealtimeWebsocketService,
          useValue: {
            stopArrivals: signal(new Map()),
            subscribeToStop: jest.fn(() => jest.fn()),
          },
        },
        {
          provide: GeographyGraphQLService,
          useValue: {
            getScheduledBusDepartures: jest.fn(() => of([])),
            getRouteRailConnectionsForStop: jest.fn(() => of([])),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BusStopDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('recognizes and removes a saved Artesp alias after the stop is merged', () => {
    expect(component.isFavorite()).toBe(true);

    component.removeFromFavorites();

    expect(favoritesService.removeFavorite).toHaveBeenCalledWith(
      'artesp:42',
      'busStop',
    );
    expect(favoritesService.removeFavorite).not.toHaveBeenCalledWith(
      '42',
      'busStop',
    );
  });
});
