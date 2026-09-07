import {
  type FavoriteRailLineOption,
  type RailLineStatus,
  formatTransitTime,
  getOlhoVivoDestination,
  getTransitTimeDifferenceMinutes,
  getContrastColor,
  getRailLineByCode,
  getSptransStopCode,
  getBusRouteDisplayId,
  hasArtespStopData,
  isArtespRoute,
  formatBusFare,
  formatScheduledBusDepartureTime,
  normalizeHexColor,
} from '@metro/shared/utils';
import type { LiteScheduledBusDeparture } from '../../shared/search/lite-search.service';
import type { LiteArrivalLine } from '../../shared/realtime/lite-realtime.service';
import type {
  BusRouteInsight,
  BusRouteGraphQL,
  BusStopInsight,
  LiteAgencyKey,
  LiteAgencyDisplay,
} from './dashboard.types';

export function routeColor(route: BusRouteInsight | BusRouteGraphQL): string {
  return normalizeHexColor(route.color, '475569');
}

export function routeTextColor(
  route: BusRouteInsight | BusRouteGraphQL,
): string {
  return normalizeHexColor(route.textColor, 'ffffff');
}

export function lineName(code: number): string {
  return getRailLineByCode(code)?.fullName ?? `Linha ${code}`;
}

export function lineColor(code: number): string {
  return getRailLineByCode(code)?.colorHex ?? '#475569';
}

export function lineTextColor(code: number): string {
  return getContrastColor(lineColor(code));
}

export function formatLineLabel(line: FavoriteRailLineOption): string {
  return `L${line.lineCode}`;
}

export function formatTrainTime(value: string): string {
  return formatTransitTime(value, { locale: 'pt-BR' });
}

export function getBusDestination(line: LiteArrivalLine): string {
  return getOlhoVivoDestination(line);
}

export function getScheduledDepartureTimeParts(departureTime: string): {
  time: string;
  day: string | null;
} {
  const label = formatScheduledDepartureTime(departureTime);
  const separatorIndex = label.indexOf(' · ');
  return separatorIndex >= 0
    ? {
        time: label.slice(0, separatorIndex),
        day: label.slice(separatorIndex + 3),
      }
    : { time: label, day: null };
}

export function hasArtespScheduleData(stop: BusStopInsight): boolean {
  return hasArtespStopData(stop);
}

export function hasSptransRealtimeData(stop: BusStopInsight): boolean {
  return getSptransStopCode(stop) !== null;
}

export function formatScheduledDepartureTime(departureTime: string): string {
  return formatScheduledBusDepartureTime(departureTime);
}

export function getScheduledDepartureKey(
  departure: LiteScheduledBusDeparture,
): string {
  return `${departure.routeId}:${departure.tripId}:${departure.directionId}:${departure.departureTime}`;
}

export function routeFareLabel(
  route: BusRouteInsight | BusRouteGraphQL,
): string | null {
  if (route.fares && route.fares.length > 0) {
    return route.fares.map((fare) => formatBusFare(fare)).join(' · ');
  }

  return isArtespRoute(route) ? 'Tarifa não informada' : null;
}

export function routeDisplayId(route: BusRouteInsight): string {
  return getBusRouteDisplayId(route);
}

export function getBusRouteAgencyLabel(
  route: BusRouteInsight | BusRouteGraphQL,
): string {
  const agency = route.sourceAgency?.trim().toLowerCase();
  if (agency === 'artesp' || isArtespRoute(route)) {
    return 'Artesp';
  }
  if (agency === 'sptrans' || !agency) {
    return 'SPTrans';
  }
  return agency.toUpperCase();
}

export function getBusRouteAgencyKey(
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

export function getBusStopAgencies(stop: BusStopInsight): LiteAgencyDisplay[] {
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

export function getAgencyLogoPath(agency: LiteAgencyKey): string {
  return `/public/shared/agencies/${agency}.svg`;
}

export function getMinutesUntilArrival(arrivalTime: string): string {
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

export function statusLabelFormat(statusLabel: string): string {
  switch (statusLabel) {
    case 'Operação Normal':
      return 'Normal';
    case 'Operação Encerrada':
      return 'Encerrada';
    default:
      return statusLabel;
  }
}

export function statusTone(status: RailLineStatus | undefined): string {
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
