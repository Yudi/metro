import { DatePipe, NgOptimizedImage, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
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
  API_BASE_URL,
  DashboardFavoriteSelections,
  FavoritesService,
} from '@metro/shared/api';
import { AuthService, authReady, firebaseUser } from '@metro/shared/firebase';
import {
  FavoriteRailLineOption,
  ExtendedNextTrainLineCode,
  FavoriteList,
  RailLineStatus,
  RailLinesStatusResponse,
  createFavoriteRailLineOptions,
  formatTransitTime,
  getOlhoVivoDestination,
  getTransitTimeDifferenceMinutes,
  getContrastColor,
  getRailLineFavorites,
  getRailLineByCode,
  getRailStationIdentityFromFavoriteKey,
  getRailStationIdentityKey,
  getSptransStopCode,
  getBusRouteDisplayId,
  getBusStopIdentityAliases,
  groupScheduledBusDepartures,
  hasArtespStopData,
  isArtespRoute,
  formatBusFare,
  formatScheduledBusDepartureTime,
  sortBusRoutesByAgency,
  hasFetchableNextTrain,
  normalizeHexColor,
  sortRailLineCodes,
  toTitleCase,
  uniqueIds,
} from '@metro/shared/utils';
import { catchError, firstValueFrom, forkJoin, map, of } from 'rxjs';
import {
  LiteNextTrainArrival,
  type LiteScheduledBusDeparture,
} from '../../services/lite-search.service';
import {
  LiteArrivalLine,
  LiteRealtimeService,
  LiteStopArrivalUpdate,
} from '../../services/lite-realtime.service';

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

type LiteAgencyKey = 'artesp' | 'sptrans';

interface LiteAgencyDisplay {
  key: LiteAgencyKey | null;
  label: string;
}

interface BusStopInsight {
  id: string;
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
  isSubwayStation: boolean;
  agencies?: string[];
  routeShortNames: string[];
  sourceAgency?: string;
  sourceId?: string;
  platformCode?: string;
  mergedStopIds?: string[];
}

interface BusRouteGraphQL {
  id: string;
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

interface BusFavoritesLookupResponse {
  data?: {
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

interface MergedRailStationInsight {
  id: string;
  name: string;
  lines: string[];
}

interface RailStationInsight {
  key: string;
  name: string;
  lineCodes: number[];
  lines: FavoriteRailLineOption[];
}

interface RailNextTrainGroup {
  key: string;
  stationName: string;
  line: FavoriteRailLineOption;
  trains: LiteNextTrainArrival[];
}

interface RoutesForStopResponse {
  data?: {
    routesForStop: BusRouteGraphQL[];
  };
}

interface RailStatusResponse {
  data?: {
    railLinesStatus: RailLinesStatusResponse;
    railSpecialLinesStatus?: RailLinesStatusResponse['specialLines'];
  };
}

interface NextTrainsResponse {
  data?: {
    nextTrains: { trains: LiteNextTrainArrival[] } | null;
  };
}

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, NgOptimizedImage, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  private readonly favoritesService = inject(FavoritesService);
  private readonly http = inject(HttpClient);
  private readonly realtimeService = inject(LiteRealtimeService);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);
  private readonly graphqlEndpoint = `${this.baseUrl}/graphql`;
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

  routeColor(route: BusRouteInsight | BusRouteGraphQL): string {
    return normalizeHexColor(route.color, '475569');
  }

  routeTextColor(route: BusRouteInsight | BusRouteGraphQL): string {
    return normalizeHexColor(route.textColor, 'ffffff');
  }

  lineName(code: number): string {
    return getRailLineByCode(code)?.fullName ?? `Linha ${code}`;
  }

  lineColor(code: number): string {
    return getRailLineByCode(code)?.colorHex ?? '#475569';
  }

  lineTextColor(code: number): string {
    return getContrastColor(this.lineColor(code));
  }

  formatLineLabel(line: FavoriteRailLineOption): string {
    return `L${line.lineCode}`;
  }

  formatTrainTime(value: string): string {
    return formatTransitTime(value, { locale: 'pt-BR' });
  }

  getBusArrivalLines(stopId: string): LiteArrivalLine[] {
    return this.busArrivalsByStopId().get(stopId)?.p?.l ?? [];
  }

  getBusDestination(line: LiteArrivalLine): string {
    return getOlhoVivoDestination(line);
  }

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

  getScheduledDepartureTimeParts(departureTime: string): {
    time: string;
    day: string | null;
  } {
    const label = this.formatScheduledDepartureTime(departureTime);
    const separatorIndex = label.indexOf(' · ');
    return separatorIndex >= 0
      ? {
          time: label.slice(0, separatorIndex),
          day: label.slice(separatorIndex + 3),
        }
      : { time: label, day: null };
  }

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

