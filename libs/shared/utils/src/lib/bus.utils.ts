/**
 * A fare published by a bus feed.
 *
 * The currency is kept with the value because different feeds may publish
 * fares in different currencies and the UI must not infer it from the price.
 */
export interface BusFare {
  price: number;
  currency: string;
}

export interface BusRouteIdentityLike {
  routeId: string;
  sourceAgency?: string | null;
  sourceId?: string | null;
  supportsRealtime?: boolean | null;
}

export interface BusStopIdentityLike {
  stopId: string;
  sourceAgency?: string | null;
  sourceId?: string | null;
  mergedStopIds?: string[] | null;
}

export interface BusAgencySortableLike {
  routeId: string;
  sourceAgency?: string | null;
}

/**
 * Returns the globally unique application identity for a route.
 *
 * Route short names are presentation values and can collide between feeds
 * (for example, an SPTrans 001 and an Artesp 001).
 */
export function getBusRouteIdentity(route: BusRouteIdentityLike): string {
  return route.routeId;
}

export function getBusRouteDisplayId(
  route: Pick<BusRouteIdentityLike, 'routeId' | 'sourceId'>,
): string {
  const sourceId = route.sourceId?.trim();
  if (sourceId) {
    return sourceId;
  }

  return route.routeId.replace(/^[^:/]+[:/]/, '');
}

/**
 * Returns the globally unique application identity for a stop.
 */
export function getBusStopIdentity(stop: BusStopIdentityLike): string {
  return stop.stopId;
}

export function getBusStopIdentityAliases(stop: BusStopIdentityLike): string[] {
  return Array.from(
    new Set(
      [stop.stopId, ...(stop.mergedStopIds ?? [])]
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

export function getBusStopDisplayId(
  stop: Pick<BusStopIdentityLike, 'stopId' | 'sourceId'>,
): string {
  const sourceId = stop.sourceId?.trim();
  if (sourceId) {
    return sourceId;
  }

  return stop.stopId.replace(/^[^:/]+[:/]/, '');
}

export function normalizeBusSourceAgency(
  sourceAgency: string | null | undefined,
): string | null {
  const normalized = sourceAgency?.trim().toLowerCase();
  return normalized || null;
}

export function isSptransAgency(
  sourceAgency: string | null | undefined,
): boolean {
  return normalizeBusSourceAgency(sourceAgency) === 'sptrans';
}

export function isArtespRoute(route: BusRouteIdentityLike): boolean {
  return (
    normalizeBusSourceAgency(route.sourceAgency) === 'artesp' ||
    /^artesp[:/]/i.test(route.routeId)
  );
}

/**
 * Realtime is deliberately restricted to the SPTrans feed. The undefined
 * fallback preserves the legacy SPTrans contract while older API responses
 * are being upgraded; an explicitly identified non-SPTrans route is never
 * treated as realtime-capable.
 */
export function supportsSptransRealtime(route: BusRouteIdentityLike): boolean {
  if (/^artesp[:/]/i.test(route.routeId)) {
    return false;
  }

  const sourceAgency = normalizeBusSourceAgency(route.sourceAgency);
  if (sourceAgency && sourceAgency !== 'sptrans') {
    return false;
  }

  return (
    route.supportsRealtime === undefined || route.supportsRealtime === true
  );
}

/**
 * Resolves the SPTrans stop code used by the realtime socket. A merged
 * physical stop may be represented by an Artesp record, in which case the
 * namespaced SPTrans member is the only valid realtime target.
 */
export function getSptransStopCode(stop: BusStopIdentityLike): string | null {
  const sourceAgency = normalizeBusSourceAgency(stop.sourceAgency);
  if (sourceAgency === 'sptrans' && !/^artesp[:/]/i.test(stop.stopId)) {
    return stop.stopId || null;
  }

  for (const mergedStopId of stop.mergedStopIds ?? []) {
    const normalizedId = mergedStopId.trim();
    const match = /^sptrans[:/](.+)$/i.exec(normalizedId);
    if (match?.[1]) {
      return match[1];
    }

    // The physical-stop matcher stores the original SPTrans member as a
    // bare source ID and Artesp members with their feed prefix.
    if (
      normalizedId &&
      !/^artesp[:/]/i.test(normalizedId) &&
      !/^[^:/]+[:/]/.test(normalizedId)
    ) {
      return normalizedId;
    }
  }

  if (!sourceAgency && !/^artesp[:/]/i.test(stop.stopId)) {
    return stop.stopId || null;
  }

  return null;
}

export function hasArtespStopData(stop: BusStopIdentityLike): boolean {
  return (
    normalizeBusSourceAgency(stop.sourceAgency) === 'artesp' ||
    (stop.mergedStopIds ?? []).some((id) => /^artesp[:/]/i.test(id.trim()))
  );
}

export function getBusAgencyOrder(route: BusAgencySortableLike): number {
  const sourceAgency = normalizeBusSourceAgency(route.sourceAgency);
  if (sourceAgency === 'artesp' || /^artesp[:/]/i.test(route.routeId)) {
    return 1;
  }
  if (
    sourceAgency === 'sptrans' ||
    (!sourceAgency && !/^artesp[:/]/i.test(route.routeId)) ||
    /^sptrans[:/]/i.test(route.routeId)
  ) {
    return 0;
  }
  return 2;
}

export function sortBusRoutesByAgency<T extends BusAgencySortableLike>(
  routes: T[],
): T[] {
  return routes
    .map((route, index) => ({ route, index }))
    .sort(
      (a, b) =>
        getBusAgencyOrder(a.route) - getBusAgencyOrder(b.route) ||
        a.index - b.index,
    )
    .map(({ route }) => route);
}

export function formatBusFare(fare: BusFare): string {
  if (!Number.isFinite(fare.price)) {
    return 'Tarifa indisponível';
  }

  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: fare.currency,
    }).format(fare.price);
  } catch {
    return `${fare.currency} ${fare.price.toFixed(2)}`;
  }
}

