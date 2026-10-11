import {
  AGENCIES_DATA,
  TransitAgency,
  findOlhoVivoGtfsDirection,
  formatBusFare,
  formatScheduledBusDepartureTime,
  getAgencyIconPath,
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

export function getNextArrivalEstimate(lines: LineWithVehicles[]): string | null {
  const now = new Date();
  const minutes = lines.flatMap((line) =>
    line.vs.flatMap((vehicle) => {
      const estimate = vehicle.t ? getArrivalMinutes(vehicle.t, now) : null;
      return estimate === null ? [] : [estimate];
    }),
  );
  if (minutes.length === 0) return null;
  return formatArrivalDuration(Math.min(...minutes));
}

export function getMinutesUntilArrival(arrivalTime: string): string {
  const minutes = getArrivalMinutes(arrivalTime, new Date());
  if (minutes === null) return arrivalTime;
  return minutes === 0 ? 'Chegando' : `Em ${formatArrivalDuration(minutes)}`;
}

function formatArrivalDuration(minutes: number): string {
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}min`;
}

function getArrivalMinutes(arrivalTime: string, now: Date): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(arrivalTime)) return null;
  const [hours, minutes] = arrivalTime.split(':').map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return (hours * 60 + minutes - currentMinutes + 1440) % 1440;
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
    return fares.map((fare) => formatBusFare(fare)).join(', ');
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
      routes.map((route) => route.routeId.trim()).filter(Boolean),
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
  const candidates = routes.filter((route) =>
    supportsSptransRealtime(route) && normalizeRouteCode(route.shortName) === normalizedRouteCode,
  );
  const destination = normalizeName(getOlhoVivoDestination(line));
  const exact = candidates.filter((route) => route.destination && normalizeName(route.destination) === destination);
  if (exact.length === 1) return exact[0];
  const approximate = candidates.filter((route) => {
    const name = route.destination ? normalizeName(route.destination) : '';
    return name && destination && (name.includes(destination) || destination.includes(name));
  });
  if (approximate.length === 1) return approximate[0];
  return candidates.find((route) => !route.favoriteCode);

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

export function getStationSpacing(
  station: RouteRailConnectionStationGraphQL,
  previous?: RouteRailConnectionStationGraphQL,
): string | null {
  const currentCount = station.stopsUntil;
  const previousCount = previous ? previous.stopsUntil : 0;
  if (
    typeof currentCount !== 'number' || !Number.isInteger(currentCount) ||
    typeof previousCount !== 'number' || !Number.isInteger(previousCount) ||
    currentCount < 0 || previousCount < 0 || currentCount < previousCount
  ) return null;

  const stops = currentCount - previousCount;
  if (stops === 0) return previous ? 'Na mesma parada' : 'Neste ponto';
  const label = stops === 1 ? '1 parada' : `${stops} paradas`;
  return previous ? `Mais ${label}` : `Em ${label}`;
}

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toUpperCase();
}
