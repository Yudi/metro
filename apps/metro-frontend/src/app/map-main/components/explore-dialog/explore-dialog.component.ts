import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  switchMap,
} from 'rxjs';
import { GeolocationService } from '@metro/shared/geolocation';
import { LoggerService } from '@metro/shared/api';
import {
  ExploreLocationResult,
  ExploreLocationSearchService,
  PhotonLocationType,
} from '../../services/explore-location-search.service';
import { SAO_PAULO_CITY_CENTER } from '@metro/shared/utils';

export type ExploreDialogResult =
  | { action: 'manual' }
  | {
      action: 'location';
      latitude: number;
      longitude: number;
      label: string;
    };

@Component({
  selector: 'app-explore-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './explore-dialog.component.html',
  styleUrl: './explore-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreDialogComponent implements AfterViewInit {
  @ViewChild('searchInput')
  private readonly searchInputRef!: ElementRef<HTMLInputElement>;

  private readonly dialogRef = inject(
    MatDialogRef<ExploreDialogComponent, ExploreDialogResult>,
  );
  private readonly searchService = inject(ExploreLocationSearchService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);
  private readonly searchSubject = new Subject<string>();

  readonly query = signal('');
  readonly results = signal<ExploreLocationResult[]>([]);
  readonly isSearching = signal(false);
  readonly hasResults = computed(() => this.results().length > 0);
  readonly showNoResults = computed(
    () =>
      this.query().trim().length > 0 &&
      !this.isSearching() &&
      !this.hasResults(),
  );

  constructor() {
    this.searchSubject
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          const trimmedQuery = query.trim();

          if (!trimmedQuery) {
            return of([]);
          }

          this.isSearching.set(true);
          const location = this.geolocationService.location();
          const prioritizeLat =
            location?.latitude ?? SAO_PAULO_CITY_CENTER.latitude;
          const prioritizeLon =
            location?.longitude ?? SAO_PAULO_CITY_CENTER.longitude;

          return this.searchService
            .search(trimmedQuery, prioritizeLat, prioritizeLon)
            .pipe(
              catchError((error) => {
                this.logger.error('Explore location search error', error);
                return of([]);
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.isSearching.set(false);
        this.results.set(results);
      });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.searchInputRef?.nativeElement?.focus();
    }, 100);
  }

  onSearchInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.query.set(query);
    this.searchSubject.next(query);
  }

  selectManual(): void {
    this.dialogRef.close({ action: 'manual' });
  }

  selectResult(result: ExploreLocationResult): void {
    this.dialogRef.close({
      action: 'location',
      latitude: result.latitude,
      longitude: result.longitude,
      label: result.name,
    });
  }

  iconForType(type: PhotonLocationType): string {
    switch (type) {
      case 'house':
        return 'home';
      case 'street':
        return 'add_road';
      case 'locality':
        return 'place';
      case 'district':
        return 'domain';
      case 'city':
        return 'location_city';
      case 'county':
        return 'map';
      case 'state':
        return 'flag';
      case 'country':
        return 'public';
      default:
        return 'place';
    }
  }
}
