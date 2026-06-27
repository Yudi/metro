import { PLATFORM_ID, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FavoritesService } from '@metro/shared/api';
import { emptyFavorites } from '@metro/shared/utils';
import { of } from 'rxjs';
import { BikeStationsService } from '../map-main/services/bike-stations.service';
import { GeographyGraphQLService } from '../map-main/services/geography-graphql.service';
import { FavoritesComponent } from './favorites.component';

describe('FavoritesComponent', () => {
  let component: FavoritesComponent;
  let fixture: ComponentFixture<FavoritesComponent>;

  beforeEach(async () => {
    const favorites = signal({ ...emptyFavorites });
    const dashboardSelections = signal({
      railStationLines: {},
      busStopRoutes: {},
    });

    await TestBed.configureTestingModule({
      imports: [FavoritesComponent],
      providers: [
        provideHttpClient(),
        {
          provide: PLATFORM_ID,
          useValue: 'server',
        },
        {
          provide: FavoritesService,
          useValue: {
            favorites: favorites.asReadonly(),
            dashboardSelections: dashboardSelections.asReadonly(),
            removeFavorite: jest.fn(),
            toggleDashboardRailStationLine: jest.fn(),
            toggleDashboardBusStopRoute: jest.fn(),
          },
        },
        {
          provide: BikeStationsService,
          useValue: {
            stations: () => [],
          },
        },
        {
          provide: GeographyGraphQLService,
          useValue: {
            getRoutesForStop: () => of([]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FavoritesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
