import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  DestroyRef,
  effect,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  LiteSearchService,
  LiteSearchStop,
  LiteRouteRailConnection,
} from '../../services/lite-search.service';
import { LiteRealtimeService } from '../../services/lite-realtime.service';
import { GeolocationService } from '@metro/shared/geolocation';
import { getLineColors } from '@metro/shared/utils';
import {
  LiteButton,
  LiteInput,
  LiteCard,
  LiteChip,
  LiteSpinner,
  LiteIconButton,
} from '@metro/shared/lite-ui';
import { forkJoin, map, of, switchMap } from 'rxjs';
import {
  LiteNextTrainGroup,
  LiteRailNextTrains,
} from './lite-rail-next-trains/lite-rail-next-trains';
import { LiteBusStopDetail } from './lite-bus-stop-detail/lite-bus-stop-detail';
import { LiteBikeAvailability } from './lite-bike-availability/lite-bike-availability';

type ViewState = 'search' | 'results' | 'detail';

@Component({
  selector: 'app-search',
  imports: [
    LiteButton,
    LiteInput,
    LiteCard,
    LiteChip,
    LiteSpinner,
    LiteIconButton,
    LiteRailNextTrains,
    LiteBusStopDetail,
    LiteBikeAvailability,
  ],
  templateUrl: './search.html',
  styleUrl: './search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Search {
  @ViewChild(LiteInput) searchInput!: LiteInput;

  readonly searchService = inject(LiteSearchService);
  readonly realtimeService = inject(LiteRealtimeService);
  readonly geolocationService = inject(GeolocationService);
  private readonly destroyRef = inject(DestroyRef);

  // View state
  readonly viewState = signal<ViewState>('search');

  // Form state
  readonly searchQuery = signal('');

  // Expose service state
  readonly results = this.searchService.lastResults;
  readonly selectedStop = this.searchService.selectedStop;
  readonly isLoading = this.searchService.isLoading;
  readonly isNearbyMode = this.searchService.isNearbyMode;

  // Geolocation state
  readonly locationPermission = this.geolocationService.permission;
  readonly isRequestingLocation = this.geolocationService.isRequesting;
  readonly isLocationSupported = this.geolocationService.isSupported;

  // Detail data
  readonly nextTrainGroups = signal<LiteNextTrainGroup[]>([]);
  readonly trainsLoading = signal(false);
  readonly trainsError = signal<string | null>(null);
  readonly railConnections = signal<LiteRouteRailConnection[]>([]);
  readonly railConnectionsLoading = signal(false);
  readonly railConnectionsError = signal(false);
  readonly busArrivals = computed(() => {
    const stop = this.selectedStop();
    if (!stop || stop.kind !== 'busStop') {
      return undefined;
    }
    return this.realtimeService.stopArrivals().get(stop.stopId);
  });

  constructor() {
    // Restore previous state if exists
    if (this.searchService.hasSelection()) {
      this.viewState.set('detail');
      this.searchQuery.set(this.searchService.lastQuery());
      const stop = this.selectedStop();
      if (stop) {
        this.loadDetailData(stop);
      }
    } else if (this.searchService.hasResults()) {
      this.viewState.set('results');
      this.searchQuery.set(this.searchService.lastQuery());
    }

    // Effect to trigger nearby search when location becomes available
    effect(() => {
      const isNearby = this.isNearbyMode();
      const location = this.geolocationService.location();

      if (isNearby && location && this.viewState() === 'search') {
        this.searchService
          .searchNearby(location.latitude, location.longitude)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (stops) => {
              if (stops.length > 0) {
                this.viewState.set('results');
              }
            },
          });
      }
    });

    effect((onCleanup) => {
      const stop = this.selectedStop();
      if (!stop || stop.kind !== 'busStop') {
        return;
      }

      this.realtimeService.subscribeToStop(stop.stopId);
      onCleanup(() => this.realtimeService.unsubscribeFromStop(stop.stopId));
    });
  }

  onSearch(): void {
    const query = this.searchQuery();
    if (!query.trim() || query.length < 2) return;

    this.searchService
      .search(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stops) => {
          if (stops.length > 0) {
            this.viewState.set('results');
          }
        },
      });
  }

  async onNearbySearch(): Promise<void> {
    const permission = this.locationPermission();
    const location = this.geolocationService.location();

    if (permission === 'granted' && location) {
      this.searchService
        .searchNearby(location.latitude, location.longitude)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (stops) => {
            if (stops.length > 0) {
              this.viewState.set('results');
            }
          },
        });
    } else if (permission !== 'denied') {
      const newLocation = await this.geolocationService.requestLocation();
      if (newLocation) {
        this.searchService
          .searchNearby(newLocation.latitude, newLocation.longitude)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (stops) => {
              if (stops.length > 0) {
                this.viewState.set('results');
              }
            },
          });
      }
    }
  }

  onStopSelect(stop: LiteSearchStop): void {
    this.searchService.selectStop(stop);
    this.viewState.set('detail');
    this.loadDetailData(stop);
  }

  onBack(): void {
    if (this.viewState() === 'detail') {
      this.searchService.clearSelection();
      this.viewState.set('results');
      this.clearDetailData();
    } else if (this.viewState() === 'results') {
      this.viewState.set('search');
    }
  }

  onNewSearch(): void {
    this.searchService.clearAll();
    this.viewState.set('search');
    this.searchQuery.set('');
    this.clearDetailData();
    setTimeout(() => this.searchInput?.focus(), 100);
  }

  private loadDetailData(stop: LiteSearchStop): void {
    this.clearDetailData();

    if (stop.kind === 'railStation') {
      this.loadNextTrains(stop);
    } else if (stop.kind === 'busStop') {
      this.loadBusRailConnections(stop);
    }
  }

  private clearDetailData(): void {
    this.nextTrainGroups.set([]);
    this.trainsLoading.set(false);
    this.trainsError.set(null);
    this.railConnections.set([]);
    this.railConnectionsLoading.set(false);
    this.railConnectionsError.set(false);
  }

  private loadNextTrains(stop: LiteSearchStop): void {
    if (!this.hasNextTrainData(stop)) return;

    this.trainsLoading.set(true);
    this.trainsError.set(null);

    this.searchService
      .resolveNextTrainStations(stop)
      .pipe(
        switchMap((stations) => {
          if (stations.length === 0) {
            return of([]);
          }

          return forkJoin(
            stations.map((station) =>
              this.searchService
                .getNextTrains(station.lineCode, station.stationCode)
                .pipe(map((trains) => ({ ...station, trains }))),
            ),
          );
        }),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (groups) => {
          this.nextTrainGroups.set(groups);
          this.trainsLoading.set(false);
          if (groups.length === 0) {
            this.trainsError.set('Não foi possível identificar esta estação');
          } else if (groups.every((group) => group.trains.length === 0)) {
            this.trainsError.set('Nenhum trem previsto no momento');
          }
        },
        error: () => {
          this.trainsLoading.set(false);
          this.trainsError.set('Erro ao carregar próximos trens');
        },
      });
  }

  private loadBusRailConnections(stop: LiteSearchStop): void {
    const routeIds = this.getUniqueRouteIds(stop.routes ?? []);
    if (routeIds.length === 0) {
      return;
    }

    this.railConnectionsLoading.set(true);
    this.railConnectionsError.set(false);

    this.searchService
      .getRouteRailConnectionsForStop(stop.stopId, routeIds, 200)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (connections) => {
          this.railConnections.set(connections);
          this.railConnectionsLoading.set(false);
        },
        error: () => {
          this.railConnections.set([]);
          this.railConnectionsLoading.set(false);
          this.railConnectionsError.set(true);
        },
      });
  }

  private getUniqueRouteIds(
    routes: NonNullable<LiteSearchStop['routes']>,
  ): string[] {
    return Array.from(
      new Set(
        routes
          .flatMap((route) => [route.routeId, route.shortName])
          .map((routeId) => routeId.trim())
          .filter(Boolean),
      ),
    );
  }

  getStopIcon(stop: LiteSearchStop): string {
    if (stop.kind === 'railStation') return '🚇';
    if (stop.kind === 'bikeStation') return '🚲';
    return '🚌';
  }

  getStopType(stop: LiteSearchStop): string {
    if (stop.kind === 'railStation') {
      const nextTrainStations = this.searchService.getNextTrainStations(stop);
      if (nextTrainStations.length > 0) {
        return 'Estação de metrô/trem · Próximo trem disponível';
      }
      return 'Estação de metrô/trem';
    }

    if (stop.kind === 'bikeStation') {
      return 'Estação de bicicletas';
    }

    return 'Ponto de ônibus';
  }

  getLineColor(code: number): { bg: string; text: string } {
    return getLineColors(code);
  }

  getBikeSummary(stop: LiteSearchStop): string {
    const availability = stop.bikeAvailability;
    if (!availability) {
      return 'Disponibilidade indisponível';
    }

    const electric =
      availability.electricBikesAvailable > 0
        ? ` · ${availability.electricBikesAvailable} elétricas`
        : '';
    return `${availability.numBikesAvailable} bicicletas${electric}`;
  }

  hasNextTrainData(stop: LiteSearchStop): boolean {
    return this.searchService.getNextTrainStations(stop).length > 0;
  }

  getNearbyTooltip(): string {
    const permission = this.locationPermission();
    if (permission === 'denied') return 'Localização negada';
    if (!this.isLocationSupported()) return 'Geolocalização não suportada';
    return 'Buscar paradas próximas';
  }

  canUseNearby(): boolean {
    return (
      this.isLocationSupported() &&
      this.locationPermission() !== 'denied' &&
      !this.isRequestingLocation()
    );
  }
}
