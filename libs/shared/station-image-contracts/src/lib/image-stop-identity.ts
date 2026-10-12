/** Canonical media identity without changing the public transit catalog's IDs. */
export function getImageStopId(
  stopId: string,
  sourceAgency = 'sptrans',
  sourceId?: string | null,
): string {
  if (stopId.includes(':')) return stopId;
  const agency = sourceAgency.trim().toLowerCase() || 'sptrans';
  return `${agency}:${sourceId?.trim() || stopId}`;
}