export function formatScheduledBusDepartureTime(
  departureTime: string,
  now = new Date(),
): string {
  const parsed = new Date(departureTime);
  if (Number.isFinite(parsed.getTime())) {
    const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const departureDate = dateFormatter.format(parsed);
    if (departureDate === dateFormatter.format(now)) {
      return timeFormatter.format(parsed);
    }

    const tomorrow = new Date(now.getTime() + 86_400_000);
    if (departureDate === dateFormatter.format(tomorrow)) {
      return `${timeFormatter.format(parsed)} · amanhã`;
    }

    const weekday = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
    })
      .format(parsed)
      .replace('.', '');
    return `${timeFormatter.format(parsed)} · ${weekday}`;
  }

  const isoTime = /T(\d{1,2}:\d{2})/.exec(departureTime);
  if (isoTime?.[1]) {
    return isoTime[1];
  }

  const time = /^(\d{1,2}:\d{2})/.exec(departureTime);
  return time?.[1] ?? departureTime;
}

/** Keep one group per feed-qualified route, ordered by its next departure. */
export function groupScheduledBusDepartures<
  T extends { routeId: string; departureTime: string },
>(
  departures: readonly T[],
  limitPerRoute = 5,
): Array<{ routeId: string; departures: T[] }> {
  const groups = new Map<string, { routeId: string; departures: T[] }>();
  const chronological = [...departures].sort(
    (a, b) => Date.parse(a.departureTime) - Date.parse(b.departureTime),
  );
  for (const departure of chronological) {
    let group = groups.get(departure.routeId);
    if (!group) {
      group = { routeId: departure.routeId, departures: [] };
      groups.set(departure.routeId, group);
    }
    if (group.departures.length < limitPerRoute) {
      group.departures.push(departure);
    }
  }
  return [...groups.values()];
}
