import { normalizeStationName } from './station-name.utils';

/**
 * Stations that should never be merged even if their normalized names match.
 * These are different physical locations that happen to share similar names.
 */
const MERGE_EXCEPTIONS = ['lapa', 'mooca'] as const;
const LINE_QUALIFIER_REGEX = /\(\s*linha\s*(\d+)\s*\)/i;

export function isStationMergeException(name: string): boolean {
  const normalizedName = normalizeStationName(name).toLowerCase();
  return MERGE_EXCEPTIONS.some((exception) =>
    normalizedName.includes(exception),
  );
}

/**
 * Returns the display name used for station results and merged station records.
 * Most stations use the normalized name, but line-qualified merge exceptions
 * keep their qualifier so distinct physical stations remain distinguishable.
 */
export function getStationDisplayName(name: string, lineCode?: number): string {
  const normalizedName = normalizeStationName(name);
  const lineQualifierMatch = name.match(LINE_QUALIFIER_REGEX);
  const effectiveLineCode = lineCode ?? Number(lineQualifierMatch?.[1]);

  if (!isStationMergeException(name)) {
    return normalizedName;
  }

  if (!effectiveLineCode) {
    return normalizedName;
  }

  return `${normalizedName} (linha ${effectiveLineCode})`;
}

/**
 * Determines if two station names should be merged based on flexible matching rules.
 * This ensures consistent behavior between frontend and backend for station deduplication.
 *
 * @param name1 - First station name
 * @param name2 - Second station name
 * @returns true if the stations should be merged (same physical location)
 *
 * @example
 * shouldMergeStations('Pinheiros Metrô', 'Pinheiros CPTM') // Returns: true
 * shouldMergeStations('Lapa Metrô', 'Lapa CPTM') // Returns: false (exception)
 * shouldMergeStations('Morumbi', 'São Paulo - Morumbi') // Returns: false (exception)
 */
export function shouldMergeStations(name1: string, name2: string): boolean {
  const normalized1 = normalizeStationName(name1).toLowerCase();
  const normalized2 = normalizeStationName(name2).toLowerCase();

  // If normalized names are not identical, they should not merge
  if (normalized1 !== normalized2) {
    return false;
  }

  // Exception: "Morumbi" should not merge with "São Paulo - Morumbi"
  const isMorumbiException =
    (name1.toLowerCase().includes('morumbi') &&
      name1.toLowerCase().includes('são paulo')) !==
    (name2.toLowerCase().includes('morumbi') &&
      name2.toLowerCase().includes('são paulo'));

  if (isMorumbiException) {
    return false;
  }

  // Check for other exceptions (stations that share names but are different locations)
  if (isStationMergeException(name1) || isStationMergeException(name2)) {
    return false;
  }

  return true;
}

/**
 * Checks if a route ID indicates a subway/metro route.
 * Uses the same logic as the backend for consistency.
 *
 * @param routeId - The route ID to check
 * @returns true if this is a subway/metro route
 */
export function isSubwayRouteId(routeId: string): boolean {
  const upperRouteId = routeId.toUpperCase();
  return upperRouteId.startsWith('METRÔ') || upperRouteId.startsWith('CPTM');
}

/**
 * Groups and merges items by a key derived from their names.
 * Used for deduplicating search results for stations that appear multiple times.
 *
 * @param items - Array of items to merge
 * @param getName - Function to get the name from an item
 * @param merge - Function to merge multiple items into one
 * @returns Array of merged items
 */
export function mergeByStationName<T>(
  items: T[],
  getName: (item: T) => string,
  merge: (items: T[]) => T,
): T[] {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const name = getName(item);
    const normalizedName = normalizeStationName(name).toLowerCase();

    // Find existing group that should be merged with this item
    let groupKey: string | null = null;
    for (const [existingKey, existingGroup] of groups.entries()) {
      const existingName = getName(existingGroup[0]);
      if (shouldMergeStations(name, existingName)) {
        groupKey = existingKey;
        break;
      }
    }

    // Use the normalized name as key if no existing group found.
    // If that key is already taken by a non-mergeable station (for example,
    // "Lapa (linha 7)" vs "Lapa (linha 8)"), create a unique key so the
    // stations stay in separate groups.
    if (!groupKey) {
      groupKey = normalizedName;

      if (groups.has(groupKey)) {
        let suffix = 2;
        while (groups.has(`${normalizedName}::${suffix}`)) {
          suffix += 1;
        }
        groupKey = `${normalizedName}::${suffix}`;
      }
    }

    const group = groups.get(groupKey);
    if (group) {
      group.push(item);
    } else {
      groups.set(groupKey, [item]);
    }
  }

  return Array.from(groups.values()).map((group) =>
    group.length === 1 ? group[0] : merge(group),
  );
}
