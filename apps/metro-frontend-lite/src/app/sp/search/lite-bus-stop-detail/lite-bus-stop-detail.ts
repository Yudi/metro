import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import {
  LiteBusRoute,
  LiteRouteRailConnection,
  LiteRouteRailConnectionDirection,
  LiteRouteRailConnectionStation,
  LiteSearchStop,
} from '../../../services/lite-search.service';
import {
  LiteArrivalLine,
  LiteStopArrivalUpdate,
} from '../../../services/lite-realtime.service';
import { LiteChip, LiteSpinner } from '@metro/shared/lite-ui';

@Component({
  selector: 'app-lite-bus-stop-detail',
  imports: [LiteChip, LiteSpinner],
  templateUrl: './lite-bus-stop-detail.html',
  styleUrl: './lite-bus-stop-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiteBusStopDetail {
  readonly stop = input.required<LiteSearchStop>();
  readonly arrivals = input<LiteStopArrivalUpdate | undefined>(undefined);
  readonly connected = input(false);
  readonly railConnections = input<LiteRouteRailConnection[]>([]);
  readonly railConnectionsLoading = input(false);
  readonly railConnectionsError = input(false);

  readonly expandedRoutes = signal<Set<string>>(new Set());

  readonly routes = computed(() => this.stop().routes ?? []);
  readonly hasArrivals = computed(
    () => (this.arrivals()?.p?.l?.length ?? 0) > 0,
  );
  readonly connectionMap = computed(() => {
    const map = new Map<string, LiteRouteRailConnection>();
    for (const connection of this.railConnections()) {
      map.set(connection.routeId, connection);
      map.set(connection.routeShortName, connection);
    }
    return map;
  });

  toggleRoute(route: LiteBusRoute): void {
    const key = this.getRouteKey(route);
    const expanded = new Set(this.expandedRoutes());

    if (expanded.has(key)) {
      expanded.delete(key);
    } else {
      expanded.add(key);
    }

    this.expandedRoutes.set(expanded);
  }

  isRouteExpanded(route: LiteBusRoute): boolean {
    return this.expandedRoutes().has(this.getRouteKey(route));
  }

  getRouteKey(route: LiteBusRoute): string {
    return route.shortName || route.routeId;
  }

  getRouteConnection(route: LiteBusRoute): LiteRouteRailConnection | null {
    return (
      this.connectionMap().get(route.routeId) ??
      this.connectionMap().get(route.shortName) ??
      null
    );
  }

  routeServesRail(route: LiteBusRoute): boolean {
    return this.getRouteDirectionsWithRail(route).length > 0;
  }

  getRouteRailStationCount(route: LiteBusRoute): number {
    const stationIds = new Set<string>();

    for (const direction of this.getRouteDirectionsWithRail(route)) {
      for (const station of direction.stations) {
        stationIds.add(station.id);
      }
    }

    return stationIds.size;
  }

  getRouteDirectionsWithRail(
    route: LiteBusRoute,
  ): LiteRouteRailConnectionDirection[] {
    return (
      this.getRouteConnection(route)?.directions.filter(
        (direction) => direction.stations.length > 0,
      ) ?? []
    );
  }

  getLineRailStations(line: LiteArrivalLine): LiteRouteRailConnectionStation[] {
    const connection =
      this.connectionMap().get(line.c) ?? this.findConnectionByShortName(line.c);

    if (!connection) {
      return [];
    }

    return this.getDirectionForLine(connection, line)?.stations ?? [];
  }

  getMinutesUntilArrival(arrivalTime: string): string {
    try {
      const [hours, minutes] = arrivalTime.split(':').map(Number);
      const now = new Date();
      const arrival = new Date();
      arrival.setHours(hours, minutes, 0, 0);

      if (arrival < now) {
        arrival.setDate(arrival.getDate() + 1);
      }

      const diffMins = Math.round((arrival.getTime() - now.getTime()) / 60000);

      if (diffMins === 0) {
        return 'Chegando';
      }
      if (diffMins === 1) {
        return 'Em 1 min';
      }
      if (diffMins < 0) {
        return 'Atrasado';
      }
      return `Em ${diffMins} min`;
    } catch {
      return arrivalTime;
    }
  }

  formatStationMeta(station: LiteRouteRailConnectionStation): string {
    const agencies = station.agencies.join(' + ');
    const lines = station.lines.length > 0 ? ` · ${station.lines.join(', ')}` : '';
    return `${agencies}${lines}`;
  }

  private getDirectionForLine(
    connection: LiteRouteRailConnection,
    line: LiteArrivalLine,
  ): LiteRouteRailConnectionDirection | undefined {
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
  ): LiteRouteRailConnection | undefined {
    const normalizedRoute = this.normalizeRouteCode(routeShortName);
    return Array.from(this.connectionMap().values()).find(
      (connection) =>
        this.normalizeRouteCode(connection.routeShortName) === normalizedRoute,
    );
  }

  private normalizeRouteCode(routeCode: string): string {
    return routeCode.trim().toUpperCase();
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
