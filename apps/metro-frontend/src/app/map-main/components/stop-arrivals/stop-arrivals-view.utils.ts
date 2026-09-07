import {
  AGENCIES_DATA,
  TransitAgency,
  findOlhoVivoGtfsDirection,
  formatBusFare,
  formatScheduledBusDepartureTime,
  getAgencyIconPath,
  getBusRouteIdentity,
  getOlhoVivoDestination,
  isArtespRoute,
  sortBusRoutesByAgency,
  supportsSptransRealtime,
} from '@metro/shared/utils';
import type {
  BusRouteGraphQL,
  RouteRailConnectionDirectionGraphQL,
  RouteRailConnectionGraphQL,
  RouteRailConnectionStationGraphQL,
  ScheduledBusDepartureGraphQL,
} from '../../geography/geography-graphql.service';
import type {
  LineWithVehicles,
  VehiclePosition,
} from '../../realtime/realtime-websocket.service';

export const VISIBLE_VEHICLE_COUNT = 2;

export function getMinutesUntilArrival(arrivalTime: string): string {
  try {
    const [hours, minutes] = arrivalTime.split(':').map(Number);
    const now = new Date();
    const arrival = new Date();
    arrival.setHours(hours, minutes, 0);

    if (arrival < now) {
      arrival.setDate(arrival.getDate() + 1);
    }

    const diffMins = Math.round((arrival.getTime() - now.getTime()) / 60000);
    if (diffMins === 0) return 'Chegando';
    if (diffMins < 0) return 'Atrasado';
    if (diffMins === 1) return 'Em 1 min';
    return `Em ${diffMins} min`;
  } catch {
    return arrivalTime;
  }
}

export function getVisibleVehicles(
  line: LineWithVehicles,
  expanded: boolean,
): VehiclePosition[] {
  return expanded ? line.vs : line.vs.slice(0, VISIBLE_VEHICLE_COUNT);
}

export function getHiddenVehicleCount(line: LineWithVehicles): number {
  return Math.max(line.vs.length - VISIBLE_VEHICLE_COUNT, 0);
}

export function getHiddenVehiclesLabel(line: LineWithVehicles): string {
  const hiddenVehicleCount = getHiddenVehicleCount(line);
  const vehicleLabel = hiddenVehicleCount === 1 ? 'veículo' : 'veículos';
  return `Mostrar mais ${hiddenVehicleCount} ${vehicleLabel}`;
}

export function getRouteFareLabel(route: BusRouteGraphQL): string | null {
  const fares = route.fares ?? [];
  if (fares.length > 0) {
    return fares.map((fare) => formatBusFare(fare)).join(' · ');
  }

  return supportsSptransRealtime(route) ? null : 'Tarifa não informada';
}

export function getRouteAgencyLabel(route: BusRouteGraphQL): string {
  const agency = route.sourceAgency?.trim().toLowerCase();
  if (agency === 'artesp' || isArtespRoute(route)) return 'Artesp';
  if (agency === 'sptrans' || !agency) return 'SPTrans';
  return agency.toUpperCase();
}

export function getScheduledDepartureKey(
  departure: ScheduledBusDepartureGraphQL,
): string {
  return `${departure.routeId}:${departure.tripId}:${departure.directionId}:${departure.departureTime}`;
}

export function getScheduledDepartureTime(departureTime: string): string {
  return formatScheduledBusDepartureTime(departureTime);
}

export function getAgencyLogo(name: string): string | null {
  const normalized = name.trim().toLocaleLowerCase('pt-BR');
  const agency = Object.values(TransitAgency).find(
    (key) =>
      key === normalized ||
      AGENCIES_DATA[key].shortName.toLocaleLowerCase('pt-BR') === normalized,
  );
  return agency ? getAgencyIconPath(agency) : null;
}

export function getRailDirections(
  connection: RouteRailConnectionGraphQL | null | undefined,
): RouteRailConnectionDirectionGraphQL[] {
  return (
    connection?.directions.filter(
      (direction) => direction.stations.length > 0,
    ) ?? []
  );
}

export function getRailStationCount(
  connection: RouteRailConnectionGraphQL | null | undefined,
): number {
  const stationIds = new Set<string>();
  for (const direction of getRailDirections(connection)) {
    for (const station of direction.stations) stationIds.add(station.id);
  }
  return stationIds.size;
}

export function getRailDirectionForLine(
  connection: RouteRailConnectionGraphQL,
  line: LineWithVehicles,
): RouteRailConnectionDirectionGraphQL | undefined {
  return findOlhoVivoGtfsDirection(line, connection.directions);
}

export function findRailConnectionByShortName(
  connections: Map<string, RouteRailConnectionGraphQL>,
  routeShortName: string,
): RouteRailConnectionGraphQL | undefined {
  const normalizedRoute = normalizeRouteCode(routeShortName);
  return Array.from(connections.values()).find(
    (connection) =>
      !/^artesp[:/]/i.test(connection.routeId) &&
      normalizeRouteCode(connection.routeShortName) === normalizedRoute,
  );
}

export function getUniqueRouteIds(routes: BusRouteGraphQL[]): string[] {
  return Array.from(
    new Set(
      routes.map((route) => getBusRouteIdentity(route).trim()).filter(Boolean),
    ),
  );
}

export function normalizeRouteCode(routeCode: string): string {
  return routeCode.trim().toUpperCase();
}

export function getArrivalLineKey(line: LineWithVehicles): string {
  if (Number.isFinite(line.cl) && line.cl !== 0) return line.cl.toString();
  return `${normalizeRouteCode(line.c)}:${line.sl}:${normalizeName(
    getOlhoVivoDestination(line),
  )}`;
}

export function sortArrivalLinesByRouteOrder(
  lines: LineWithVehicles[],
  routes: BusRouteGraphQL[],
): LineWithVehicles[] {
  const routeOrder = new Map<string, number>();
  sortBusRoutesByAgency(routes).forEach((route, index) => {
    for (const routeCode of [route.routeId, route.shortName]) {
      const normalizedRouteCode = normalizeRouteCode(routeCode);
      if (!routeOrder.has(normalizedRouteCode)) {
        routeOrder.set(normalizedRouteCode, index);
      }
    }
  });

  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const aOrder = routeOrder.get(normalizeRouteCode(a.line.c));
      const bOrder = routeOrder.get(normalizeRouteCode(b.line.c));
      if (aOrder === undefined && bOrder === undefined)
        return a.index - b.index;
      if (aOrder === undefined) return 1;
      if (bOrder === undefined) return -1;
      return aOrder === bOrder ? a.index - b.index : aOrder - bOrder;
    })
    .map(({ line }) => line);
}

export function findRouteForArrivalLine(
  line: LineWithVehicles,
  routes: BusRouteGraphQL[],
): BusRouteGraphQL | undefined {
  const normalizedRouteCode = normalizeRouteCode(line.c);
  return routes.find(
    (route) =>
      supportsSptransRealtime(route) &&
      normalizeRouteCode(route.shortName) === normalizedRouteCode,
  );
}

export function formatHexColor(color: string): string | null {
  const normalizedColor = color.trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(normalizedColor)
    ? `#${normalizedColor}`
    : null;
}

export function formatStationDistance(
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

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toUpperCase();
}
