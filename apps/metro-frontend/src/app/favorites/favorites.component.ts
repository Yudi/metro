import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FavoritesService } from '@metro/shared/api';
import {
  FavoriteTypes,
  FavoriteRailLineOption,
  createFavoriteRailLineOptions,
  getContrastColor,
  getRailLineByCode,
  getRailLineById,
  getRailStationIdentityFromFavoriteKey,
  getRailStationIdentityKey,
  normalizeHexColor,
  toTitleCase,
  CPTM_LINE_CONFIG,
} from '@metro/shared/utils';
import { catchError, of } from 'rxjs';
import { BikeStationsService } from '../map-main/services/bike-stations.service';
import {
  BusRouteGraphQL,
  GeographyGraphQLService,
} from '../map-main/services/geography-graphql.service';

interface FavoriteRailStation {
  id: string;
  name: string;
  favoriteIds: string[];
  lines: FavoriteRailLineOption[];
}

interface MergedRailStationFavorite {
  id: string;
  name: string;
  lines: string[];
}

@Component({
  selector: 'app-favorites',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './favorites.component.html',
  styleUrl: './favorites.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FavoritesComponent {
  private readonly favoritesService = inject(FavoritesService);
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly bikeStationsService = inject(BikeStationsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly geographyService = inject(GeographyGraphQLService);
  private lastBusLookupKey = '';

  readonly favorites = this.favoritesService.favorites;
  readonly busRoutesById = signal(
    new Map<string, { routeId: string; shortName: string; longName: string }>(),
  );
  readonly busStopsById = signal(
    new Map<string, { stopId: string; name: string }>(),
  );
  readonly busRoutesByStopId = signal(new Map<string, BusRouteGraphQL[]>());
  readonly railLinesById = signal(
    new Map<string, { id: string; name: string }>(),
  );
  readonly mergedRailStations = signal<MergedRailStationFavorite[]>([]);

  readonly busRoutes = computed(() => [...this.busRoutesById().values()]);
  readonly busStops = computed(() => [...this.busStopsById().values()]);
  readonly railLines = computed(() => [...this.railLinesById().values()]);

  readonly railStations = computed(() => {
    const groups = new Map<string, FavoriteRailStation>();
    const mergedByName = new Map(
      this.mergedRailStations().map((station) => [
        getRailStationIdentityKey(station.name),
        station,
      ]),
    );

    for (const id of [...new Set(this.favorites().railStation)]) {
      const stableIdentity = getRailStationIdentityFromFavoriteKey(id);

      if (!stableIdentity) {
        continue;
      }

      const mergedStation = mergedByName.get(stableIdentity);
      groups.set(id, {
        id,
        name: toTitleCase(mergedStation?.name ?? stableIdentity),
        favoriteIds: [id],
        lines: createFavoriteRailLineOptions(mergedStation?.lines ?? []),
      });
    }

    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly bikeStations = computed(() => {
    const stationsById = new Map(
      this.bikeStationsService
        .stations()
        .map((station) => [station.stationId, station]),
    );

    return this.favorites().bikeStation.map((id) => ({
      stationId: id,
      name: stationsById.get(id)?.name ?? id,
    }));
  });

  readonly totalFavorites = computed(
    () =>
      this.favorites().busStop.length +
      this.favorites().busRoute.length +
      this.railStations().length +
      this.favorites().railLine.length +
      this.favorites().bikeStation.length,
  );

  readonly hasFavorites = computed(() => this.totalFavorites() > 0);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadMergedRailStations();
    }

    effect((onCleanup) => {
      if (!isPlatformBrowser(this.platformId)) {
        return;
      }

      const routeIds = [...new Set(this.favorites().busRoute)];
      const stopIds = [...new Set(this.favorites().busStop)];
      const lookupKey = JSON.stringify({ routeIds, stopIds });

      if (lookupKey === this.lastBusLookupKey) {
        return;
      }

      this.lastBusLookupKey = lookupKey;

      if (routeIds.length === 0 && stopIds.length === 0) {
        this.busRoutesById.set(new Map());
        this.busStopsById.set(new Map());
        this.busRoutesByStopId.set(new Map());
        return;
      }

      const subscription = this.http
        .post<{
          data: {
            multipleBusRoutes: Array<{
              routeId: string;
              shortName: string;
              longName: string;
            }>;
            multipleBusStops: Array<{
              stopId: string;
              name: string;
            }>;
          };
        }>('/api/graphql', {
          query: `
            query FavoriteRemovalLookup($routeIds: [ID!]!, $stopIds: [ID!]!) {
              multipleBusRoutes(ids: $routeIds) {
                routeId
                shortName
                longName
              }
              multipleBusStops(ids: $stopIds) {
                stopId
                name
              }
            }
          `,
          variables: {
            routeIds,
            stopIds,
          },
        })
        .pipe(catchError(() => of(null)))
        .subscribe((response) => {
          if (!response) {
            this.busRoutesById.set(new Map());
            this.busStopsById.set(new Map());
            return;
          }

          const routesById = new Map(
            response.data.multipleBusRoutes.map((route) => [
              route.routeId,
              route,
            ]),
          );
          const stopsById = new Map(
            response.data.multipleBusStops.map((stop) => [stop.stopId, stop]),
          );

          this.busRoutesById.set(
            new Map(
              routeIds.map((id) => [
                id,
                routesById.get(id) ?? {
                  routeId: id,
                  shortName: id,
                  longName: 'Linha não encontrada',
                },
              ]),
            ),
          );
          this.busStopsById.set(
            new Map(
              stopIds.map((id) => [
                id,
                stopsById.get(id) ?? {
                  stopId: id,
                  name: id,
                },
              ]),
            ),
          );
          this.pruneBusRouteState(stopIds);
          this.loadRoutesForBusStops(stopIds, lookupKey);
        });

      onCleanup(() => subscription.unsubscribe());
    });

    effect(() => {
      const railLineIds = this.favorites().railLine;

      this.railLinesById.set(
        new Map(
          railLineIds
            .map((id) => {
              const line = id.startsWith('L')
                ? getRailLineById(id)
                : getRailLineByCode(parseInt(id, 10));
              const specialName =
                id === 'EA' || id === '10X'
                  ? CPTM_LINE_CONFIG[id].name
                  : undefined;
              const name = line?.fullName ?? specialName;
              return name ? [id, { id, name }] : undefined;
            })
            .filter((entry): entry is [string, { id: string; name: string }] =>
              Boolean(entry),
            ),
        ),
      );
    });
  }

  removeFavorite(code: string, type: FavoriteTypes): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.favoritesService.removeFavorite(code, type);
  }

  removeRailStationFavorite(station: FavoriteRailStation): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    for (const id of station.favoriteIds) {
      this.favoritesService.removeFavorite(id, 'railStation');
    }
  }

  getRoutesForStop(stopId: string): BusRouteGraphQL[] {
    return this.busRoutesByStopId().get(stopId) ?? [];
  }

  isRailStationLineSelected(
    station: FavoriteRailStation,
    lineId: string,
  ): boolean {
    return this.getSelectedRailStationLineIds(station).includes(lineId);
  }

  isBusStopRouteSelected(stopId: string, route: BusRouteGraphQL): boolean {
    return this.getSelectedBusStopRouteKeys(stopId).includes(
      this.getBusRouteSelectionKey(route),
    );
  }

  toggleRailStationLine(station: FavoriteRailStation, lineId: string): void {
    this.favoritesService.toggleDashboardRailStationLine(station.id, lineId);
  }

  toggleBusStopRoute(stopId: string, route: BusRouteGraphQL): void {
    this.favoritesService.toggleDashboardBusStopRoute(
      stopId,
      this.getBusRouteSelectionKey(route),
    );
  }

  lineTextColor(colorHex: string): string {
    return getContrastColor(colorHex);
  }

  routeColor(route: BusRouteGraphQL): string {
    return normalizeHexColor(route.color, '5f6368');
  }

  routeTextColor(route: BusRouteGraphQL): string {
    return normalizeHexColor(route.textColor, 'ffffff');
  }

  private getSelectedRailStationLineIds(
    station: FavoriteRailStation,
  ): string[] {
    const selectedIds =
      this.favoritesService.dashboardSelections().railStationLines[station.id];

    return selectedIds ?? station.lines.map((line) => line.id);
  }

  private getSelectedBusStopRouteKeys(stopId: string): string[] {
    const selectedKeys =
      this.favoritesService.dashboardSelections().busStopRoutes[stopId];
    const routes = this.getRoutesForStop(stopId);

    return (
      selectedKeys ?? routes.map((route) => this.getBusRouteSelectionKey(route))
    );
  }

  private getBusRouteSelectionKey(route: BusRouteGraphQL): string {
    return route.shortName || route.routeId;
  }

  private pruneBusRouteState(stopIds: string[]): void {
    const currentStopIds = new Set(stopIds);
    this.busRoutesByStopId.set(
      new Map(
        [...this.busRoutesByStopId()].filter(([stopId]) =>
          currentStopIds.has(stopId),
        ),
      ),
    );
  }

  private loadRoutesForBusStops(stopIds: string[], lookupKey: string): void {
    for (const stopId of stopIds) {
      if (this.busRoutesByStopId().has(stopId)) {
        continue;
      }

      this.geographyService
        .getRoutesForStop(stopId)
        .pipe(
          catchError(() => of([])),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((routes) => {
          if (lookupKey !== this.lastBusLookupKey) {
            return;
          }

          const next = new Map(this.busRoutesByStopId());
          next.set(stopId, routes);
          this.busRoutesByStopId.set(next);
        });
    }
  }

  private loadMergedRailStations(): void {
    this.http
      .post<{
        data: {
          mergedRailStations: MergedRailStationFavorite[];
        };
      }>('/api/graphql', {
        query: `
          query MergedRailStationsForFavoriteRemoval {
            mergedRailStations {
              id
              name
              lines
            }
          }
        `,
      })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.mergedRailStations.set(response?.data.mergedRailStations ?? []);
      });
  }

}
