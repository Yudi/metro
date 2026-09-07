import {
  parseBusFares,
  supportsBusRealtime,
} from '../../geography/services/bus-catalog.utils';
import { extractBusPlatform } from '../../transit-data/physical-stop-matcher';
import type { RouteDocument, StopDocument } from './typesense.service';

export function formatBusRouteDocument(route: RouteDocument) {
  const sourceAgency =
    route.route_id.startsWith('artesp:') ||
    route.sourceAgency?.toLowerCase() === 'artesp'
      ? 'artesp'
      : 'sptrans';
  return {
    ...route,
    id: route.route_id,
    sourceAgency,
    sourceId: route.sourceId ?? route.route_id.replace(/^artesp:/, ''),
    supportsRealtime:
      route.supportsRealtime !== false &&
      supportsBusRealtime(route.route_id, sourceAgency, route.route_type),
    fares: parseBusFares(route.faresJson),
  };
}

export function formatBusStopDocument(stop: StopDocument) {
  const sourceAgency =
    stop.stop_id.startsWith('artesp:') ||
    stop.sourceAgency?.toLowerCase() === 'artesp'
      ? 'artesp'
      : 'sptrans';
  const mergedStopIds = stop.mergedStopIds?.length
    ? stop.mergedStopIds
    : [stop.stop_id];
  const agencies = new Set(stop.agencies ?? []);
  for (const id of mergedStopIds)
    agencies.add(id.startsWith('artesp:') ? 'artesp' : 'sptrans');
  return {
    ...stop,
    id: stop.stop_id,
    sourceAgency,
    sourceId: stop.sourceId ?? stop.stop_id.replace(/^artesp:/, ''),
    platformCode: extractBusPlatform(
      stop.stop_name,
      stop.stop_desc,
      stop.platformCode,
    ),
    mergedStopIds,
    agencies: [...agencies].sort(
      (a, b) =>
        Number(a !== 'sptrans') - Number(b !== 'sptrans') || a.localeCompare(b),
    ),
  };
}
