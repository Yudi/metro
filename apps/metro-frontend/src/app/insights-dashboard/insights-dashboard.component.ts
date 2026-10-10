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
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '@metro/shared/api';
import {
  AGENCIES_DATA,
  FavoriteRailLineOption,
  createFavoriteRailLineOptions,
  getContrastColor,
  getAgencyIconPath,
  getRouteAgency,
  getRailLineFavorites,
  getRailLineByCode,
  getRailStationIdentityKey,
  getRailStationIdentityFromFavoriteKey,
  hasFetchableNextTrain,
  normalizeHexColor,
  sortRailLineCodes,
  toTitleCase,
  ExtendedNextTrainLineCode,
  uniqueIds,
  formatBusFare,
  getBusStopDisplayId,
  getBusRouteDisplayId,
  getBusStopIdentityAliases,
  isArtespRoute,
  encodeBusLineFavorite,
  isBusDirectionFavorite,
  isBusLineFavorite,
  matchBusDirectionFavorite,
  parseBusDirectionFavorite,
  parseBusLineFavorite,
  sortBusRoutesByAgency,
  TransitAgency,
} from '@metro/shared/utils';
import { catchError, of, Subscription } from 'rxjs';
import { LineStatusGridComponent } from '../home/components/line-status-grid/line-status-grid.component';
import {
  BusRouteGraphQL,
  GeographyGraphQLService,
} from '../map-main/geography/geography-graphql.service';
import { StopArrivalsComponent } from '../map-main/components/stop-arrivals/stop-arrivals.component';
import { NextTrainCardComponent } from '../next-train/components/next-train-card/next-train-card.component';
import { CityContextService } from '../cities/city-context.service';
import type {
  AgencyIdentity,
  BusFavoritesLookupResponse,
  BusRouteInsight,
  BusStopInsight,
  MergedRailStationInsight,
  RailStationInsight,
} from './insights-dashboard.types';
import {
  BUS_FAVORITES_LOOKUP_QUERY,
  MERGED_RAIL_STATIONS_QUERY,
} from './insights-dashboard.queries';
import { addRailStationGroup } from './insights-dashboard.utils';

