import * as dashboardPresentation from './dashboard-presentation';
import { DashboardApiService } from './dashboard-api.service';
import type {
  BusRouteInsight,
  BusRouteGraphQL,
  BusStopInsight,
  BusFavoritesLookupResponse,
  MergedRailStationInsight,
  RailStationInsight,
  RailNextTrainGroup,
} from './dashboard.types';
import { DatePipe, NgOptimizedImage, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DashboardFavoriteSelections,
  FavoritesService,
} from '@metro/shared/api';
import { AuthService, authReady, firebaseUser } from '@metro/shared/firebase';
import {
  FavoriteRailLineOption,
  FavoriteList,
  RailLinesStatusResponse,
  createFavoriteRailLineOptions,
  getRailLineFavorites,
  getRailLineByCode,
  getRailStationIdentityFromFavoriteKey,
  getRailStationIdentityKey,
  getSptransStopCode,
  getBusStopIdentityAliases,
  groupScheduledBusDepartures,
  hasArtespStopData,
  sortBusRoutesByAgency,
  hasFetchableNextTrain,
  sortRailLineCodes,
  toTitleCase,
  uniqueIds,
} from '@metro/shared/utils';
import { firstValueFrom, forkJoin, map, of } from 'rxjs';
import type { LiteScheduledBusDeparture } from '../../shared/search/lite-search.service';
import {
  LiteArrivalLine,
  LiteRealtimeService,
  LiteStopArrivalUpdate,
} from '../../shared/realtime/lite-realtime.service';

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, NgOptimizedImage, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  private readonly favoritesService = inject(FavoritesService);
  private readonly dashboardApi = inject(DashboardApiService);
  private readonly realtimeService = inject(LiteRealtimeService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);
  private favoriteSnapshotKey = '';
  private refreshQueued = false;

  readonly loading = signal(false);
  readonly authReady = authReady;
  readonly firebaseUser = firebaseUser;
  readonly authOperationPending = signal(false);
  readonly authError = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly lastLoadedAt = signal<Date | null>(null);
  readonly favorites = signal<FavoriteList | null>(null);
  readonly dashboardSelections = signal<DashboardFavoriteSelections | null>(
    null,
  );
  readonly busRoutesById = signal(new Map<string, BusRouteInsight>());
  readonly busStopsById = signal(new Map<string, BusStopInsight>());
  readonly busRoutesByStopId = signal(new Map<string, BusRouteGraphQL[]>());
  readonly busArrivalsByStopId = signal(
    new Map<string, LiteStopArrivalUpdate>(),
  );
  readonly busSchedulesByStopId = signal(
    new Map<string, LiteScheduledBusDeparture[]>(),
  );
  readonly scheduledGroupsByStopId = computed(
    () =>
      new Map(
        [...this.busSchedulesByStopId()].map(([stopId, departures]) => [
          stopId,
          groupScheduledBusDepartures(
            departures.map((departure) => ({
              ...departure,
              timeParts: this.getScheduledDepartureTimeParts(
                departure.departureTime,
              ),
            })),
          ),
        ]),
      ),
  );
  readonly expandedScheduledRoutes = signal<Set<string>>(new Set());
  readonly mergedRailStations = signal<MergedRailStationInsight[]>([]);
  readonly railStatus = signal<RailLinesStatusResponse | null>(null);
  readonly nextTrainGroups = signal<RailNextTrainGroup[]>([]);

  readonly busRoutes = computed(() =>
    sortBusRoutesByAgency([...this.busRoutesById().values()]),
  );
  readonly busStops = computed(() => [...this.busStopsById().values()]);

  readonly hasRelevantFavorites = computed(() => {
    const favorites = this.favorites();

    return Boolean(
      favorites &&
        (favorites.busStop.length > 0 ||
          favorites.busRoute.length > 0 ||
          favorites.railStation.length > 0 ||
          favorites.railLine.length > 0),
    );
  });

  readonly railStations = computed(() => {
    const favorites = this.favorites();
    if (!favorites) {
      return [];
    }

    const groups = new Map<string, RailStationInsight>();
    const mergedByName = new Map(
      this.mergedRailStations().map((station) => [
        getRailStationIdentityKey(station.name),
        station,
      ]),
    );

    for (const id of uniqueIds(favorites.railStation)) {
      const stableIdentity = getRailStationIdentityFromFavoriteKey(id);

      if (!stableIdentity) {
        continue;
      }

      const mergedStation = mergedByName.get(stableIdentity);
      const stationName = toTitleCase(mergedStation?.name ?? stableIdentity);
      const lines = createFavoriteRailLineOptions(
        mergedStation?.lines ?? [],
        stationName,
      );
      groups.set(id, {
        key: id,
        name: stationName,
        lineCodes: sortRailLineCodes(lines.map((line) => line.lineCode)),
        lines,
      });
    }

    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly railLineFavorites = computed(() => {
    const favorites = this.favorites();
    if (!favorites) {
      return [];
    }

    return getRailLineFavorites(favorites.railLine);
  });

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

  readonly favoriteRailStatuses = computed(() => {
    const statusMap = new Map(
      this.railStatus()?.lines.map((line) => [line.code, line]) ?? [],
    );

    return this.railStatusCodes().map((code) => ({
      code,
      line: getRailLineByCode(code),
      status: statusMap.get(code),
    }));
  });

  readonly favoriteSpecialRailStatuses = computed(() => {
    const favoriteCodes = new Set(this.favorites()?.railLine ?? []);
    return (this.railStatus()?.specialLines ?? []).filter((line) =>
      favoriteCodes.has(line.code),
    );
  });

  constructor() {
    effect(() => {
      const favorites = this.favoritesService.favorites();
      const selections = this.favoritesService.dashboardSelections();
      const snapshotKey = JSON.stringify({ favorites, selections });

      this.favorites.set(favorites);
      this.dashboardSelections.set(selections);
      if (
        isPlatformBrowser(this.platformId) &&
        snapshotKey !== this.favoriteSnapshotKey
      ) {
        this.favoriteSnapshotKey = snapshotKey;
        queueMicrotask(() => this.requestDashboardRefresh());
      }
    });
  }

  async refreshDashboard(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const favorites = this.favorites();
      if (!favorites) {
        return;
      }

      if (!this.hasRelevantFavorites()) {
        this.clearRemoteData();
        this.lastLoadedAt.set(new Date());
        return;
      }

      await this.loadDashboardData(favorites);
      this.lastLoadedAt.set(new Date());
    } catch {
      this.error.set('Não foi possível carregar o painel agora.');
    } finally {
      this.loading.set(false);
      if (this.refreshQueued) {
        this.refreshQueued = false;
        queueMicrotask(() => this.requestDashboardRefresh());
      }
    }
  }

  async loginGoogle(): Promise<void> {
    if (this.authOperationPending()) {
      return;
    }

    this.authOperationPending.set(true);
    this.authError.set(null);
    const result = await this.authService.loginGoogle();
    if (!result.success && result.reason === 'failed') {
      this.authError.set(
        'Não foi possível entrar com o Google. Tente novamente.',
      );
    }
    this.authOperationPending.set(false);
  }

  async logout(): Promise<void> {
    if (this.authOperationPending()) {
      return;
    }

    this.authOperationPending.set(true);
    this.authError.set(null);
    const result = await this.authService.logout();
    if (!result.success && result.reason === 'failed') {
      this.authError.set('Não foi possível sair agora. Tente novamente.');
    }
    this.authOperationPending.set(false);
  }

  private requestDashboardRefresh(): void {
    if (this.loading()) {
      this.refreshQueued = true;
      return;
    }

    void this.refreshDashboard();
  }

  getSelectedBusRoutes(stopId: string): BusRouteGraphQL[] {
    const routes = this.busRoutesByStopId().get(stopId) ?? [];
    const selectedRouteKeys =
      this.dashboardSelections()?.busStopRoutes[stopId] ??
      routes.map((route) => this.getBusRouteSelectionKey(route));
    const selectedRouteKeySet = new Set(selectedRouteKeys);

    return routes.filter((route) => selectedRouteKeySet.has(route.routeId));
  }

  getSelectedRailLines(station: RailStationInsight): FavoriteRailLineOption[] {
    const selectedLineIds =
      this.dashboardSelections()?.railStationLines[station.key] ??
      station.lines.map((line) => line.id);
    const selectedLineIdSet = new Set(selectedLineIds);

    return station.lines.filter((line) => selectedLineIdSet.has(line.id));
  }

  readonly routeColor = dashboardPresentation.routeColor;

  readonly routeTextColor = dashboardPresentation.routeTextColor;

  readonly lineName = dashboardPresentation.lineName;

  readonly lineColor = dashboardPresentation.lineColor;

  readonly lineTextColor = dashboardPresentation.lineTextColor;

  readonly formatLineLabel = dashboardPresentation.formatLineLabel;

  readonly formatTrainTime = dashboardPresentation.formatTrainTime;

  getBusArrivalLines(stopId: string): LiteArrivalLine[] {
    return this.busArrivalsByStopId().get(stopId)?.p?.l ?? [];
  }

  readonly getBusDestination = dashboardPresentation.getBusDestination;

  getBusScheduledDepartures(stopId: string): LiteScheduledBusDeparture[] {
    return this.busSchedulesByStopId().get(stopId) ?? [];
  }

  getBusScheduledRouteGroups(stopId: string) {
    return this.scheduledGroupsByStopId().get(stopId) ?? [];
  }

  getVisibleScheduledDepartures<
    T extends {
      routeId: string;
      departureTime: string;
    },
  >(
    stopId: string,
    group: { routeId: string; departures: readonly T[] },
  ): readonly T[] {
    return this.isScheduledRouteExpanded(stopId, group.routeId)
      ? group.departures
      : group.departures.slice(0, 1);
  }

  isScheduledRouteExpanded(stopId: string, routeId: string): boolean {
    return this.expandedScheduledRoutes().has(
      this.getScheduledRouteKey(stopId, routeId),
    );
  }

  getScheduledRouteKey(stopId: string, routeId: string): string {
    return `${stopId}:${routeId}`;
  }

  toggleScheduledRoute(stopId: string, routeId: string): void {
    const key = this.getScheduledRouteKey(stopId, routeId);
    const expanded = new Set(this.expandedScheduledRoutes());
    if (expanded.has(key)) {
      expanded.delete(key);
    } else {
      expanded.add(key);
    }
    this.expandedScheduledRoutes.set(expanded);
  }

  getScheduledRouteToggleLabel(
    stopId: string,
    routeId: string,
    count: number,
  ): string {
    return this.isScheduledRouteExpanded(stopId, routeId)
      ? 'Mostrar menos'
      : `Ver ${count} horários`;
  }

  readonly getScheduledDepartureTimeParts =
    dashboardPresentation.getScheduledDepartureTimeParts;

  getBusRouteForScheduledDeparture(
    stopId: string,
    routeId: string,
  ): BusRouteInsight | BusRouteGraphQL | null {
    return (
      this.busRoutesByStopId()
        .get(stopId)
        ?.find((route) => route.routeId === routeId) ??
      this.busRoutesById().get(routeId) ??
      null
    );
  }

  readonly hasArtespScheduleData = dashboardPresentation.hasArtespScheduleData;

  readonly hasSptransRealtimeData =
    dashboardPresentation.hasSptransRealtimeData;

  readonly formatScheduledDepartureTime =
    dashboardPresentation.formatScheduledDepartureTime;

  readonly getScheduledDepartureKey =
    dashboardPresentation.getScheduledDepartureKey;

  readonly routeFareLabel = dashboardPresentation.routeFareLabel;

  readonly routeDisplayId = dashboardPresentation.routeDisplayId;

  readonly getBusRouteAgencyLabel =
    dashboardPresentation.getBusRouteAgencyLabel;

  readonly getBusRouteAgencyKey = dashboardPresentation.getBusRouteAgencyKey;

  readonly getBusStopAgencies = dashboardPresentation.getBusStopAgencies;

  readonly getAgencyLogoPath = dashboardPresentation.getAgencyLogoPath;

  readonly getMinutesUntilArrival =
    dashboardPresentation.getMinutesUntilArrival;

  readonly statusLabelFormat = dashboardPresentation.statusLabelFormat;

  readonly statusTone = dashboardPresentation.statusTone;

  private async loadDashboardData(favorites: FavoriteList): Promise<void> {
    const routeIds = uniqueIds(favorites.busRoute);
    const stopIds = uniqueIds(favorites.busStop);

    const [busLookup, mergedStations, railStatus] = await firstValueFrom(
      forkJoin([
        this.dashboardApi.fetchBusFavorites(routeIds, stopIds),
        this.dashboardApi.fetchMergedRailStations(),
        this.dashboardApi.fetchRailStatus(),
      ]),
    );

    this.applyBusLookup(routeIds, stopIds, busLookup);
    this.mergedRailStations.set(mergedStations);
    this.railStatus.set(railStatus);

    const [routesByStop, nextTrains] = await firstValueFrom(
      forkJoin([
        this.fetchRoutesForStops(stopIds),
        this.fetchNextTrainsForSelectedStations(),
      ]),
    );
    const arrivalsByStop = await this.fetchBusArrivals(stopIds);
    const schedulesByStop = await this.fetchBusSchedules(stopIds);

    this.busRoutesByStopId.set(routesByStop);
    this.nextTrainGroups.set(nextTrains);
    this.busArrivalsByStopId.set(arrivalsByStop);
    this.busSchedulesByStopId.set(schedulesByStop);
  }

  private fetchRoutesForStops(stopIds: string[]) {
    if (stopIds.length === 0) {
      return of(new Map<string, BusRouteGraphQL[]>());
    }

    return forkJoin(
      stopIds.map((stopId) =>
        this.dashboardApi
          .fetchRoutesForStop(this.busStopsById().get(stopId)?.stopId ?? stopId)
          .pipe(
            map((routes) => ({
              stopId,
              resolvedStopId: this.busStopsById().get(stopId)?.stopId ?? stopId,
              routes,
            })),
          ),
      ),
    ).pipe(
      map((entries) => {
        const routesByStop = new Map<string, BusRouteGraphQL[]>();
        for (const entry of entries) {
          routesByStop.set(entry.stopId, entry.routes);
          routesByStop.set(entry.resolvedStopId, entry.routes);
        }
        return routesByStop;
      }),
    );
  }

  private fetchNextTrainsForSelectedStations() {
    const requests = this.railStations().flatMap((station) =>
      this.getSelectedRailLines(station)
        .filter((line) => hasFetchableNextTrain(line))
        .map((line) =>
          this.dashboardApi
            .fetchNextTrains(line.nextTrainLineCode, line.stationCode)
            .pipe(
              map((trains) => ({
                key: `${station.key}:${line.id}`,
                stationName: station.name,
                line,
                trains,
              })),
            ),
        ),
    );

    if (requests.length === 0) {
      return of([]);
    }

    return forkJoin(requests);
  }

  private async fetchBusArrivals(
    stopIds: string[],
  ): Promise<Map<string, LiteStopArrivalUpdate>> {
    const arrivals = await Promise.all(
      stopIds.map(async (stopId) => {
        const stop = this.busStopsById().get(stopId);
        const stopCode = stop ? getSptransStopCode(stop) : null;
        return {
          stopId,
          arrival: stopCode
            ? await this.realtimeService.fetchStopArrivalOnce(stopCode)
            : null,
        };
      }),
    );

    return new Map(
      arrivals
        .filter(
          (
            entry,
          ): entry is { stopId: string; arrival: LiteStopArrivalUpdate } =>
            entry.arrival !== null,
        )
        .map((entry) => [entry.stopId, entry.arrival]),
    );
  }

  private async fetchBusSchedules(
    stopIds: string[],
  ): Promise<Map<string, LiteScheduledBusDeparture[]>> {
    const stopsWithSchedules = stopIds.filter((stopId) => {
      const stop = this.busStopsById().get(stopId);
      return stop ? hasArtespStopData(stop) : false;
    });

    const schedules = await Promise.all(
      stopsWithSchedules.map(async (stopId) => ({
        stopId,
        departures: await this.dashboardApi.fetchScheduledDepartures(stopId),
      })),
    );

    return new Map(schedules.map((entry) => [entry.stopId, entry.departures]));
  }

  private applyBusLookup(
    routeIds: string[],
    stopIds: string[],
    response: BusFavoritesLookupResponse | null,
  ): void {
    const routesById = new Map(
      response?.data?.multipleBusRoutes.map((route) => [
        route.routeId,
        route,
      ]) ?? [],
    );
    const stopsById = new Map<string, BusStopInsight>();
    for (const stop of response?.data?.multipleBusStops ?? []) {
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
  }

  private getBusRouteSelectionKey(route: BusRouteGraphQL): string {
    return route.routeId;
  }

  private clearRemoteData(): void {
    this.busRoutesById.set(new Map());
    this.busStopsById.set(new Map());
    this.busRoutesByStopId.set(new Map());
    this.busArrivalsByStopId.set(new Map());
    this.busSchedulesByStopId.set(new Map());
    this.expandedScheduledRoutes.set(new Set());
    this.mergedRailStations.set([]);
    this.railStatus.set(null);
    this.nextTrainGroups.set([]);
  }
}
