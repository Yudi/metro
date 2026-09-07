import { BusInformationComponent } from '../bus-information/bus-information.component';
import { routeNoticeView } from '../bus-information/bus-notice-view';
import {
  BusInformationService,
  BusNoticesResult,
} from '../../services/bus-information.service';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  inject,
  effect,
  signal,
  output,
  computed,
} from '@angular/core';

import { NgOptimizedImage } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import type {
  BusRouteGraphQL,
  BusStopGraphQL,
  RouteRailConnectionDirectionGraphQL,
  RouteRailConnectionGraphQL,
  RouteRailConnectionStationGraphQL,
  ScheduledBusDepartureGraphQL,
} from '../../services/geography-graphql.service';
import { GeographyGraphQLService } from '../../services/geography-graphql.service';
import {
  RealtimeWebsocketService,
  type LineWithVehicles,
  type StopArrivalUpdate,
  type VehiclePosition,
} from '../../services/realtime-websocket.service';
import {
  AGENCIES_DATA,
  TransitAgency,
  getAgencyIconPath,
  groupScheduledBusDepartures,
  getLineCodesFromColorNames,
  getLineColors,
  findOlhoVivoGtfsDirection,
  formatBusFare,
  formatScheduledBusDepartureTime,
  getBusRouteIdentity,
  getSptransStopCode,
  hasArtespStopData,
  isArtespRoute,
  getOlhoVivoDestination,
  sortBusRoutesByAgency,
  supportsSptransRealtime,
} from '@metro/shared/utils';

const VISIBLE_VEHICLE_COUNT = 2;

