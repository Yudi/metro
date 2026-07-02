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
} from '../../services/geography-graphql.service';
import { GeographyGraphQLService } from '../../services/geography-graphql.service';
import {
  RealtimeWebsocketService,
  type LineWithVehicles,
  type StopArrivalUpdate,
  type VehiclePosition,
} from '../../services/realtime-websocket.service';

const VISIBLE_VEHICLE_COUNT = 2;

@Component({
  selector: 'app-stop-arrivals',
  imports: [
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

  private realtimeService = inject(RealtimeWebsocketService);
  private geographyService = inject(GeographyGraphQLService);

  arrivals = signal<StopArrivalUpdate | undefined>(undefined);
  isLoading = signal(true);
  railConnections = signal<Map<string, RouteRailConnectionGraphQL>>(new Map());
  railConnectionsLoading = signal(false);
  railConnectionsError = signal(false);
  expandedRoutes = signal<Set<string>>(new Set());
  expandedArrivalLines = signal<Set<string>>(new Set());

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
        const normalizedLine = this.normalizeRouteCode(line.c);
        const route = this.getRouteForLine(line);

        return (
          normalizedSelections.has(normalizedLine) ||
          (route &&
            [route.routeId, route.shortName].some((routeCode) =>
              normalizedSelections.has(this.normalizeRouteCode(routeCode)),
            ))
        );
      }),
    );
  });

  constructor() {
    // Watch for stop changes and subscribe
    effect((onCleanup) => {
      const stop = this.stop();
      let loadingTimeout: ReturnType<typeof setTimeout> | undefined;

      if (stop?.stopId) {
        // Subscribe to this stop
        this.realtimeService.subscribeToStop(stop.stopId);
        this.isLoading.set(true);

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

        if (stop?.stopId) {
          this.realtimeService.unsubscribeFromStop(stop.stopId);
        }
      });
    });

    // Separate effect to watch for arrival updates
    effect(() => {
      const stop = this.stop();
      if (stop?.stopId) {
        const allArrivals = this.realtimeService.stopArrivals();
        const stopArrivals = allArrivals.get(stop.stopId);
        if (stopArrivals) {
          this.arrivals.set(stopArrivals);
          this.isLoading.set(false);
        }
      }
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
        .getRouteRailConnectionsForStop(stop.stopId, routeIds, 200)
        .subscribe({
          next: (connections) => {
            const connectionMap = new Map<string, RouteRailConnectionGraphQL>();

            for (const connection of connections) {
              connectionMap.set(connection.routeId, connection);
              connectionMap.set(connection.routeShortName, connection);
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
    return route.shortName || route.routeId;
  }

  toggleRoute(route: BusRouteGraphQL): void {
    const key = this.getRouteKey(route);
    const expanded = new Set(this.expandedRoutes());

    if (expanded.has(key)) {
      expanded.delete(key);
    } else {
      expanded.add(key);
    }

    this.expandedRoutes.set(expanded);
  }

  isRouteExpanded(route: BusRouteGraphQL): boolean {
    return this.expandedRoutes().has(this.getRouteKey(route));
  }

  isRouteSelected(route: BusRouteGraphQL): boolean {
    const selectedRoutes = this.selectedRoutes();
    return (
      selectedRoutes.has(route.routeId) || selectedRoutes.has(route.shortName)
    );
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
    return (
      this.railConnections().get(route.routeId) ??
      this.railConnections().get(route.shortName) ??
      null
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

  formatStationMeta(station: RouteRailConnectionStationGraphQL): string {
    const agencies = station.agencies.join(' + ');
    const lines =
      station.lines.length > 0 ? ` · ${station.lines.join(', ')}` : '';
    return `${agencies}${lines}`;
  }

  private getDirectionForLine(
    connection: RouteRailConnectionGraphQL,
    line: LineWithVehicles,
  ): RouteRailConnectionDirectionGraphQL | undefined {
    const destination = this.normalizeName(line.lt0);
    const exactDestination = connection.directions.find(
      (direction) => this.normalizeName(direction.headsign) === destination,
    );

    if (exactDestination) {
      return exactDestination;
    }

    const looseDestination = connection.directions.find((direction) => {
      const headsign = this.normalizeName(direction.headsign);
      return headsign.includes(destination) || destination.includes(headsign);
    });

    if (looseDestination) {
      return looseDestination;
    }

    return connection.directions.find(
      (direction) => direction.directionId === line.sl - 1,
    );
  }

  private findConnectionByShortName(
    routeShortName: string,
  ): RouteRailConnectionGraphQL | undefined {
    const normalizedRoute = this.normalizeRouteCode(routeShortName);
    return Array.from(this.railConnections().values()).find(
      (connection) =>
        this.normalizeRouteCode(connection.routeShortName) === normalizedRoute,
    );
  }

  private getUniqueRouteIds(routes: BusRouteGraphQL[]): string[] {
    return Array.from(
      new Set(
        routes
          .flatMap((route) => [route.routeId, route.shortName])
          .map((routeId) => routeId.trim())
          .filter(Boolean),
      ),
    );
  }

  private normalizeRouteCode(routeCode: string): string {
    return routeCode.trim().toUpperCase();
  }

  private getArrivalLineKey(line: LineWithVehicles): string {
    return `${this.normalizeRouteCode(line.c)}:${line.sl}:${this.normalizeName(
      line.lt0,
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

    this.routes().forEach((route, index) => {
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

    return this.routes().find((route) =>
      [route.shortName, route.routeId].some(
        (routeCode) =>
          this.normalizeRouteCode(routeCode) === normalizedRouteCode,
      ),
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
