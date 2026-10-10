import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
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
  AGENCIES_DATA,
  FavoriteTypes,
  createFavoriteRailLineOptions,
  getContrastColor,
  getAgencyIconPath,
  getRouteAgency,
  getRailLineByCode,
  getRailLineById,
  getRailStationIdentityFromFavoriteKey,
  getRailStationIdentityKey,
  normalizeHexColor,
  toTitleCase,
  CPTM_LINE_CONFIG,
  getBusStopDisplayId,
  formatBusFare,
  getBusStopIdentityAliases,
  encodeBusLineFavorite,
  isBusDirectionFavorite,
  isBusLineFavorite,
  matchBusDirectionFavorite,
  parseBusDirectionFavorite,
  parseBusLineFavorite,
  isArtespRoute,
  sortBusRoutesByAgency,
  TransitAgency,
} from '@metro/shared/utils';
import { catchError, of } from 'rxjs';
import { BikeStationsService } from '../map-main/geography/bike-stations.service';
import {
  BusRouteGraphQL,
  GeographyGraphQLService,
} from '../map-main/geography/geography-graphql.service';
import type {
  AgencyIdentity,
  FavoriteBusLookupResponse,
  FavoriteBusRoute,
  FavoriteBusStop,
  FavoriteRailStation,
  MergedRailStationFavorite,
} from './favorites.types';
import {
  FAVORITE_REMOVAL_LOOKUP_QUERY,
  MERGED_RAIL_STATIONS_FOR_REMOVAL_QUERY,
} from './favorites.queries';

