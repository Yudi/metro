import { getUniqueAgencies } from '@metro/shared/utils';
import { BusRoute } from '../entities/geography.entity';
import { normalizeBusSourceAgency } from './bus-catalog.utils';

export interface StopServiceInfo {
  servesRail: boolean;
  servesBus: boolean;
  agencies: string[];
  railRouteShortNames: string[];
}

export function uniqueIds(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

export function emptyStopServiceInfo(): StopServiceInfo {
  return {
    servesRail: false,
    servesBus: false,
    agencies: [],
    railRouteShortNames: [],
  };
}

export function buildStopAgencies(
  railRouteShortNames: string[],
  busAgencies: string[],
): string[] {
  return sortAgencies([
    ...getUniqueAgencies(railRouteShortNames),
    ...busAgencies.map(normalizeAgencyName),
  ]);
}

export function compareBusRoutes(left: BusRoute, right: BusRoute): number {
  const sourceRank =
    normalizeBusSourceAgency(left.sourceAgency) === 'sptrans' ? 0 : 1;
  const otherSourceRank =
    normalizeBusSourceAgency(right.sourceAgency) === 'sptrans' ? 0 : 1;
  return (
    sourceRank - otherSourceRank ||
    left.shortName.localeCompare(right.shortName) ||
    left.routeId.localeCompare(right.routeId)
  );
}

function normalizeAgencyName(value: string): string {
  return value.trim().toLowerCase();
}

function sortAgencies(agencies: string[]): string[] {
  return Array.from(new Set(agencies)).sort(
    (left, right) =>
      agencyRank(left) - agencyRank(right) || left.localeCompare(right),
  );
}

function agencyRank(value: string): number {
  if (value === 'sptrans') return 0;
  if (value === 'artesp') return 1;
  return 2;
}
