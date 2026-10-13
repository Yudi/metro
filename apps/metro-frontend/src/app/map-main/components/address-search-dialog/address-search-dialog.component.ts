import { CityContextService } from '../../../cities/city-context.service';
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
  map,
  of,
  switchMap,
} from 'rxjs';
import { GeolocationService } from '@metro/shared/geolocation';
import { LoggerService } from '@metro/shared/api';
import { AddressSearchService } from './address-search.service';
import type {
  AddressLocationType,
  AddressSearchResult,
} from './address-search.service';

export interface AddressSearchDialogResult {
  latitude: number;
  longitude: number;
  label: string;
}

@Component({
  selector: 'app-address-search-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './address-search-dialog.component.html',
  styleUrl: './address-search-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddressSearchDialogComponent implements AfterViewInit {
  readonly cityContext = inject(CityContextService);
  @ViewChild('searchInput')
  private readonly searchInputRef!: ElementRef<HTMLInputElement>;

  private readonly dialogRef = inject(
    MatDialogRef<AddressSearchDialogComponent, AddressSearchDialogResult>,
  );
  private readonly searchService = inject(AddressSearchService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);
  private readonly searchSubject = new Subject<string>();

  readonly query = signal('');
  readonly results = signal<AddressSearchResult[]>([]);
  readonly isSearching = signal(false);
  readonly hasSearchError = signal(false);
  readonly hasResults = computed(() => this.results().length > 0);
  readonly showNoResults = computed(
    () =>
      this.query().trim().length > 0 &&
      !this.isSearching() &&
      !this.hasSearchError() &&
      !this.hasResults(),
  );

  constructor() {
    this.searchSubject
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          const trimmedQuery = query.trim();
          this.hasSearchError.set(false);

          if (!trimmedQuery) {
            return of({ results: [], hasError: false });
          }

          this.isSearching.set(true);
          const location = this.geolocationService.location();
          const prioritizeLat =
            location?.latitude ?? this.cityContext.city().map.center.latitude;
          const prioritizeLon =
            location?.longitude ?? this.cityContext.city().map.center.longitude;

          return this.searchService
            .search(trimmedQuery, prioritizeLat, prioritizeLon)
            .pipe(
              map((results) => ({ results, hasError: false })),
              catchError((error: unknown) => {
                this.logger.error('Address search error', error);
                return of({ results: [], hasError: true });
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ results, hasError }) => {
        this.isSearching.set(false);
        this.hasSearchError.set(hasError);
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

  selectResult(result: AddressSearchResult): void {
    this.dialogRef.close({
      latitude: result.latitude,
      longitude: result.longitude,
      label: result.label,
    });
  }

  iconForType(type: AddressLocationType): string {
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
