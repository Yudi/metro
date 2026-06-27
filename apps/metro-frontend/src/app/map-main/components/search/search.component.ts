import {
  Component,
  signal,
  computed,
  inject,
  output,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatOptionModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatBadgeModule } from '@angular/material/badge';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { Subject, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  TypesenseSearchService,
  TypesenseSearchResponse,
  TypesenseSearchResult,
  TypesenseRoute,
  TypesenseStop,
} from '../../../services/typesense-search.service';
import { GeolocationService } from '@metro/shared/geolocation';
import { LoggerService } from '@metro/shared/api';
import {
  mapTypesenseStopToTransitSearchResult,
  SAO_PAULO_CITY_CENTER,
} from '@metro/shared/utils';
import { DecimalPipe } from '@angular/common';

export interface SearchResultItem {
  type: 'route' | 'stop';
  id: string;
  title: string;
  subtitle: string;
  data: TypesenseSearchResult;
  highlights?: Record<string, string[]>;
  score?: number;
  routes?: string[];
  lineCodes?: number[];
  isViaMobilidade?: boolean;
  source?: 'gtfs' | 'rail' | 'gpkg' | 'bike';
}

@Component({
  selector: 'app-search',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatAutocompleteModule,
    MatOptionModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatBadgeModule,
    DecimalPipe,
  ],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchComponent {
  private readonly typesenseService = inject(TypesenseSearchService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);

  // Signals
  searchQuery = signal('');
  isLoading = signal(false);
  isReindexing = signal(false);
  searchResults = signal<SearchResultItem[]>([]);
  showResults = signal(false);
  selectedResult = signal<SearchResultItem | null>(null);

  // Outputs
  resultSelected = output<SearchResultItem>();
  nearbyStopsRequested = output<{ lat: number; lon: number; radius: number }>();

  // Search subject for debouncing
  private searchSubject = new Subject<string>();

  // Expose geolocation service state
  readonly geolocationSupported = this.geolocationService.isSupported;
  readonly geolocationError = signal<string | null>(null);
  readonly isLocationDisabled = this.geolocationService.isDisabled;
  readonly isRequestingLocation = this.geolocationService.isRequesting;

  // Computed values
  hasResults = computed(() => this.searchResults().length > 0);
  resultCount = computed(() => this.searchResults().length);
  showEmptyState = computed(
    () => this.showResults() && !this.hasResults() && !this.isLoading(),
  );

  // Helper methods
  hasHighlights(result: SearchResultItem): boolean {
    return !!(result.highlights && Object.keys(result.highlights).length > 0);
  }

  constructor() {
    // Set up search observable with debouncing
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query || query.length < 2) {
            return of({
              success: true,
              query: '',
              results: [],
              total: 0,
            } as TypesenseSearchResponse);
          }

          this.isLoading.set(true);
          return this.typesenseService.search(query);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (results) => {
          this.isLoading.set(false);
          this.processSearchResults(results);
        },
        error: (error) => {
          this.logger.error('Search error', error);
          this.isLoading.set(false);
          this.searchResults.set([]);
        },
      });
  }

  onSearchInput(query: string) {
    this.searchQuery.set(query);
    this.showResults.set(true);
    this.searchSubject.next(query);
  }

  onResultClick(result: SearchResultItem) {
    this.selectedResult.set(result);
    this.showResults.set(false);
    this.searchQuery.set(result.title);
    this.resultSelected.emit(result);
  }

  onClearSearch() {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.showResults.set(false);
    this.selectedResult.set(null);
  }

  onFocusSearch() {
    if (this.hasResults()) {
      this.showResults.set(true);
    }
  }

  onBlurSearch() {
    // Delay hiding to allow for result clicks
    setTimeout(() => {
      this.showResults.set(false);
    }, 200);
  }

  async onNearbySearch() {
    // Clear any previous geolocation errors
    this.geolocationError.set(null);

    // Check if geolocation is supported
    if (!this.geolocationSupported()) {
      this.geolocationError.set(
        'Geolocalização não é suportada neste navegador',
      );
      // Default to São Paulo center
      this.searchNearbyStopsInternal(
        SAO_PAULO_CITY_CENTER.latitude,
        SAO_PAULO_CITY_CENTER.longitude,
        1000,
      );
      return;
    }

    // Check if permission is denied
    if (this.isLocationDisabled()) {
      this.geolocationError.set(
        'Acesso à localização negado. Permita nas configurações do navegador.',
      );
      // Default to São Paulo center
      this.searchNearbyStopsInternal(
        SAO_PAULO_CITY_CENTER.latitude,
        SAO_PAULO_CITY_CENTER.longitude,
        1000,
      );
      return;
    }

    // Request location using shared service
    const location = await this.geolocationService.requestLocation();

    if (location) {
      this.geolocationError.set(null);
      this.searchNearbyStopsInternal(
        location.latitude,
        location.longitude,
        1000,
      );
    } else {
      this.geolocationError.set('Não foi possível obter sua localização');
      // Default to São Paulo center
      this.searchNearbyStopsInternal(
        SAO_PAULO_CITY_CENTER.latitude,
        SAO_PAULO_CITY_CENTER.longitude,
        1000,
      );
    }
  }

  private searchNearbyStopsInternal(lat: number, lon: number, radius: number) {
    this.isLoading.set(true);

    this.typesenseService
      .searchNearbyStops(lat, lon, radius)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.isLoading.set(false);
          if (response.success) {
            // Convert nearby stops to search result format
            const items = response.stops
              .map((stop): SearchResultItem | null =>
                this.mapStopToResultItem(stop, {
                  type: 'stop',
                  document: stop,
                } as TypesenseSearchResult),
              )
              .filter(
                (item): item is SearchResultItem => item !== null,
              ) as SearchResultItem[];

            this.searchResults.set(items);
            this.showResults.set(true);
            this.searchQuery.set(`Nearby stops (${items.length} found)`);

            // Emit the location for map centering
            this.nearbyStopsRequested.emit({ lat, lon, radius });
          }
        },
        error: (error) => {
          this.logger.error('Nearby search error', error);
          this.isLoading.set(false);
        },
      });
  }

  private processSearchResults(response: TypesenseSearchResponse) {
    const items: SearchResultItem[] = [];

    if (!response.success || !response.results) {
      this.searchResults.set([]);
      return;
    }

    // Process all results from Typesense
    response.results.forEach((result) => {
      if (result.type === 'route') {
        const route = result.document as TypesenseRoute;
        items.push({
          type: 'route',
          id: route.route_id,
          title: route.route_short_name,
          subtitle: route.route_long_name,
          data: result,
          highlights: result.highlights,
          score: result.text_match,
          source: route.source || 'gtfs',
        });
      } else if (result.type === 'stop') {
        const stop = result.document as TypesenseStop;
        const item = this.mapStopToResultItem(
          stop,
          result,
          result.highlights,
          result.text_match,
        );

        if (item) {
          items.push(item);
          return;
        }
      }
    });

    this.searchResults.set(items);
  }

  private mapStopToResultItem(
    stop: TypesenseStop,
    data: TypesenseSearchResult,
    highlights?: Record<string, string[]>,
    score?: number,
  ): SearchResultItem | null {
    const result = mapTypesenseStopToTransitSearchResult(stop);
    if (!result) {
      return null;
    }

    return {
      type: 'stop',
      id: result.id,
      title: result.name,
      subtitle:
        result.description ||
        `Lat: ${result.latitude}, Lon: ${result.longitude}`,
      data,
      highlights,
      score,
      routes: result.routes,
      lineCodes: result.lineCodes,
      isViaMobilidade: result.isViaMobilidade,
      source: result.source,
    };
  }

  reindexData() {
    if (this.isReindexing()) return;

    this.isReindexing.set(true);

    this.typesenseService
      .reindexData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.logger.debug('Reindex completed', response);
          this.isReindexing.set(false);

          // If there's a current search query, re-run the search
          const currentQuery = this.searchQuery();
          if (currentQuery.trim()) {
            this.searchSubject.next(currentQuery);
          }
        },
        error: (error) => {
          this.logger.error('Reindex error', error);
          this.isReindexing.set(false);
        },
      });
  }

}