@Component({
  selector: 'app-favorites',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatTooltipModule,
    NgOptimizedImage,
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
  readonly busRoutesById = signal(new Map<string, FavoriteBusRoute>());
  readonly busStopsById = signal(new Map<string, FavoriteBusStop>());
  readonly busRoutesByStopId = signal(new Map<string, BusRouteGraphQL[]>());
  readonly railLinesById = signal(
    new Map<string, { id: string; name: string }>(),
  );
  readonly mergedRailStations = signal<MergedRailStationFavorite[]>([]);

  readonly busRoutes = computed(() =>
    sortBusRoutesByAgency([...this.busRoutesById().values()]),
  );
  readonly busStops = computed(() => [...this.busStopsById().values()]);
  readonly railLines = computed(() => [...this.railLinesById().values()]);
  readonly syncError = this.favoritesService.syncError;

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
        .post<FavoriteBusLookupResponse>('/api/graphql', {
          query: FAVORITE_REMOVAL_LOOKUP_QUERY,
          variables: {
            routeIds,
            stopIds,
          },
        })
        .pipe(catchError(() => of(null)))
        .subscribe((response) => {
          if (lookupKey !== this.lastBusLookupKey) {
            return;
          }

          if (!response) {
            this.busRoutesById.set(
              new Map(
                routeIds.map((id) => [
                  id,
                  this.missingFavoriteBusRoute(id),
                ]),
              ),
            );
            this.busStopsById.set(
              new Map(
                stopIds.map((id) => [
                  id,
                  { stopId: id, name: id, favoriteId: id },
                ]),
              ),
            );
            return;
          }

          const routeResults = response.errors?.length
            ? []
            : (response.data?.multipleBusRoutes ?? []);
          const stopsById = new Map<
            string,
            {
              stopId: string;
              name: string;
              sourceId?: string;
              platformCode?: string;
              mergedStopIds?: string[];
            }
          >();
          for (const stop of response.data?.multipleBusStops ?? []) {
            for (const alias of getBusStopIdentityAliases(stop)) {
              stopsById.set(alias, stop);
            }
          }

          this.busStopsById.set(
            new Map(
              stopIds.map((id) => {
                const stop = stopsById.get(id);
                return [
                  id,
                  stop
                    ? { ...stop, favoriteId: id }
                    : { stopId: id, name: id, favoriteId: id },
                ];
              }),
            ),
          );
          this.pruneBusRouteState(stopIds);
          this.loadRoutesForBusStops(stopIds, lookupKey);
          void this.resolveFavoriteBusRoutes(routeIds, routeResults, lookupKey);
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

  retryFavoriteSync(): void {
    void this.favoritesService.retryFailedFavoriteSync();
  }

  discardFailedFavoriteSync(): void {
    void this.favoritesService.discardFailedFavoriteSync();
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
    return sortBusRoutesByAgency(this.busRoutesByStopId().get(stopId) ?? []);
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
    const selectedKeys = this.getSelectedBusStopRouteKeys(stopId);
    const routeKey = this.getBusRouteSelectionKey(route);
    this.favoritesService.setDashboardBusStopRoutes(
      stopId,
      selectedKeys.includes(routeKey)
        ? selectedKeys.filter((key) => key !== routeKey)
        : [...selectedKeys, routeKey],
    );
  }

  lineTextColor(colorHex: string): string {
    return getContrastColor(colorHex);
  }

  routeColor(route: { color?: string }): string {
    return normalizeHexColor(route.color, '5f6368');
  }

  routeTextColor(route: { textColor?: string }): string {
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
    const selections =
      this.favoritesService.dashboardSelections().busStopRoutes;
    const aliasIds = this.favorites().busStop.filter(
      (favoriteId) =>
        favoriteId !== stopId &&
        this.busStopsById().get(favoriteId)?.stopId === stopId,
    );
    const hasSavedSelection =
      selections[stopId] !== undefined ||
      aliasIds.some((favoriteId) => selections[favoriteId] !== undefined);
    const selectedKeys =
      selections[stopId] ??
      aliasIds.flatMap((favoriteId) => selections[favoriteId] ?? []);
    const routes = this.getRoutesForStop(stopId);

    if (!hasSavedSelection) {
      return routes.map((route) => this.getBusRouteSelectionKey(route));
    }

    const resolvedKeys = new Set<string>();
    for (const selectedKey of selectedKeys) {
      const selectedRoutes = isBusDirectionFavorite(selectedKey)
        ? this.getRoutesMatchingBusDirectionFavorite(selectedKey, routes)
        : routes.filter((route) => route.routeId === selectedKey);
      if (selectedRoutes.length === 0) {
        resolvedKeys.add(selectedKey);
        continue;
      }
      for (const route of selectedRoutes) {
        resolvedKeys.add(this.getBusRouteSelectionKey(route));
      }
    }
    return [...resolvedKeys];
  }

  private getBusRouteSelectionKey(route: BusRouteGraphQL): string {
    return route.favoriteCode ?? route.routeId;
  }

  private getRoutesMatchingBusDirectionFavorite(
    code: string,
    routes: BusRouteGraphQL[],
  ): BusRouteGraphQL[] {
    const candidates = routes.flatMap((route) => {
      const identity = parseBusDirectionFavorite(route.favoriteCode ?? '');
      if (!identity || route.directionId === undefined) {
        return [];
      }
      return [
        {
          ...identity,
          directionId: route.directionId,
          destination: route.destination ?? route.longName,
          sourceAgency: identity.sourceAgency,
          shortName: identity.shortName,
          route,
        },
      ];
    });
    const match = matchBusDirectionFavorite(code, candidates);
    return match ? [match.route] : [];
  }

  private async resolveFavoriteBusRoutes(
    routeIds: string[],
    routes: FavoriteBusRoute[],
    lookupKey: string,
  ): Promise<void> {
    const routesByFavoriteCode = new Map<string, FavoriteBusRoute>();
    const routesByRequestedCode = new Map<string, FavoriteBusRoute[]>();
    for (const route of routes) {
      const favoriteCode = route.favoriteCode ?? route.routeId;
      routesByFavoriteCode.set(favoriteCode, route);

      const requestedCode = route.requestedCode ?? route.routeId;
      const requestedRoutes = routesByRequestedCode.get(requestedCode) ?? [];
      requestedRoutes.push(route);
      routesByRequestedCode.set(requestedCode, requestedRoutes);
    }

    const migratedLegacyCodes = new Set<string>();
    const preservedLineCodeByRequest = new Map<string, string>();
    for (const code of routeIds) {
      if (lookupKey !== this.lastBusLookupKey) {
        return;
      }
      if (isBusDirectionFavorite(code)) {
        continue;
      }

      const directions = routesByRequestedCode.get(code) ?? [];
      const directionCodes = directions.flatMap((route) =>
        route.favoriteCode && isBusDirectionFavorite(route.favoriteCode)
          ? [route.favoriteCode]
          : [],
      );
      if (directions.length === 0 || directionCodes.length !== directions.length) {
        continue;
      }

      try {
        const uniqueDirectionCodes = Array.from(new Set(directionCodes));
        const currentFavorites = new Set(this.favorites().busRoute);
        const alreadyExpanded =
          !currentFavorites.has(code) &&
          uniqueDirectionCodes.every((directionCode) =>
            currentFavorites.has(directionCode),
          );
        let migrated = alreadyExpanded;
        if (!alreadyExpanded && uniqueDirectionCodes.length >= 2) {
          migrated = await this.favoritesService.migrateBusRouteFavorite(
            code,
            uniqueDirectionCodes,
          );
        }

        if (migrated) {
          migratedLegacyCodes.add(code);
          continue;
        }

        const anchor = uniqueDirectionCodes[0];
        if (!anchor) {
          continue;
        }
        let preservedCode = isBusLineFavorite(code) ? code : null;
        if (!preservedCode) {
          const encodedLineCode = encodeBusLineFavorite(anchor);
          if (!encodedLineCode) {
            continue;
          }
          const preserved = await this.favoritesService.preserveBusLineFavorite(
            code,
            anchor,
          );
          const favoritesAfter = new Set(this.favorites().busRoute);
          if (preserved || favoritesAfter.has(encodedLineCode)) {
            preservedCode = encodedLineCode;
          }
        }
        if (preservedCode) {
          preservedLineCodeByRequest.set(code, preservedCode);
        }
      } catch {
        // Keep the whole-line favorite while its direction migration retries.
      }
    }

    if (lookupKey !== this.lastBusLookupKey) {
      return;
    }

    const nextRoutes = new Map<string, FavoriteBusRoute>();
    for (const code of routeIds) {
      if (isBusDirectionFavorite(code)) {
        const route = routesByFavoriteCode.get(code);
        nextRoutes.set(
          code,
          route
            ? { ...route, favoriteCode: code }
            : this.missingFavoriteBusRoute(code),
        );
        continue;
      }

      if (migratedLegacyCodes.has(code)) {
        for (const route of routesByRequestedCode.get(code) ?? []) {
          const favoriteCode = route.favoriteCode;
          if (favoriteCode && isBusDirectionFavorite(favoriteCode)) {
            nextRoutes.set(favoriteCode, { ...route, favoriteCode });
          }
        }
        continue;
      }

      const preservedCode = preservedLineCodeByRequest.get(code);
      const unresolvedRoute = routesByRequestedCode.get(code)?.[0];
      if (unresolvedRoute) {
        const lineFavoriteCode = preservedCode ?? code;
        nextRoutes.set(lineFavoriteCode, {
          ...unresolvedRoute,
          favoriteCode: undefined,
          favoriteId: lineFavoriteCode,
          favoriteNotice:
            'Os sentidos desta linha ainda não puderam ser separados.',
        });
        continue;
      }

      nextRoutes.set(
        preservedCode ?? code,
        this.missingFavoriteBusRoute(preservedCode ?? code),
      );
    }

    this.busRoutesById.set(nextRoutes);
  }

  private missingFavoriteBusRoute(code: string): FavoriteBusRoute {
    const identity =
      parseBusDirectionFavorite(code) ?? parseBusLineFavorite(code);
    const direction = parseBusDirectionFavorite(code);
    return {
      routeId: code,
      favoriteId: code,
      favoriteCode: direction ? code : undefined,
      shortName: identity?.shortName ?? code,
      sourceAgency: identity?.sourceAgency,
      longName: direction ? 'Sentido não encontrado' : 'Linha não encontrada',
    };
  }

  private isTransitAgency(value: string): value is TransitAgency {
    return Object.values(TransitAgency).includes(value as TransitAgency);
  }

  routeFareLabel(
    route:
      | BusRouteGraphQL
      | {
          routeId: string;
          sourceAgency?: string;
          fares?: Array<{ price: number; currency: string }>;
        },
  ): string | null {
    if (route.fares && route.fares.length > 0) {
      return route.fares.map((fare) => formatBusFare(fare)).join(', ');
    }

    return isArtespRoute(route) ? 'Tarifa não informada' : null;
  }

  stopDisplayId(stop: { stopId: string; sourceId?: string }): string {
    return getBusStopDisplayId(stop);
  }

  agencyIdentity(route: {
    routeId: string;
    shortName?: string;
    sourceAgency?: string;
  }): AgencyIdentity | null {
    let agency: TransitAgency | undefined;
    const sourceAgency = route.sourceAgency?.trim().toLowerCase();

    if (isArtespRoute({ routeId: route.routeId, sourceAgency })) {
      agency = TransitAgency.ARTESP;
    } else if (sourceAgency && this.isTransitAgency(sourceAgency)) {
      agency = sourceAgency;
    } else if (!sourceAgency) {
      agency = route.shortName ? getRouteAgency(route.shortName) : undefined;
      if (!agency) {
        agency = TransitAgency.SPTRANS;
      }
    }

    if (agency) {
      return {
        name: AGENCIES_DATA[agency].shortName,
        iconPath: getAgencyIconPath(agency),
      };
    }

    return sourceAgency
      ? { name: sourceAgency.toUpperCase(), iconPath: null }
      : null;
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
      const resolvedStopId = this.busStopsById().get(stopId)?.stopId ?? stopId;
      if (
        this.busRoutesByStopId().has(stopId) ||
        this.busRoutesByStopId().has(resolvedStopId)
      ) {
        const cachedRoutes =
          this.busRoutesByStopId().get(stopId) ??
          this.busRoutesByStopId().get(resolvedStopId) ??
          [];
        void this.favoritesService.migrateDashboardBusStopRoutes(
          resolvedStopId,
          cachedRoutes,
          resolvedStopId === stopId ? [] : [stopId],
        );
        continue;
      }

      this.geographyService
        .getRoutesForStop(resolvedStopId)
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
          next.set(resolvedStopId, routes);
          this.busRoutesByStopId.set(next);
          void this.favoritesService.migrateDashboardBusStopRoutes(
            resolvedStopId,
            routes,
            resolvedStopId === stopId ? [] : [stopId],
          );
        });
    }
  }

  private loadMergedRailStations(): void {
    this.http
      .post<{ data: { mergedRailStations: MergedRailStationFavorite[] } }>(
        '/api/graphql',
        {
          query: MERGED_RAIL_STATIONS_FOR_REMOVAL_QUERY,
        },
      )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.mergedRailStations.set(response?.data.mergedRailStations ?? []);
      });
  }
}
