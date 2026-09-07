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
  mergeFavoriteRailLineOptions,
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
  sortBusRoutesByAgency,
  TransitAgency,
} from '@metro/shared/utils';
import { catchError, of, Subscription } from 'rxjs';
import { LineStatusGridComponent } from '../home/components/line-status-grid/line-status-grid.component';
import {
  BusRouteGraphQL,
  BusStopGraphQL,
  GeographyGraphQLService,
} from '../map-main/services/geography-graphql.service';
import { StopArrivalsComponent } from '../map-main/components/stop-arrivals/stop-arrivals.component';
import { NextTrainCardComponent } from '../shared/components/next-train-card/next-train-card.component';

interface BusRouteInsight {
  routeId: string;
  shortName: string;
  longName: string;
  color?: string;
  textColor?: string;
  sourceAgency?: string;
  sourceId?: string;
  supportsRealtime?: boolean;
  fares?: Array<{ price: number; currency: string }>;
}

interface BusStopInsight extends BusStopGraphQL {
  routeShortNames: string[];
}

interface RailStationInsight {
  key: string;
  name: string;
  lineCodes: number[];
  lines: FavoriteRailLineOption[];
}

interface MergedRailStationInsight {
  id: string;
  name: string;
  lines: string[];
}

interface AgencyIdentity {
  name: string;
  iconPath: string | null;
}

interface BusFavoritesLookupResponse {
  data: {
    multipleBusRoutes: BusRouteInsight[];
    multipleBusStops: Array<{
      id: string;
      stopId: string;
      name: string;
      latitude: number;
      longitude: number;
      isSubwayStation: boolean;
      agencies?: string[];
      routeShortNames?: string[];
      sourceAgency?: string;
      sourceId?: string;
      platformCode?: string;
      mergedStopIds?: string[];
    }>;
  };
}

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
  private lastBusLookupKey = '';

  readonly favorites = this.favoritesService.favorites;
  readonly busRoutesById = signal(new Map<string, BusRouteInsight>());
  readonly busStopsById = signal(new Map<string, BusStopInsight>());
  readonly busRoutesByStopId = signal(new Map<string, BusRouteGraphQL[]>());
  readonly mergedRailStations = signal<MergedRailStationInsight[]>([]);
  readonly loadingBusDetails = signal(false);
  readonly lookupError = signal<string | null>(null);

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

        this.addRailStationGroup(groups, groupKey, {
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
      return route.fares.map((fare) => formatBusFare(fare)).join(' · ');
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
    const selectedRouteKeys =
      this.favoritesService.dashboardSelections().busStopRoutes[stopId] ??
      routes.map((route) => this.getBusRouteSelectionKey(route));
    const selectedRouteKeySet = new Set(selectedRouteKeys);

    return routes.filter((route) => selectedRouteKeySet.has(route.routeId));
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
        query: `
          query BusFavoritesLookup($routeIds: [ID!]!, $stopIds: [ID!]!) {
            multipleBusRoutes(ids: $routeIds) {
              routeId
              shortName
              longName
              color
              textColor
              sourceAgency
              sourceId
              supportsRealtime
              fares {
                price
                currency
              }
            }
            multipleBusStops(ids: $stopIds) {
              id
              stopId
              name
              latitude
              longitude
              isSubwayStation
              agencies
              routeShortNames
              sourceAgency
              sourceId
              platformCode
              mergedStopIds
            }
          }
        `,
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
          return;
        }

        const routesById = new Map(
          response.data.multipleBusRoutes.map((route) => [
            route.routeId,
            route,
          ]),
        );
        const stopsById = new Map<string, BusStopInsight>();
        for (const stop of response.data.multipleBusStops) {
          const mappedStop = {
            id: stop.id,
            stopId: stop.stopId,
            name: stop.name,
            latitude: stop.latitude,
            longitude: stop.longitude,
            isSubwayStation: stop.isSubwayStation,
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
                id,
                stopId: id,
                name: id,
                latitude: 0,
                longitude: 0,
                isSubwayStation: false,
                routeShortNames: [],
              },
            ]),
          ),
        );
        this.pruneBusRouteState(stopIds);
        this.loadRoutesForBusStops(stopIds, lookupKey);
      });
  }

  private loadMergedRailStations(): void {
    this.http
      .post<{
        data: {
          mergedRailStations: MergedRailStationInsight[];
        };
      }>('/api/graphql', {
        query: `
          query MergedRailStationsForInsights {
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

  private addRailStationGroup(
    groups: Map<string, RailStationInsight>,
    key: string,
    station: RailStationInsight,
  ): void {
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        ...station,
        lineCodes: sortRailLineCodes(station.lineCodes),
      });
      return;
    }

    groups.set(key, {
      ...existing,
      lineCodes: sortRailLineCodes([
        ...new Set([...existing.lineCodes, ...station.lineCodes]),
      ]),
      lines: mergeFavoriteRailLineOptions(existing.lines, station.lines),
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
        });
    }
  }

  private getBusRouteSelectionKey(route: BusRouteGraphQL): string {
    return route.routeId;
  }

  private isTransitAgency(value: string): value is TransitAgency {
    return Object.values(TransitAgency).includes(value as TransitAgency);
  }
}