@Component({
  selector: 'app-stop-arrivals',
  imports: [
    NgOptimizedImage,
    BusInformationComponent,
    MatExpansionModule,
    MatTooltipModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonModule,
  ],
  templateUrl: './stop-arrivals.component.html',
  styleUrl: './stop-arrivals.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StopArrivalsComponent {
  stop = input.required<BusStopGraphQL>();
  routes = input<BusRouteGraphQL[]>([]);
  selectedRoutes = input<Set<string>>(new Set());
  showMapActions = input(false);
  compact = input(false);
  selectedRouteKey = input<string | null>(null);
  selectedRouteKeys = input<string[]>([]);
  selectRoute = output<string>();

  private readonly busInformation = inject(BusInformationService);
  readonly busNotices = signal<BusNoticesResult | null>(null);
  readonly noticesUnavailable = signal(false);
  readonly noticeRouteCodes = computed(
    () =>
      [
        ...new Set(
          this.routes()
            .filter((route) => supportsSptransRealtime(route))
            .map((route) => route.shortName.trim().toUpperCase())
            .filter((code) => /^[0-9A-Z]{4}-\d{2}$/.test(code)),
        ),
      ].sort(),
    {
      equal: (a, b) => a.join('|') === b.join('|'),
    },
  );
  readonly noticesByRoute = computed(
    () =>
      new Map(
        this.noticeRouteCodes().map((code) => [
          code,
          (this.busNotices()?.notices ?? [])
            .filter((notice) => notice.routes.includes(code))
            .map((notice) => routeNoticeView(notice, code)),
        ]),
      ),
  );
  readonly arrivalRows = computed(() =>
    this.arrivalLines().map((line) => ({
      line,
      notices: this.noticesByRoute().get(line.c.trim().toUpperCase()) ?? [],
    })),
  );

  private realtimeService = inject(RealtimeWebsocketService);
  private geographyService = inject(GeographyGraphQLService);

  arrivals = signal<StopArrivalUpdate | undefined>(undefined);
  isLoading = signal(true);
  railConnections = signal<Map<string, RouteRailConnectionGraphQL>>(new Map());
  railConnectionsLoading = signal(false);
  railConnectionsError = signal(false);
  scheduledDepartures = signal<ScheduledBusDepartureGraphQL[]>([]);
  scheduledDeparturesLoading = signal(false);
  scheduledDeparturesError = signal(false);
  expandedRoutes = signal<Set<string>>(new Set());
  readonly expandedScheduleRoutes = signal<Set<string>>(new Set());
  expandedArrivalLines = signal<Set<string>>(new Set());

  readonly artespLogo = getAgencyIconPath(TransitAgency.ARTESP);
  readonly displayRoutes = computed(() =>
    sortBusRoutesByAgency(this.routes()).map((route) => ({
      ...route,
      agencyName: this.formatRouteAgency(route),
      agencyLogo: this.getAgencyLogo(this.formatRouteAgency(route)),
      fareLabel: this.formatRouteFare(route),
      fareMissing: !route.fares?.length,
    })),
  );
  readonly scheduledRows = computed(() =>
    this.scheduledDepartures().map((departure) => {
      const route = this.getScheduledDepartureRoute(departure);
      const [timeLabel, dayLabel] = this.formatScheduledDepartureTime(
        departure.departureTime,
      ).split(' · ');
      return {
        ...departure,
        key: this.getScheduledDepartureKey(departure),
        timeLabel,
        dayLabel,
        color: route ? this.formatHexColor(route.color) : null,
        textColor: route ? this.formatHexColor(route.textColor) : null,
      };
    }),
  );
  readonly scheduledGroups = computed(() =>
    groupScheduledBusDepartures(this.scheduledRows()).map((group) => ({
      ...group,
      next: group.departures[0],
      remaining: group.departures.slice(1),
      expanded: this.expandedScheduleRoutes().has(group.routeId),
    })),
  );
  readonly hasRealtimeSupport = computed(
    () => getSptransStopCode(this.stop()) !== null,
  );
  readonly hasArtespSchedules = computed(() => hasArtespStopData(this.stop()));

  readonly stationLineBadges = computed(() => {
    const badges = new Map<
      string,
      Array<{ code: number; bg: string; text: string }>
    >();
    for (const connection of this.railConnections().values()) {
      for (const direction of connection.directions) {
        for (const station of direction.stations) {
          badges.set(
            station.id,
            getLineCodesFromColorNames(station.lines).map((code) => ({
              code,
              ...getLineColors(code),
            })),
          );
        }
      }
    }
    return badges;
  });

  readonly arrivalLines = computed(() => {
    const lines = this.arrivals()?.p?.l ?? [];
    const selectedRouteKeys = [
      ...this.selectedRouteKeys(),
      ...(this.selectedRouteKey() ? [this.selectedRouteKey() as string] : []),
    ];

    if (selectedRouteKeys.length === 0) {
      return this.sortArrivalLinesByRouteOrder(lines);
    }

    const normalizedSelections = new Set(
      selectedRouteKeys.map((routeKey) => this.normalizeRouteCode(routeKey)),
    );

    return this.sortArrivalLinesByRouteOrder(
      lines.filter((line) => {
        const route = this.getRouteForLine(line);

        return Boolean(
          route &&
            normalizedSelections.has(
              this.normalizeRouteCode(getBusRouteIdentity(route)),
            ),
        );
      }),
    );
  });

  constructor() {
    // Read the cached snapshot once for the route set, independently of 30s arrival updates.
    effect((onCleanup) => {
      const codes = this.noticeRouteCodes();
      this.busNotices.set(null);
      this.noticesUnavailable.set(false);
      if (!codes.length) return;
      if (codes.length > 100) {
        this.noticesUnavailable.set(true);
        return;
      }
      const subscription = this.busInformation.notices(codes).subscribe({
        next: (result) => {
          this.busNotices.set(result);
          this.noticesUnavailable.set(result.status === 'UNAVAILABLE');
        },
        error: () => this.noticesUnavailable.set(true),
      });
      onCleanup(() => subscription.unsubscribe());
    });

    // Watch for stop changes and subscribe
    effect((onCleanup) => {
      const stop = this.stop();
      const realtimeStopCode = getSptransStopCode(stop);
      let loadingTimeout: ReturnType<typeof setTimeout> | undefined;
      let releaseStopSubscription: (() => void) | undefined;

      this.arrivals.set(undefined);
      this.isLoading.set(realtimeStopCode !== null);

      if (realtimeStopCode) {
        // Subscribe to this stop
        releaseStopSubscription =
          this.realtimeService.subscribeToStop(realtimeStopCode);

        // Set timeout to stop loading state after 10 seconds
        loadingTimeout = setTimeout(() => {
          if (this.isLoading()) {
            this.isLoading.set(false);
          }
        }, 10000);
      }

      onCleanup(() => {
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
        }

        if (realtimeStopCode) {
          releaseStopSubscription?.();
        }
      });
    });

    // Separate effect to watch for arrival updates
    effect(() => {
      const stop = this.stop();
      const realtimeStopCode = getSptransStopCode(stop);
      if (realtimeStopCode) {
        const allArrivals = this.realtimeService.stopArrivals();
        const stopArrivals = allArrivals.get(realtimeStopCode);
        if (stopArrivals) {
          this.arrivals.set(stopArrivals);
          this.isLoading.set(false);
        }
      }
    });

    effect((onCleanup) => {
      const stop = this.stop();

      this.expandedScheduleRoutes.set(new Set());
      if (!stop?.stopId || !hasArtespStopData(stop)) {
        this.scheduledDepartures.set([]);
        this.scheduledDeparturesLoading.set(false);
        this.scheduledDeparturesError.set(false);
        return;
      }

      this.scheduledDepartures.set([]);
      this.scheduledDeparturesLoading.set(true);
      this.scheduledDeparturesError.set(false);

      const subscription = this.geographyService
        .getScheduledBusDepartures(stop.stopId, 5)
        .subscribe({
          next: (departures) => {
            this.scheduledDepartures.set(departures);
            this.scheduledDeparturesLoading.set(false);
          },
          error: () => {
            this.scheduledDepartures.set([]);
            this.scheduledDeparturesLoading.set(false);
            this.scheduledDeparturesError.set(true);
          },
        });

      onCleanup(() => subscription.unsubscribe());
    });

    effect((onCleanup) => {
      const stop = this.stop();
      const routeIds = this.getUniqueRouteIds(this.routes());

      if (!stop?.stopId || routeIds.length === 0) {
        this.railConnections.set(new Map());
        this.railConnectionsLoading.set(false);
        this.railConnectionsError.set(false);
        return;
      }

      this.railConnectionsLoading.set(true);
      this.railConnectionsError.set(false);

      const subscription = this.geographyService
        .getRouteRailConnectionsForStop(stop.stopId, routeIds)
        .subscribe({
          next: (connections) => {
            const connectionMap = new Map<string, RouteRailConnectionGraphQL>();

            for (const connection of connections) {
              connectionMap.set(connection.routeId, connection);
              if (!/^artesp[:/]/i.test(connection.routeId)) {
                connectionMap.set(connection.routeShortName, connection);
              }
            }

            this.railConnections.set(connectionMap);
            this.railConnectionsLoading.set(false);
          },
          error: () => {
            this.railConnections.set(new Map());
            this.railConnectionsLoading.set(false);
            this.railConnectionsError.set(true);
          },
        });

      onCleanup(() => subscription.unsubscribe());
    });
  }

  /**
   * Format arrival time (HH:mm)
   */
  formatArrivalTime(time: string): string {
    return time;
  }

  /**
   * Calculate minutes until arrival
   */
  getMinutesUntilArrival(arrivalTime: string): string {
    try {
      const [hours, minutes] = arrivalTime.split(':').map(Number);
      const now = new Date();
      const arrival = new Date();
      arrival.setHours(hours, minutes, 0);

      // If arrival is tomorrow (e.g., 00:30 when it's 23:30)
      if (arrival < now) {
        arrival.setDate(arrival.getDate() + 1);
      }

      const diffMs = arrival.getTime() - now.getTime();
      const diffMins = Math.round(diffMs / 60000);

      if (diffMins === 0) {
        return 'Chegando';
      } else if (diffMins < 0) {
        return 'Atrasado';
      } else if (diffMins === 1) {
        return 'Em 1 min';
      } else {
        return `Em ${diffMins} min`;
      }
    } catch {
      return arrivalTime;
    }
  }

  /**
   * Format update time
   */
  formatUpdateTime(time: string): string {
    return time;
  }

  /**
   * Check if component should show data
   */
  hasArrivals(): boolean {
    return this.arrivalLines().length > 0;
  }

  getVisibleVehicles(line: LineWithVehicles): VehiclePosition[] {
    if (this.isArrivalLineExpanded(line)) {
      return line.vs;
    }

    return line.vs.slice(0, VISIBLE_VEHICLE_COUNT);
  }

  hasHiddenVehicles(line: LineWithVehicles): boolean {
    return line.vs.length > VISIBLE_VEHICLE_COUNT;
  }

  getHiddenVehicleCount(line: LineWithVehicles): number {
    return Math.max(line.vs.length - VISIBLE_VEHICLE_COUNT, 0);
  }

  getHiddenVehiclesLabel(line: LineWithVehicles): string {
    const hiddenVehicleCount = this.getHiddenVehicleCount(line);
    const vehicleLabel = hiddenVehicleCount === 1 ? 'veículo' : 'veículos';

    return `Mostrar mais ${hiddenVehicleCount} ${vehicleLabel}`;
  }

  isArrivalLineExpanded(line: LineWithVehicles): boolean {
    return this.expandedArrivalLines().has(this.getArrivalLineKey(line));
  }

  toggleArrivalLineVehicles(line: LineWithVehicles): void {
    const key = this.getArrivalLineKey(line);
    const expanded = new Set(this.expandedArrivalLines());

    if (expanded.has(key)) {
      expanded.delete(key);
    } else {
      expanded.add(key);
    }

    this.expandedArrivalLines.set(expanded);
  }

  getLineRouteColor(line: LineWithVehicles): string | null {
    const route = this.getRouteForLine(line);
    return route ? this.formatHexColor(route.color) : null;
  }

  getLineRouteTextColor(line: LineWithVehicles): string | null {
    const route = this.getRouteForLine(line);
    return route ? this.formatHexColor(route.textColor) : null;
  }

  getRouteKey(route: BusRouteGraphQL): string {
    return getBusRouteIdentity(route);
  }

  toggleScheduleRoute(routeId: string): void {
    const expanded = new Set(this.expandedScheduleRoutes());
    if (expanded.has(routeId)) {
      expanded.delete(routeId);
    } else {
      expanded.add(routeId);
    }
    this.expandedScheduleRoutes.set(expanded);
  }

  setRouteExpanded(route: BusRouteGraphQL, isExpanded: boolean): void {
    const key = this.getRouteKey(route);
    const expanded = new Set(this.expandedRoutes());
    if (isExpanded) {
      expanded.add(key);
    } else {
      expanded.delete(key);
    }
    this.expandedRoutes.set(expanded);
  }

  isRouteExpanded(route: BusRouteGraphQL): boolean {
    return this.expandedRoutes().has(this.getRouteKey(route));
  }

  isRouteSelected(route: BusRouteGraphQL): boolean {
    const selectedRoutes = this.selectedRoutes();
    return selectedRoutes.has(getBusRouteIdentity(route));
  }

  showRouteOnMap(event: Event, route: BusRouteGraphQL): void {
    event.stopPropagation();

    if (!this.showMapActions() || this.isRouteSelected(route)) {
      return;
    }

    this.selectRoute.emit(this.getRouteKey(route));
  }

  getRouteConnection(
    route: BusRouteGraphQL,
  ): RouteRailConnectionGraphQL | null {
    const byIdentity = this.railConnections().get(route.routeId);
    if (byIdentity) {
      return byIdentity;
    }

    return isArtespRoute(route)
      ? null
      : (this.railConnections().get(route.shortName) ?? null);
  }

  formatRouteFare(route: BusRouteGraphQL): string | null {
    const fares = route.fares ?? [];
    if (fares.length > 0) {
      return fares.map((fare) => formatBusFare(fare)).join(' · ');
    }

    return supportsSptransRealtime(route) ? null : 'Tarifa não informada';
  }

  formatRouteAgency(route: BusRouteGraphQL): string {
    const agency = route.sourceAgency?.trim().toLowerCase();
    if (agency === 'artesp' || isArtespRoute(route)) {
      return 'Artesp';
    }
    if (agency === 'sptrans' || !agency) {
      return 'SPTrans';
    }
    return agency.toUpperCase();
  }

  formatScheduledDepartureTime(departureTime: string): string {
    return formatScheduledBusDepartureTime(departureTime);
  }

  getScheduledDepartureKey(departure: ScheduledBusDepartureGraphQL): string {
    return `${departure.routeId}:${departure.tripId}:${departure.directionId}:${departure.departureTime}`;
  }

  getScheduledDepartureRoute(
    departure: ScheduledBusDepartureGraphQL,
  ): BusRouteGraphQL | undefined {
    return this.routes().find(
      (route) => getBusRouteIdentity(route) === departure.routeId,
    );
  }

  routeServesRail(route: BusRouteGraphQL): boolean {
    return this.getRouteDirectionsWithRail(route).length > 0;
  }

  getRouteRailStationCount(route: BusRouteGraphQL): number {
    const stationIds = new Set<string>();

    for (const direction of this.getRouteDirectionsWithRail(route)) {
      for (const station of direction.stations) {
        stationIds.add(station.id);
      }
    }

    return stationIds.size;
  }

  getRouteDirectionsWithRail(
    route: BusRouteGraphQL,
  ): RouteRailConnectionDirectionGraphQL[] {
    return (
      this.getRouteConnection(route)?.directions.filter(
        (direction) => direction.stations.length > 0,
      ) ?? []
    );
  }

  getLineRailStations(
    line: LineWithVehicles,
  ): RouteRailConnectionStationGraphQL[] {
    const connection =
      this.railConnections().get(line.c) ??
      this.findConnectionByShortName(line.c);

    if (!connection) {
      return [];
    }

    return this.getDirectionForLine(connection, line)?.stations ?? [];
  }

  getLineDestination(line: LineWithVehicles): string {
    return getOlhoVivoDestination(line);
  }

  getAgencyLogo(name: string): string | null {
    const normalized = name.trim().toLocaleLowerCase('pt-BR');
    const agency = Object.values(TransitAgency).find(
      (key) =>
        key === normalized ||
        AGENCIES_DATA[key].shortName.toLocaleLowerCase('pt-BR') === normalized,
    );
    return agency ? getAgencyIconPath(agency) : null;
  }

  formatStationDistance(
    station: RouteRailConnectionStationGraphQL,
  ): string | null {
    const { distanceMeters } = station;

    if (
      typeof distanceMeters !== 'number' ||
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0
    ) {
      return null;
    }

    return `Parada da linha a ${distanceMeters} m da estação`;
  }

  private getDirectionForLine(
    connection: RouteRailConnectionGraphQL,
    line: LineWithVehicles,
  ): RouteRailConnectionDirectionGraphQL | undefined {
    return findOlhoVivoGtfsDirection(line, connection.directions);
  }

  private findConnectionByShortName(
    routeShortName: string,
  ): RouteRailConnectionGraphQL | undefined {
    const normalizedRoute = this.normalizeRouteCode(routeShortName);
    return Array.from(this.railConnections().values()).find(
      (connection) =>
        !/^artesp[:/]/i.test(connection.routeId) &&
        this.normalizeRouteCode(connection.routeShortName) === normalizedRoute,
    );
  }

  private getUniqueRouteIds(routes: BusRouteGraphQL[]): string[] {
    return Array.from(
      new Set(
        routes
          .map((route) => getBusRouteIdentity(route).trim())
          .filter(Boolean),
      ),
    );
  }

  private normalizeRouteCode(routeCode: string): string {
    return routeCode.trim().toUpperCase();
  }

  getArrivalLineKey(line: LineWithVehicles): string {
    if (Number.isFinite(line.cl) && line.cl !== 0) {
      return line.cl.toString();
    }

    return `${this.normalizeRouteCode(line.c)}:${line.sl}:${this.normalizeName(
      getOlhoVivoDestination(line),
    )}`;
  }

  private sortArrivalLinesByRouteOrder(
    lines: LineWithVehicles[],
  ): LineWithVehicles[] {
    const routeOrder = this.getRouteOrder();

    return lines
      .map((line, index) => ({ line, index }))
      .sort((a, b) => {
        const aOrder = routeOrder.get(this.normalizeRouteCode(a.line.c));
        const bOrder = routeOrder.get(this.normalizeRouteCode(b.line.c));

        if (aOrder === undefined && bOrder === undefined) {
          return a.index - b.index;
        }

        if (aOrder === undefined) {
          return 1;
        }

        if (bOrder === undefined) {
          return -1;
        }

        if (aOrder === bOrder) {
          return a.index - b.index;
        }

        return aOrder - bOrder;
      })
      .map(({ line }) => line);
  }

  private getRouteOrder(): Map<string, number> {
    const routeOrder = new Map<string, number>();

    this.displayRoutes().forEach((route, index) => {
      for (const routeCode of [route.routeId, route.shortName]) {
        const normalizedRouteCode = this.normalizeRouteCode(routeCode);

        if (!routeOrder.has(normalizedRouteCode)) {
          routeOrder.set(normalizedRouteCode, index);
        }
      }
    });

    return routeOrder;
  }

  private getRouteForLine(line: LineWithVehicles): BusRouteGraphQL | undefined {
    const normalizedRouteCode = this.normalizeRouteCode(line.c);

    return this.routes().find(
      (route) =>
        supportsSptransRealtime(route) &&
        this.normalizeRouteCode(route.shortName) === normalizedRouteCode,
    );
  }

  private formatHexColor(color: string): string | null {
    const normalizedColor = color.trim().replace(/^#/, '');

    if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(normalizedColor)) {
      return null;
    }

    return `#${normalizedColor}`;
  }

  private normalizeName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toUpperCase();
  }
}
