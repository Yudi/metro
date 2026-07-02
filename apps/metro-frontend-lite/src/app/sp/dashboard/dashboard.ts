import { DatePipe, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  API_BASE_URL,
  DashboardFavoriteSelections,
  FavoritesService,
} from '@metro/shared/api';
import {
  FavoriteRailLineOption,
  ExtendedNextTrainLineCode,
  FavoriteList,
  RailLineStatus,
  RailLinesStatusResponse,
  createFavoriteRailLineOptions,
  formatTransitTime,
  getContrastColor,
  getRailLineFavorites,
  getRailLineByCode,
  getRailStationIdentityFromFavoriteKey,
  getRailStationIdentityKey,
  hasFetchableNextTrain,
  normalizeHexColor,
  sortRailLineCodes,
  toTitleCase,
  uniqueIds,
} from '@metro/shared/utils';
import { catchError, firstValueFrom, forkJoin, map, of } from 'rxjs';
import { LiteNextTrainArrival } from '../../services/lite-search.service';
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
}

interface BusRouteGraphQL {
  id: string;
  routeId: string;
  shortName: string;
  longName: string;
  color?: string;
  textColor?: string;
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
  imports: [DatePipe, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit {
  private readonly favoritesService = inject(FavoritesService);
  private readonly http = inject(HttpClient);
  private readonly realtimeService = inject(LiteRealtimeService);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly graphqlEndpoint = `${this.baseUrl}/graphql`;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly lastLoadedAt = signal<Date | null>(null);
  readonly favorites = signal<FavoriteList | null>(null);
  readonly dashboardSelections = signal<DashboardFavoriteSelections | null>(null);
  readonly busRoutesById = signal(new Map<string, BusRouteInsight>());
  readonly busStopsById = signal(new Map<string, BusStopInsight>());
  readonly busRoutesByStopId = signal(new Map<string, BusRouteGraphQL[]>());
  readonly busArrivalsByStopId = signal(new Map<string, LiteStopArrivalUpdate>());
  readonly mergedRailStations = signal<MergedRailStationInsight[]>([]);
  readonly railStatus = signal<RailLinesStatusResponse | null>(null);
  readonly nextTrainGroups = signal<RailNextTrainGroup[]>([]);

  readonly busRoutes = computed(() => [...this.busRoutesById().values()]);
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

  ngOnInit(): void {
    void this.refreshDashboard();
  }

  async refreshDashboard(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const [favorites, selections] = await Promise.all([
        this.favoritesService.readFavoritesSnapshot(),
        this.favoritesService.readDashboardSelectionsSnapshot(),
      ]);

      this.favorites.set(favorites);
      this.dashboardSelections.set(selections);

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
    }
  }

  getSelectedBusRoutes(stopId: string): BusRouteGraphQL[] {
    const routes = this.busRoutesByStopId().get(stopId) ?? [];
    const selectedRouteKeys =
      this.dashboardSelections()?.busStopRoutes[stopId] ??
      routes.map((route) => this.getBusRouteSelectionKey(route));
    const selectedRouteKeySet = new Set(selectedRouteKeys);

    return routes.filter((route) =>
      [route.routeId, route.shortName].some((routeKey) =>
        selectedRouteKeySet.has(routeKey),
      ),
    );
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

  getMinutesUntilArrival(arrivalTime: string): string {
    const [hours, minutes] = arrivalTime.split(':').map(Number);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return arrivalTime;
    }

    const now = new Date();
    const arrival = new Date();
    arrival.setHours(hours, minutes, 0, 0);

    const diffMins = Math.round((arrival.getTime() - now.getTime()) / 60_000);

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

    this.busRoutesByStopId.set(routesByStop);
    this.nextTrainGroups.set(nextTrains);
    this.busArrivalsByStopId.set(arrivalsByStop);
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
        this.fetchRoutesForStop(stopId).pipe(
          map((routes) => [stopId, routes] as const),
        ),
      ),
    ).pipe(map((entries) => new Map(entries)));
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
      stopIds.map(async (stopId) => ({
        stopId,
        arrival: await this.realtimeService.fetchStopArrivalOnce(stopId),
      })),
    );

    return new Map(
      arrivals
        .filter(
          (entry): entry is { stopId: string; arrival: LiteStopArrivalUpdate } =>
            entry.arrival !== null,
        )
        .map((entry) => [entry.stopId, entry.arrival]),
    );
  }

  private applyBusLookup(
    routeIds: string[],
    stopIds: string[],
    response: BusFavoritesLookupResponse | null,
  ): void {
    const routesById = new Map(
      response?.data?.multipleBusRoutes.map((route) => [route.routeId, route]) ??
        [],
    );
    const stopsById = new Map(
      response?.data?.multipleBusStops.map((stop) => [
        stop.stopId,
        {
          id: stop.id,
          stopId: stop.stopId,
          name: stop.name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          isSubwayStation: stop.isSubwayStation,
          agencies: stop.agencies,
          routeShortNames: stop.routeShortNames ?? [],
        } satisfies BusStopInsight,
      ]) ?? [],
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
    return route.shortName || route.routeId;
  }

  private clearRemoteData(): void {
    this.busRoutesById.set(new Map());
    this.busStopsById.set(new Map());
    this.busRoutesByStopId.set(new Map());
    this.busArrivalsByStopId.set(new Map());
    this.mergedRailStations.set([]);
    this.railStatus.set(null);
    this.nextTrainGroups.set([]);
  }

}
