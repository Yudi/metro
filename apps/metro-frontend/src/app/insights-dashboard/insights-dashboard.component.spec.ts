import { PLATFORM_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { ApiService, FavoritesService } from '@metro/shared/api';
import { emptyFavorites } from '@metro/shared/utils';
import { of } from 'rxjs';
import { GeographyGraphQLService } from '../map-main/services/geography-graphql.service';
import { InsightsDashboardComponent } from './insights-dashboard.component';

describe('InsightsDashboardComponent', () => {
  let component: InsightsDashboardComponent;
  let fixture: ComponentFixture<InsightsDashboardComponent>;

  beforeEach(async () => {
    const favorites = signal({ ...emptyFavorites });

    await TestBed.configureTestingModule({
      imports: [InsightsDashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: PLATFORM_ID,
          useValue: 'server',
        },
        {
          provide: ApiService,
          useValue: {
            getRailStatus: () =>
              of({
                lines: [],
                specialLines: [],
                specialInfoCards: [],
                lastUpdated: new Date(),
                success: true,
                errorMessage: null,
              }),
          },
        },
        {
          provide: FavoritesService,
          useValue: {
            favorites: favorites.asReadonly(),
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

    fixture = TestBed.createComponent(InsightsDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
