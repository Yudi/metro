import {
  Component,
  inject,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  effect,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';

import {
  StopSearchService,
  StopSearchResult,
} from './services/stop-search.service';
import {
  SearchResultCardComponent,
  SearchResult,
} from '../map-main/components/search-dialog/search-result-card/search-result-card.component';
import {
  SubwayStationDialogComponent,
  SubwayStationDialogData,
} from '../map-main/components/subway-station-dialog/subway-station-dialog.component';
import {
  BusStopDialogComponent,
  BusStopDialogData,
} from '../map-main/components/bus-stop-dialog/bus-stop-dialog.component';
import { GeographyGraphQLService } from '../map-main/services/geography-graphql.service';
import { GeolocationService } from '@metro/shared/geolocation';
import { LoggerService } from '@metro/shared/api';
import { getUniqueAgencies } from '@metro/shared/utils';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-next-arrival',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    SearchResultCardComponent,
  ],
  providers: [StopSearchService],
  templateUrl: './next-arrival.component.html',
  styleUrl: './next-arrival.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NextArrivalComponent implements AfterViewInit {
  @ViewChild('searchInput')
  private readonly searchInputRef!: ElementRef<HTMLInputElement>;

  private readonly searchService = inject(StopSearchService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly dialog = inject(MatDialog);
  private readonly geographyService = inject(GeographyGraphQLService);
  private readonly logger = inject(LoggerService);
  private readonly http = inject(HttpClient);

  // Expose search service signals
  readonly searchQuery = this.searchService.searchQuery;
  readonly searchResults = this.searchService.searchResults;
  readonly isSearching = this.searchService.isSearching;
  readonly hasResults = this.searchService.hasResults;
  readonly nearbyMode = this.searchService.nearbyMode;

  // Geolocation signals
  readonly locationPermission = this.geolocationService.permission;
  readonly userLocation = this.geolocationService.location;
  readonly isRequestingLocation = this.geolocationService.isRequesting;
  readonly isLocationSupported = this.geolocationService.isSupported;

  constructor() {
    // Set up effect to trigger nearby search when location becomes available
    effect(() => {
      const isNearby = this.nearbyMode();
      const location = this.userLocation();

      if (isNearby && location) {
        this.searchService.searchNearby(location.latitude, location.longitude);
      }
    });
  }

  ngAfterViewInit(): void {
    // Auto-focus search input on load
    setTimeout(() => {
      this.searchInputRef?.nativeElement?.focus();
    }, 100);
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchService.search(target.value, [
      'busRoute',
      'railLine',
      'busStop',
      'railStation',
    ]);
  }

  onClearSearch(): void {
    this.searchService.clear();
    this.searchInputRef?.nativeElement?.focus();
  }

  /** Toggle nearby search mode */
  async toggleNearbySearch(): Promise<void> {
    const permission = this.locationPermission();

    if (this.nearbyMode()) {
      // Turning off nearby search
      this.searchService.clear();
      this.searchInputRef?.nativeElement?.focus();
      return;
    }

    // Turning on nearby search
    const location = this.userLocation();
    if (permission === 'granted' && location) {
      this.searchService.searchNearby(location.latitude, location.longitude);
    } else if (permission === 'prompt' || permission === 'granted') {
      // Need to request permission or get fresh location
      const newLocation = await this.geolocationService.requestLocation();
      if (newLocation) {
        this.searchService.searchNearby(
          newLocation.latitude,
          newLocation.longitude,
        );
      }
    }
    // If denied or unavailable, button is disabled so this won't be called
  }

  /** Get tooltip text for nearby button */
  getNearbyTooltip(): string {
    const permission = this.locationPermission();
    if (permission === 'denied') {
      return 'Localização negada pelo navegador';
    }
    if (!this.isLocationSupported()) {
      return 'Geolocalização não suportada';
    }
    if (this.nearbyMode()) {
      return 'Desativar busca por proximidade';
    }
    return 'Buscar paradas próximas';
  }

  onResultClick(result: SearchResult): void {
    this.logger.debug('Result clicked', result);
    // Cast to StopSearchResult since our service provides extended results
    const stopResult = result as StopSearchResult;

    if (result.type === 'subway_station') {
      this.openSubwayStationDialog(stopResult);
    } else if (result.type === 'bus_stop') {
      this.openBusStopDialog(stopResult);
    }
  }

  private openSubwayStationDialog(result: StopSearchResult): void {
    // If the search result already contains route short names (populated by
    // StopSearchService), reuse them immediately to avoid an extra GraphQL
    // roundtrip and ensure the dialog can compute line codes right away.
    if (result.routes && result.routes.length > 0) {
      const dialogData: SubwayStationDialogData = {
        stop: {
          id: result.id,
          stopId: result.stopId,
          name: result.name,
          latitude: result.latitude ?? 0,
          longitude: result.longitude ?? 0,
          isSubwayStation: true,
          agencies: getUniqueAgencies(result.routes),
          routeShortNames: result.routes,
        },
      };

      this.dialog.open(SubwayStationDialogComponent, {
        data: dialogData,
        width: '500px',
        maxWidth: '90vw',
      });
      return;
    }

    // Fallback: fetch full stop data from backend when search result doesn't
    // include route information
    this.geographyService.getBusStop(result.stopId).subscribe({
      next: (stop) => {
        if (!stop) {
          this.logger.warn('Subway station not found', {
            id: result.id,
            stopId: result.stopId,
          });
          return;
        }

        const dialogData: SubwayStationDialogData = {
          stop,
        };

        this.dialog.open(SubwayStationDialogComponent, {
          data: dialogData,
          width: '500px',
          maxWidth: '90vw',
        });
      },
      error: (err) => {
        this.logger.error('Failed to load subway station data', err);
      },
    });
  }

  private openBusStopDialog(result: StopSearchResult): void {
    // Fetch full stop data including routes for bus stops
    // Note: getBusStop uses MongoDB id, getRoutesForStop uses stopId
    this.geographyService.getBusStop(result.stopId).subscribe({
      next: (stop) => {
        if (!stop) {
          this.logger.warn('Stop not found', {
            id: result.id,
            stopId: result.stopId,
          });
          return;
        }

        // Fetch routes for this stop using stopId
        this.geographyService.getRoutesForStop(stop.stopId).subscribe({
          next: (routes) => {
            const dialogData: BusStopDialogData = {
              stop,
              routes: routes || [],
              selectedRoutes: new Set<string>(),
              showMapActions: false,
            };

            this.dialog.open(BusStopDialogComponent, {
              data: dialogData,
              width: '600px',
              maxWidth: '90vw',
            });
          },
          error: (err) => {
            this.logger.error('Failed to load routes for stop', err);
            // Open dialog anyway without routes
            const dialogData: BusStopDialogData = {
              stop,
              routes: [],
              selectedRoutes: new Set<string>(),
              showMapActions: false,
            };

            this.dialog.open(BusStopDialogComponent, {
              data: dialogData,
              width: '600px',
              maxWidth: '90vw',
            });
          },
        });
      },
      error: (err) => {
        this.logger.error('Failed to load stop data', err);
      },
    });
  }

}
