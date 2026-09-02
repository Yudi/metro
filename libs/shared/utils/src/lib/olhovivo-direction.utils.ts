export interface OlhoVivoDirectionFields {
  sl: number;
  lt0: string;
  lt1: string;
}

export interface GtfsDirectionLike {
  directionId: number;
  headsign: string;
}

export type GtfsDirectionId = 0 | 1;

/**
 * OlhoVivo returns both terminal labels for every line entry. The `sl` field
 * determines which label is the destination for the current direction.
 * Unknown directions preserve the provider's lt0/lt1 order as a fallback.
 */
export function getOlhoVivoDestination(
  line: OlhoVivoDirectionFields,
): string {
  return line.sl === 2 ? line.lt1 : line.lt0;
}

export function getOlhoVivoOrigin(line: OlhoVivoDirectionFields): string {
  return line.sl === 2 ? line.lt0 : line.lt1;
}

export function getOlhoVivoGtfsDirectionId(
  sentido: number,
): GtfsDirectionId | null {
  if (sentido === 1) {
    return 0;
  }

  if (sentido === 2) {
    return 1;
  }

  return null;
}

export function findOlhoVivoGtfsDirection<T extends GtfsDirectionLike>(
  line: OlhoVivoDirectionFields,
  directions: readonly T[],
): T | undefined {
  const directionId = getOlhoVivoGtfsDirectionId(line.sl);
  const directionMatch = directions.find(
    (direction) => direction.directionId === directionId,
  );

  if (directionMatch) {
    return directionMatch;
  }

  const destination = normalizeHeadsign(getOlhoVivoDestination(line));
  if (!destination) {
    return undefined;
  }

  const exactDestination = directions.find(
    (direction) => normalizeHeadsign(direction.headsign) === destination,
  );

  if (exactDestination) {
    return exactDestination;
  }

  return directions.find((direction) => {
    const headsign = normalizeHeadsign(direction.headsign);
    return (
      headsign.length > 0 &&
      (headsign.includes(destination) || destination.includes(headsign))
    );
  });
}

function normalizeHeadsign(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toUpperCase();
}
