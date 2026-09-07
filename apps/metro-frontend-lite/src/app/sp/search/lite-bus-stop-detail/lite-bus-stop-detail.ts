import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import {
  LiteBusRoute,
  LiteRouteRailConnection,
  LiteRouteRailConnectionDirection,
  LiteRouteRailConnectionStation,
  LiteSearchStop,
  type LiteScheduledBusDeparture,
} from '../../../services/lite-search.service';
import {
  LiteArrivalLine,
  LiteStopArrivalUpdate,
} from '../../../services/lite-realtime.service';
import { LiteChip, LiteSpinner } from '@metro/shared/lite-ui';
import {
  getLineCodesFromColorNames,
  getLineColors,
  findOlhoVivoGtfsDirection,
  getOlhoVivoDestination,
  getTransitTimeDifferenceMinutes,
  formatBusFare,
  formatScheduledBusDepartureTime,
  getBusRouteIdentity,
  groupScheduledBusDepartures,
  getSptransStopCode,
  hasArtespStopData,
  isArtespRoute,
  sortBusRoutesByAgency,
} from '@metro/shared/utils';

@Component({
  selector: 'app-lite-bus-stop-detail',
  imports: [LiteChip, LiteSpinner, NgOptimizedImage],
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
  readonly scheduledDepartures = input<LiteScheduledBusDeparture[]>([]);
  readonly scheduledDeparturesLoading = input(false);
  readonly scheduledDeparturesError = input(false);

  readonly expandedRoutes = signal<Set<string>>(new Set());
  readonly expandedScheduledRoutes = signal<Set<string>>(new Set());

  readonly routes = computed(() =>
    sortBusRoutesByAgency(this.stop().routes ?? []),
  );
  readonly scheduledRows = computed(() =>
    this.scheduledDepartures().map((departure) => {
      const route = this.routes().find(
        (item) => item.routeId === departure.routeId,
      );
      const timeLabel = this.formatScheduledDepartureTime(
        departure.departureTime,
      );
      const separatorIndex = timeLabel.indexOf(' · ');
      return {
        ...departure,
        color: route?.color ? `#${route.color}` : null,
        textColor: route?.textColor ? `#${route.textColor}` : null,
        timeLabel:
          separatorIndex >= 0 ? timeLabel.slice(0, separatorIndex) : timeLabel,
        dayLabel:
          separatorIndex >= 0 ? timeLabel.slice(separatorIndex + 3) : null,
      };
    }),
  );
  readonly scheduledRouteGroups = computed(() =>
    groupScheduledBusDepartures(this.scheduledRows(), 5),
  );
  readonly stationLineBadges = computed(() => {
    const badges = new Map<
      string,
      Array<{ code: number; bg: string; text: string }>
    >();
    for (const connection of this.railConnections()) {
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

  readonly arrivalLines = computed(() => this.arrivals()?.p?.l ?? []);
  readonly hasArrivals = computed(() => this.arrivalLines().length > 0);
  readonly hasRealtimeSupport = computed(
    () => getSptransStopCode(this.stop()) !== null,
  );
  readonly hasArtespSchedules = computed(() => hasArtespStopData(this.stop()));
  readonly connectionMap = computed(() => {
    const map = new Map<string, LiteRouteRailConnection>();
    for (const connection of this.railConnections()) {
      map.set(connection.routeId, connection);
      if (!/^artesp[:/]/i.test(connection.routeId)) {
        map.set(connection.routeShortName, connection);
      }
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
    return getBusRouteIdentity(route);
  }

  getRouteConnection(route: LiteBusRoute): LiteRouteRailConnection | null {
    const byIdentity = this.connectionMap().get(route.routeId);
    if (byIdentity) {
      return byIdentity;
    }

    return isArtespRoute(route)
      ? null
      : (this.connectionMap().get(route.shortName) ?? null);
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
      this.connectionMap().get(line.c) ??
      this.findConnectionByShortName(line.c);

    if (!connection) {
      return [];
    }

    return this.getDirectionForLine(connection, line)?.stations ?? [];
  }

  getLineDestination(line: LiteArrivalLine): string {
    return getOlhoVivoDestination(line);
  }

  getMinutesUntilArrival(arrivalTime: string): string {
    const diffMins = getTransitTimeDifferenceMinutes(arrivalTime);
    if (diffMins === null) {
      return arrivalTime;
    }
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
  }

  getRouteFareLabel(route: LiteBusRoute): string | null {
    if (route.fares && route.fares.length > 0) {
      return route.fares.map((fare) => formatBusFare(fare)).join(' · ');
    }

    return isArtespRoute(route) ? 'Tarifa não informada' : null;
  }

  getRouteAgencyLabel(route: LiteBusRoute): string {
    const agency = route.sourceAgency?.trim().toLowerCase();
    if (agency === 'artesp' || isArtespRoute(route)) {
      return 'Artesp';
    }
    if (agency === 'sptrans' || !agency) {
      return 'SPTrans';
    }
    return agency.toUpperCase();
  }

  getRouteAgencyKey(route: LiteBusRoute): 'artesp' | 'sptrans' | null {
    const agency = route.sourceAgency?.trim().toLowerCase();
    if (agency === 'artesp' || isArtespRoute(route)) {
      return 'artesp';
    }
    if (agency === 'sptrans' || !agency) {
      return 'sptrans';
    }
    return null;
  }

  getAgencyLogoPath(agency: 'artesp' | 'sptrans'): string {
    return `/public/shared/agencies/${agency}.svg`;
  }

  formatScheduledDepartureTime(departureTime: string): string {
    return formatScheduledBusDepartureTime(departureTime);
  }

  getScheduledDepartureKey(departure: LiteScheduledBusDeparture): string {
    return `${departure.routeId}:${departure.tripId}:${departure.directionId}:${departure.departureTime}`;
  }

  getVisibleScheduledDepartures<
    T extends {
      routeId: string;
      departureTime: string;
    },
  >(group: { routeId: string; departures: readonly T[] }): readonly T[] {
    return this.isScheduledRouteExpanded(group.routeId)
      ? group.departures
      : group.departures.slice(0, 1);
  }

  isScheduledRouteExpanded(routeId: string): boolean {
    return this.expandedScheduledRoutes().has(routeId);
  }

  toggleScheduledRoute(routeId: string): void {
    const expanded = new Set(this.expandedScheduledRoutes());
    if (expanded.has(routeId)) {
      expanded.delete(routeId);
    } else {
      expanded.add(routeId);
    }
    this.expandedScheduledRoutes.set(expanded);
  }

  getScheduledRouteToggleLabel(routeId: string, count: number): string {
    return this.isScheduledRouteExpanded(routeId)
      ? 'Mostrar menos'
      : `Ver ${count} horários`;
  }

  formatStationDistance(
    station: LiteRouteRailConnectionStation,
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
    connection: LiteRouteRailConnection,
    line: LiteArrivalLine,
  ): LiteRouteRailConnectionDirection | undefined {
    return findOlhoVivoGtfsDirection(line, connection.directions);
  }

  private findConnectionByShortName(
    routeShortName: string,
  ): LiteRouteRailConnection | undefined {
    const normalizedRoute = this.normalizeRouteCode(routeShortName);
    return Array.from(this.connectionMap().values()).find(
      (connection) =>
        !/^artesp[:/]/i.test(connection.routeId) &&
        this.normalizeRouteCode(connection.routeShortName) === normalizedRoute,
    );
  }

  private normalizeRouteCode(routeCode: string): string {
    return routeCode.trim().toUpperCase();
  }
}