  hasArtespScheduleData(stop: BusStopInsight): boolean {
    return hasArtespStopData(stop);
  }

  hasSptransRealtimeData(stop: BusStopInsight): boolean {
    return getSptransStopCode(stop) !== null;
  }

  formatScheduledDepartureTime(departureTime: string): string {
    return formatScheduledBusDepartureTime(departureTime);
  }

  getScheduledDepartureKey(departure: LiteScheduledBusDeparture): string {
    return `${departure.routeId}:${departure.tripId}:${departure.directionId}:${departure.departureTime}`;
  }

  routeFareLabel(route: BusRouteInsight | BusRouteGraphQL): string | null {
    if (route.fares && route.fares.length > 0) {
      return route.fares.map((fare) => formatBusFare(fare)).join(' · ');
    }

    return isArtespRoute(route) ? 'Tarifa não informada' : null;
  }

  routeDisplayId(route: BusRouteInsight): string {
    return getBusRouteDisplayId(route);
  }

  getBusRouteAgencyLabel(route: BusRouteInsight | BusRouteGraphQL): string {
    const agency = route.sourceAgency?.trim().toLowerCase();
    if (agency === 'artesp' || isArtespRoute(route)) {
      return 'Artesp';
    }
    if (agency === 'sptrans' || !agency) {
      return 'SPTrans';
    }
    return agency.toUpperCase();
  }

  getBusRouteAgencyKey(
    route: BusRouteInsight | BusRouteGraphQL,
  ): LiteAgencyKey | null {
    const agency = route.sourceAgency?.trim().toLowerCase();
    if (agency === 'artesp' || isArtespRoute(route)) {
      return 'artesp';
    }
    if (agency === 'sptrans' || !agency) {
      return 'sptrans';
    }
    return null;
  }

  getBusStopAgencies(stop: BusStopInsight): LiteAgencyDisplay[] {
    const sourceAgency = stop.sourceAgency?.trim();
    const normalizedAgency = sourceAgency?.toLowerCase();
    const listedAgencies = (stop.agencies ?? []).map((agency) =>
      agency.trim().toLowerCase(),
    );
    const hasArtesp =
      normalizedAgency === 'artesp' ||
      listedAgencies.includes('artesp') ||
      (stop.mergedStopIds ?? []).some((id) => /^artesp[:/]/i.test(id));
    const hasSptrans =
      normalizedAgency === 'sptrans' || listedAgencies.includes('sptrans');
    const agencies: LiteAgencyDisplay[] = [];

    if (hasSptrans) {
      agencies.push({ key: 'sptrans', label: 'SPTrans' });
    }
    if (hasArtesp) {
      agencies.push({ key: 'artesp', label: 'Artesp' });
    }
    if (
      agencies.length === 0 &&
      sourceAgency &&
      normalizedAgency !== 'sptrans' &&
      normalizedAgency !== 'artesp'
    ) {
      agencies.push({ key: null, label: sourceAgency });
    }

    return agencies;
  }

  getAgencyLogoPath(agency: LiteAgencyKey): string {
    return `/public/shared/agencies/${agency}.svg`;
  }

  getMinutesUntilArrival(arrivalTime: string): string {
    const diffMins = getTransitTimeDifferenceMinutes(arrivalTime);
    if (diffMins === null) {
      return arrivalTime;
    }

    if (diffMins <= 0) {
      return 'Chegando';
    }

    if (diffMins === 1) {
      return 'Em 1 min';
    }

    return `Em ${diffMins} min`;
  }

  statusLabelFormat(statusLabel: string): string {
    switch (statusLabel) {
      case 'Operação Normal':
        return 'Normal';
      case 'Operação Encerrada':
        return 'Encerrada';
      default:
        return statusLabel;
    }
  }

  statusTone(status: RailLineStatus | undefined): string {
    if (!status) {
      return 'unknown';
    }

    switch (status.statusColor) {
      case 'verde':
        return 'good';
      case 'amarelo':
        return 'warn';
      case 'vermelho':
        return 'bad';
      default:
        return 'muted';
    }
  }

