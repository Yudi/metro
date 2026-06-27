import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService, FavoritesService } from '@metro/shared/api';
import { Status } from './status';

describe('Status', () => {
  let component: Status;
  let fixture: ComponentFixture<Status>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Status],
      providers: [
        provideRouter([]),
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
              }),
          },
        },
        {
          provide: FavoritesService,
          useValue: {
            isFavorite: () => false,
            addFavorite: jest.fn(),
            removeFavorite: jest.fn(),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Status);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