@Component({
  selector: 'app-insights-dashboard',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
    LineStatusGridComponent,
    NextTrainCardComponent,
    StopArrivalsComponent,
    NgOptimizedImage,
  ],
  templateUrl: './insights-dashboard.component.html',
  styleUrl: './insights-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InsightsDashboardComponent {
  private readonly favoritesService = inject(FavoritesService);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly geographyService = inject(GeographyGraphQLService);
  readonly cityContext = inject(CityContextService);
  private lastBusLookupKey = '';

  readonly favorites = this.favoritesService.favorites;
  readonly busRoutesById = signal(new Map<string, BusRouteInsight>());
  readonly busStopsById = signal(new Map<string, BusStopInsight>());
  readonly busRoutesByStopId = signal(new Map<string, BusRouteGraphQL[]>());
  readonly mergedRailStations = signal<MergedRailStationInsight[]>([]);
  readonly loadingBusDetails = signal(false);
  readonly lookupError = signal<string | null>(null);

  cityPath(path = ''): string {
    return this.cityContext.path(path);
  }

  readonly busRoutes = computed(() =>
    sortBusRoutesByAgency([...this.busRoutesById().values()]),
  );
  readonly busStops = computed(() => [...this.busStopsById().values()]);

  readonly railStations = computed(() => {
    const groups = new Map<string, RailStationInsight>();
    const mergedByName = new Map(
      this.mergedRailStations().map((station) => [
        getRailStationIdentityKey(station.name),
        station,
      ]),
    );

    for (const id of uniqueIds(this.favorites().railStation)) {
      const stableIdentity = getRailStationIdentityFromFavoriteKey(id);

      if (stableIdentity) {
        const mergedStation = mergedByName.get(stableIdentity);
        const groupKey = id;
        const stationName = toTitleCase(mergedStation?.name ?? stableIdentity);
        const lines = createFavoriteRailLineOptions(
          mergedStation?.lines ?? [],
          stationName,
        );

        addRailStationGroup(groups, groupKey, {
          key: groupKey,
          name: stationName,
          lineCodes: sortRailLineCodes(lines.map((line) => line.lineCode)),
          lines,
        });
        continue;
      }
    }

    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly railLineFavorites = computed(() =>
    getRailLineFavorites(this.favorites().railLine),
  );

  readonly specialRailLineFavoriteCodes = computed(() =>
    uniqueIds(this.favorites().railLine).filter(
      (code) => code === 'EA' || code === '10X',
    ),
  );

  readonly railStatusCodes = computed(() => {
    const codes = new Set<number>();

    for (const line of this.railLineFavorites()) {
      codes.add(line.code);
    }

    for (const station of this.railStations()) {
      for (const line of this.getSelectedRailLines(station)) {
        codes.add(line.lineCode);
      }
    }

    return sortRailLineCodes([...codes]);
  });

  readonly railIssueStatusCodes = computed(() => {
    const regularCodes = new Set(this.railStatusCodes());
    const issueCodes = new Set<number>();

    for (const station of this.railStations()) {
      for (const line of station.lines) {
        if (!regularCodes.has(line.lineCode)) {
          issueCodes.add(line.lineCode);
        }
      }
    }

    return sortRailLineCodes([...issueCodes]);
  });

  readonly hasRelevantFavorites = computed(
    () =>
      this.favorites().busStop.length > 0 ||
      this.favorites().busRoute.length > 0 ||
      this.favorites().railStation.length > 0 ||
      this.favorites().railLine.length > 0,
  );

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadMergedRailStations();
    }

    effect((onCleanup) => {
      if (!isPlatformBrowser(this.platformId)) {
        return;
      }

      const routeIds = uniqueIds(this.favorites().busRoute);
      const stopIds = uniqueIds(this.favorites().busStop);
      const lookupKey = JSON.stringify({ routeIds, stopIds });

      if (lookupKey === this.lastBusLookupKey) {
        return;
      }

      this.lastBusLookupKey = lookupKey;

      if (routeIds.length === 0 && stopIds.length === 0) {
        this.busRoutesById.set(new Map());
        this.busStopsById.set(new Map());
        this.busRoutesByStopId.set(new Map());
        this.loadingBusDetails.set(false);
        this.lookupError.set(null);
        return;
      }

      const subscription = this.loadBusFavorites(routeIds, stopIds, lookupKey);
      onCleanup(() => subscription.unsubscribe());
    });
  }

  routeFareLabel(route: BusRouteInsight | BusRouteGraphQL): string | null {
    if (route.fares && route.fares.length > 0) {
      return route.fares.map((fare) => formatBusFare(fare)).join(', ');
    }

    return isArtespRoute(route) ? 'Tarifa não informada' : null;
  }

  stopDisplayId(stop: BusStopInsight): string {
    return getBusStopDisplayId(stop);
  }

  routeDisplayId(route: BusRouteInsight): string {
    return getBusRouteDisplayId(route);
  }

  routeColor(route: { color?: string }): string {
    return normalizeHexColor(route.color, '5f6368');
  }

  routeTextColor(route: { textColor?: string }): string {
    return normalizeHexColor(route.textColor, 'ffffff');
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

  lineName(code: number): string {
    return getRailLineByCode(code)?.fullName ?? `Linha ${code}`;
  }

  lineColor(code: number): string {
    return getRailLineByCode(code)?.colorHex ?? '#5f6368';
  }

  lineTextColor(code: number): string {
    return getContrastColor(this.lineColor(code));
  }

  visibleRoutes(routes: string[]): string[] {
    return routes.slice(0, 5);
  }

  hiddenRouteCount(routes: string[]): number {
    return Math.max(routes.length - 5, 0);
  }

  getRoutesForStop(stopId: string): BusRouteGraphQL[] {
    return sortBusRoutesByAgency(this.busRoutesByStopId().get(stopId) ?? []);
  }

  getSelectedBusRoutes(stopId: string): BusRouteGraphQL[] {
    const routes = this.getRoutesForStop(stopId);
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
    const savedKeys =
      selections[stopId] ??
      aliasIds.flatMap((favoriteId) => selections[favoriteId] ?? []);
    const selectedRouteKeys = hasSavedSelection
      ? savedKeys
      : routes.map((route) => this.getBusRouteSelectionKey(route));
    const selectedRouteKeySet = new Set(selectedRouteKeys);

    return routes.filter(
      (route) =>
        selectedRouteKeySet.has(this.getBusRouteSelectionKey(route)) ||
        selectedRouteKeySet.has(route.routeId) ||
        this.hasMatchingSavedDirection(route, selectedRouteKeys, routes),
    );
  }

  getSelectedBusRouteKeys(stopId: string): string[] {
    return this.getSelectedBusRoutes(stopId).map((route) =>
      this.getBusRouteSelectionKey(route),
    );
  }

  getSelectedRailLines(station: RailStationInsight): FavoriteRailLineOption[] {
    const selectedLineIds =
      this.favoritesService.dashboardSelections().railStationLines[
        station.key
      ] ?? station.lines.map((line) => line.id);
    const selectedLineIdSet = new Set(selectedLineIds);

    return station.lines.filter((line) => selectedLineIdSet.has(line.id));
  }

  hasNextTrain(line: FavoriteRailLineOption): line is FavoriteRailLineOption & {
    stationCode: string;
    nextTrainLineCode: ExtendedNextTrainLineCode;
  } {
    return hasFetchableNextTrain(line);
  }

  private loadBusFavorites(
    routeIds: string[],
    stopIds: string[],
    lookupKey: string,
  ): Subscription {
    this.loadingBusDetails.set(true);
    this.lookupError.set(null);

    return this.http
      .post<BusFavoritesLookupResponse>('/api/graphql', {
        query: BUS_FAVORITES_LOOKUP_QUERY,
        variables: {
          routeIds,
          stopIds,
        },
      })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        if (lookupKey !== this.lastBusLookupKey) {
          return;
        }

        this.loadingBusDetails.set(false);

        if (!response) {
          this.lookupError.set('Não foi possível carregar todos os favoritos.');
          this.busRoutesById.set(
            new Map(
              routeIds.map((id) => [
                id,
                {
                  ...this.missingFavoriteBusRoute(id),
                },
              ]),
            ),
          );
          this.busStopsById.set(
            new Map(
              stopIds.map((id) => [
                id,
                { stopId: id, name: id, routeShortNames: [] },
              ]),
            ),
          );
          return;
        }

        if (response.errors?.length) {
          this.lookupError.set('Não foi possível carregar todos os favoritos.');
        }
        const routeResults = response.errors?.length
          ? []
          : (response.data?.multipleBusRoutes ?? []);
        const stopsById = new Map<string, BusStopInsight>();
        for (const stop of response.data?.multipleBusStops ?? []) {
          const mappedStop = {
            stopId: stop.stopId,
            name: stop.name,
            agencies: stop.agencies,
            routeShortNames: stop.routeShortNames ?? [],
            sourceAgency: stop.sourceAgency,
            sourceId: stop.sourceId,
            platformCode: stop.platformCode,
            mergedStopIds: stop.mergedStopIds,
          } satisfies BusStopInsight;
          for (const alias of getBusStopIdentityAliases(mappedStop)) {
            stopsById.set(alias, mappedStop);
          }
        }

        this.busStopsById.set(
          new Map(
            stopIds.map((id) => [
              id,
              stopsById.get(id) ?? {
                stopId: id,
                name: id,
                routeShortNames: [],
              },
            ]),
          ),
        );
        this.pruneBusRouteState(stopIds);
        this.loadRoutesForBusStops(stopIds, lookupKey);
        void this.resolveFavoriteBusRoutes(routeIds, routeResults, lookupKey);
      });
  }

  private loadMergedRailStations(): void {
    this.http
      .post<{
        data: {
          mergedRailStations: MergedRailStationInsight[];
        };
      }>('/api/graphql', {
        query: MERGED_RAIL_STATIONS_QUERY,
      })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.mergedRailStations.set(response?.data.mergedRailStations ?? []);
      });
  }

  private pruneBusRouteState(stopIds: string[]): void {
    const currentStopIds = new Set(stopIds);
    const nextRoutesByStopId = new Map(
      [...this.busRoutesByStopId()].filter(([stopId]) =>
        currentStopIds.has(stopId),
      ),
    );

    this.busRoutesByStopId.set(nextRoutesByStopId);
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

          const nextRoutes = new Map(this.busRoutesByStopId());
          nextRoutes.set(stopId, routes);
          nextRoutes.set(resolvedStopId, routes);
          this.busRoutesByStopId.set(nextRoutes);
          void this.favoritesService.migrateDashboardBusStopRoutes(
            resolvedStopId,
            routes,
            resolvedStopId === stopId ? [] : [stopId],
          );
        });
    }
  }

  private getBusRouteSelectionKey(route: BusRouteGraphQL): string {
    return route.favoriteCode ?? route.routeId;
  }

  private hasMatchingSavedDirection(
    route: BusRouteGraphQL,
    savedKeys: string[],
    routes: BusRouteGraphQL[],
  ): boolean {
    const candidates = routes.flatMap((currentRoute) => {
      const identity = parseBusDirectionFavorite(
        currentRoute.favoriteCode ?? '',
      );
      if (!identity || currentRoute.directionId === undefined) {
        return [];
      }
      return [
        {
          ...identity,
          directionId: currentRoute.directionId,
          destination: currentRoute.destination ?? currentRoute.longName,
          sourceAgency: identity.sourceAgency,
          shortName: identity.shortName,
          route: currentRoute,
        },
      ];
    });
    return savedKeys.some((key) => {
      if (!isBusDirectionFavorite(key)) {
        return false;
      }
      return matchBusDirectionFavorite(key, candidates)?.route === route;
    });
  }

  private async resolveFavoriteBusRoutes(
    routeIds: string[],
    routes: BusRouteInsight[],
    lookupKey: string,
  ): Promise<void> {
    const routesByFavoriteCode = new Map<string, BusRouteInsight>();
    const routesByRequestedCode = new Map<string, BusRouteInsight[]>();
    for (const route of routes) {
      routesByFavoriteCode.set(route.favoriteCode ?? route.routeId, route);
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

    const nextRoutes = new Map<string, BusRouteInsight>();
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

  private missingFavoriteBusRoute(code: string): BusRouteInsight {
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
}