  private async loadDashboardData(favorites: FavoriteList): Promise<void> {
    const routeIds = uniqueIds(favorites.busRoute);
    const stopIds = uniqueIds(favorites.busStop);

    const [busLookup, mergedStations, railStatus] = await firstValueFrom(
      forkJoin([
        this.fetchBusFavorites(routeIds, stopIds),
        this.fetchMergedRailStations(),
        this.fetchRailStatus(),
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

  private fetchBusFavorites(routeIds: string[], stopIds: string[]) {
    if (routeIds.length === 0 && stopIds.length === 0) {
      return of(null);
    }

    return this.http
      .post<BusFavoritesLookupResponse>(this.graphqlEndpoint, {
        query: `
          query LiteDashboardBusFavorites($routeIds: [ID!]!, $stopIds: [ID!]!) {
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
        variables: { routeIds, stopIds },
      })
      .pipe(catchError(() => of(null)));
  }

  private fetchMergedRailStations() {
    return this.http
      .post<{
        data?: {
          mergedRailStations: MergedRailStationInsight[];
        };
      }>(this.graphqlEndpoint, {
        query: `
          query LiteDashboardMergedRailStations {
            mergedRailStations {
              id
              name
              lines
            }
          }
        `,
      })
      .pipe(
        map((response) => response.data?.mergedRailStations ?? []),
        catchError(() => of([])),
      );
  }

  private fetchRailStatus() {
    return this.http
      .post<RailStatusResponse>(this.graphqlEndpoint, {
        query: `
          query LiteDashboardRailStatus {
            railLinesStatus {
              lines {
                code
                colorName
                colorHex
                line
                statusCode
                statusLabel
                statusColor
                description
                detail
              }
              lastUpdated
              success
              errorMessage
            }
            railSpecialLinesStatus {
              code
              colorName
              colorHex
              line
              statusCode
              statusLabel
              statusColor
              nextDepartures {
                label
                time
              }
              issues {
                code
                line
                description
              }
            }
          }
        `,
      })
      .pipe(
        map((response) => ({
          ...(response.data?.railLinesStatus ?? {
            lines: [],
            specialLines: [],
            specialInfoCards: [],
            lastUpdated: new Date(),
            success: false,
            errorMessage: null,
          }),
          specialLines: response.data?.railSpecialLinesStatus ?? [],
          lastUpdated: new Date(
            response.data?.railLinesStatus?.lastUpdated ?? Date.now(),
          ),
        })),
        catchError(() =>
          of({
            lines: [],
            specialLines: [],
            specialInfoCards: [],
            lastUpdated: new Date(),
            success: false,
            errorMessage: 'Erro ao carregar status das linhas.',
          } satisfies RailLinesStatusResponse),
        ),
      );
  }

  private fetchRoutesForStops(stopIds: string[]) {
    if (stopIds.length === 0) {
      return of(new Map<string, BusRouteGraphQL[]>());
    }

    return forkJoin(
      stopIds.map((stopId) =>
        this.fetchRoutesForStop(
          this.busStopsById().get(stopId)?.stopId ?? stopId,
        ).pipe(
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

  private fetchRoutesForStop(stopId: string) {
    return this.http
      .post<RoutesForStopResponse>(this.graphqlEndpoint, {
        query: `
          query LiteDashboardRoutesForStop($stopId: String!) {
            routesForStop(stopId: $stopId) {
              id
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
          }
        `,
        variables: { stopId },
      })
      .pipe(
        map((response) => response.data?.routesForStop ?? []),
        catchError(() => of([])),
      );
  }

  private fetchNextTrainsForSelectedStations() {
    const requests = this.railStations().flatMap((station) =>
      this.getSelectedRailLines(station)
        .filter((line) => hasFetchableNextTrain(line))
        .map((line) =>
          this.fetchNextTrains(line.nextTrainLineCode, line.stationCode).pipe(
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

  private fetchNextTrains(
    lineCode: ExtendedNextTrainLineCode,
    stationCode: string,
  ) {
    return this.http
      .post<NextTrainsResponse>(this.graphqlEndpoint, {
        query: `
          query LiteDashboardNextTrains($lineCode: String!, $stationCode: String!) {
            nextTrains(lineCode: $lineCode, stationCode: $stationCode) {
              trains {
                lineCode
                stationCode
                destinationCode
                destinationName
                arrivalTime
                isAtPlatform
              }
            }
          }
        `,
        variables: { lineCode, stationCode },
      })
      .pipe(
        map((response) => response.data?.nextTrains?.trains ?? []),
        catchError(() => of([])),
      );
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
        departures: await this.fetchScheduledDepartures(stopId),
      })),
    );

    return new Map(schedules.map((entry) => [entry.stopId, entry.departures]));
  }

  private fetchScheduledDepartures(
    stopId: string,
    limit = 5,
  ): Promise<LiteScheduledBusDeparture[]> {
    return firstValueFrom(
      this.http
        .post<{
          data?: {
            scheduledBusDepartures?: LiteScheduledBusDeparture[];
          };
        }>(this.graphqlEndpoint, {
          query: `
            query LiteDashboardScheduledBusDepartures($stopId: String!, $limit: Int!) {
              scheduledBusDepartures(
                stopId: $stopId
                limit: $limit
                perRouteLimit: $limit
              ) {
                routeId
                routeShortName
                tripId
                headsign
                directionId
                departureTime
                sourceAgency
                platformCode
              }
            }
          `,
          variables: { stopId, limit },
        })
        .pipe(
          map((response) => response.data?.scheduledBusDepartures ?? []),
          catchError(() => of([])),
        ),
    );
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
