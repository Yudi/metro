import type { BusTerminalSummary } from '@metro/shared/bus-terminal-contracts';
import { createHash } from 'node:crypto';
import { extractBusPlatform } from '../transit-data/physical-stop-matcher';

export interface BusTerminalRow {
  stop_id: string;
  stop_name: string;
  stop_desc?: string | null;
  stop_lat: number | string | null;
  stop_lon: number | string | null;
  source_agency?: string | null;
  source_id?: string | null;
  platform_code?: string | null;
  merged_stop_ids?: string[] | null;
}

export interface ParsedBusTerminalStop {
  identity: string;
  name: string;
  platformCode?: string;
  boardingAllowed: boolean;
  excluded: boolean;
}

const PLATFORM_SUFFIX = /[\s,;–—-]*\b(?:plataforma|plat|pl)(?:[.\s]+[a-z0-9]{1,3}|\d{1,3})(?:\s*,\s*\d{1,4})?\s*[)\]]*$/i;
const BOARDING_SUFFIX = /[\s,;–—-]*(?:(?:somente|apenas)\s+)?(desembarque|desemb|embarque)\.?(?:\s+(?:de\s+passageiros|somente))?\s*[)\]]*$/i;
const BOTH_TRANSFER_SUFFIX = /[\s,;–—-]+(?:embarque\s*(?:e|\/)\s*(?:desembarque|desemb)|(?:desembarque|desemb)\s*(?:e|\/)\s*embarque)\.?\s*$/i;
const PMV_SUFFIX = /[\s,;–—-]*(?:ref\.?\s*[:.]?\s*)?pmv\s*[a-z0-9-]+\s*$/i;
const SAFE_IDENTITY_EXPANSIONS: Readonly<Record<string, string>> = {
  pq: 'parque',
  vl: 'vila',
  jd: 'jardim',
  sto: 'santo',
  metrô: 'metro',
  metro: 'metro',
};
const SEARCH_EXPANSIONS: Readonly<Record<string, string>> = {
  ...SAFE_IDENTITY_EXPANSIONS,
  cptm: 'cptm',
  term: 'terminal',
};

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function tokens(value: string): string[] {
  return fold(value)
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizedIdentity(value: string): string {
  return tokens(value)
    .map((token) => SAFE_IDENTITY_EXPANSIONS[token] ?? token)
    .join(' ');
}

/** Search-only normalization. It is deliberately not used for stop membership. */
export function normalizeTerminalSearchText(value: string): string {
  const parts = tokens(value);
  return parts
    .map((token, index) => {
      if (token === 'd' && index < parts.length - 1) return 'dom';
      return SEARCH_EXPANSIONS[token] ?? token;
    })
    .join(' ');
}

function explicitTerminalCore(name: string): string | undefined {
  const match = /^\s*(?:terminal|term)\.?\s+(.+?)\s*$/i.exec(name);
  return match?.[1]?.trim() || undefined;
}

function stripTerminalSuffixes(value: string): {
  core: string;
  alightingOnly: boolean;
} {
  let core = value.trim();
  let alightingOnly = false;

  for (let count = 0; count < 3; count += 1) {
    const unlabeledPlatform = /\s*[-–—]\s*(?:plataforma|plat|pl)\.?\s*$/i.exec(core);
    if (unlabeledPlatform && core.slice(0, unlabeledPlatform.index).trim()) {
      core = core.slice(0, unlabeledPlatform.index).trim();
      continue;
    }
    const bothTransfer = BOTH_TRANSFER_SUFFIX.exec(core);
    if (bothTransfer && core.slice(0, bothTransfer.index).trim()) {
      core = core.slice(0, bothTransfer.index).trim();
      continue;
    }
    const pointMarker = PMV_SUFFIX.exec(core);
    if (pointMarker && core.slice(0, pointMarker.index).trim()) {
      core = core.slice(0, pointMarker.index).trim();
      continue;
    }

    const boarding = BOARDING_SUFFIX.exec(core);
    if (boarding?.[1] && core.slice(0, boarding.index).trim()) {
      alightingOnly ||= fold(boarding[1]).startsWith('desemb');
      core = core.slice(0, boarding.index).trim();
      continue;
    }

    const platform = PLATFORM_SUFFIX.exec(core);
    if (platform && core.slice(0, platform.index).trim()) {
      core = core.slice(0, platform.index).trim();
      continue;
    }
    break;
  }
  return { core, alightingOnly };
}

function displayTerminalName(core: string): string {
  const expanded = core
    .replace(/\bpq\b\.?/gi, 'Parque')
    .replace(/\bvl\b\.?/gi, 'Vila')
    .replace(/\bjd\b\.?/gi, 'Jardim')
    .replace(/\bsto\b\.?/gi, 'Santo');
  return `Terminal ${expanded.trim()}`;
}

function hasExcludedQualifier(value: string): boolean {
  const text = fold(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return /\b(?:exterior|oposto|oposta|vago)\b/.test(text) ||
    /\bem frente\b/.test(text) ||
    /\blateral\b/.test(text) ||
    /\barea de apoio\b/.test(text);
}

function hasProhibitedBoarding(value: string): boolean {
  const text = fold(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return /\bsem embarque\b/.test(text) ||
    /\bembarque proibido\b/.test(text) ||
    /\bproibido (?:o )?embarque\b/.test(text) ||
    /\bnao (?:e )?permitido (?:o )?embarque\b/.test(text) ||
    /\bembarque nao permitido\b/.test(text) ||
    /\bproibido embarcar\b/.test(text);
}

function terminalIdentityFromCore(core: string): string {
  return normalizedIdentity(`Terminal ${core}`);
}

function hasConfirmedCommaMetadata(
  stopName: string,
  description?: string | null,
  platformCode?: string | null,
): boolean {
  const explicitCore = explicitTerminalCore(stopName);
  if (!explicitCore || !description) return false;
  const nameCore = stripTerminalSuffixes(explicitCore).core;
  const commaSuffix = /^(.*?),\s*(\d{1,4})$/.exec(nameCore);
  if (!commaSuffix?.[1] || !commaSuffix[2]) return false;
  const reference = /\bref\.?\s*[:.]?\s*/i.exec(description);
  if (!reference) return false;
  const descriptionPrefix = description.slice(0, reference.index).trim();
  const descriptionCore = explicitTerminalCore(descriptionPrefix);
  if (!descriptionCore) return false;
  const descriptionIdentity = terminalIdentityFromCore(
    stripTerminalSuffixes(descriptionCore).core,
  );
  const baseIdentity = terminalIdentityFromCore(commaSuffix[1]);
  if (descriptionIdentity === baseIdentity) return true;

  const fullIdentity = terminalIdentityFromCore(nameCore);
  if (descriptionIdentity !== fullIdentity) return false;
  const refText = description.slice(reference.index + reference[0].length);
  const platform = extractBusPlatform('', refText, platformCode);
  if (!platform || !/^\d+$/.test(platform)) return false;
  return Number(platform) === Number(commaSuffix[2]);
}

/** Parse only explicit terminal labels; nearby stops and route text never grant membership. */
export function parseBusTerminalStop(
  stopName: string,
  description?: string | null,
  platformCode?: string | null,
  confirmedCommaMetadataNames?: ReadonlySet<string>,
): ParsedBusTerminalStop | undefined {
  const explicitCore = explicitTerminalCore(stopName);
  if (!explicitCore) return undefined;

  const stripped = stripTerminalSuffixes(explicitCore);
  let core = stripped.core;
  const alightingOnly = stripped.alightingOnly;
  const rawNameKey = normalizedIdentity(stopName);
  const hasKnownCommaMetadata = confirmedCommaMetadataNames?.has(rawNameKey) ?? false;
  if (
    hasConfirmedCommaMetadata(stopName, description, platformCode) ||
    hasKnownCommaMetadata
  ) {
    core = core.replace(/,\s*\d{1,4}$/, '').trim();
  }
  if (!core) return undefined;

  const identity = normalizedIdentity(`Terminal ${core}`);
  if (!identity || identity === 'terminal') return undefined;
  const combined = `${stopName} ${description ?? ''}`;
  const allowsBoth = /\b(?:embarque\s*(?:e|\/)\s*(?:desembarque|desemb)|(?:desembarque|desemb)\s*(?:e|\/)\s*embarque)\b/i.test(combined);
  const explicitAlighting = alightingOnly || (!allowsBoth && /\b(?:desembarque|desemb)\b/i.test(combined));
  const prohibited = hasProhibitedBoarding(combined);
  const excluded = hasExcludedQualifier(combined) ||
    (prohibited && !explicitAlighting);
  const name = displayTerminalName(core);
  const platform = extractBusPlatform(stopName, description, platformCode);

  return {
    identity,
    name,
    ...(platform ? { platformCode: platform } : {}),
    boardingAllowed: !explicitAlighting && !prohibited,
    excluded,
  };
}

function finiteCoordinate(value: number | string | null): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'string' &&
    !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    return undefined;
  }
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : undefined;
}

function validCoordinates(row: BusTerminalRow): {
  latitude: number;
  longitude: number;
} | undefined {
  const latitude = finiteCoordinate(row.stop_lat);
  const longitude = finiteCoordinate(row.stop_lon);
  if (
    latitude === undefined || longitude === undefined ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) return undefined;
  return { latitude, longitude };
}

function rowFingerprint(row: BusTerminalRow): string {
  return JSON.stringify([
    row.stop_id,
    row.stop_name,
    row.stop_desc ?? null,
    row.stop_lat,
    row.stop_lon,
    row.source_agency ?? null,
    row.source_id ?? null,
    row.platform_code ?? null,
  ]);
}

function metersBetween(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const leftLatitude = radians(left.latitude);
  const rightLatitude = radians(right.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const boundedHaversine = Math.max(0, Math.min(1, haversine));
  return 6_371_000 * 2 * Math.atan2(
    Math.sqrt(boundedHaversine),
    Math.sqrt(1 - boundedHaversine),
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function terminalId(identity: string): string {
  const slug = identity.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (slug.length <= 140) return `terminal:${slug}`;
  const suffix = createHash('sha256').update(identity).digest('hex').slice(0, 32);
  return `terminal:${slug.slice(0, 100)}-${suffix}`;
}

interface Candidate {
  row: BusTerminalRow;
  parsed: ParsedBusTerminalStop;
  coordinates: { latitude: number; longitude: number };
}

const STREET_STOP_PLATFORM_TOLERANCE_METERS = 50;

function hasStreetAddressDescription(candidate: Candidate): boolean {
  const description = fold(candidate.row.stop_desc ?? '').trim();
  // A street reference after a terminal label is normal platform metadata.
  // Only a description starting with a numbered street address contradicts it.
  return /^(?:r\.?|rua|av\.?|avenida|al\.?|alameda|praca|pca\.?)\s+.+?,\s*\d+\b/.test(description);
}

function filterStreetStopsOutsidePlatforms(candidates: Candidate[]): Candidate[] {
  const platforms = candidates.filter((candidate) => candidate.parsed.platformCode);
  if (platforms.length === 0) return candidates;

  return candidates.filter((candidate) => {
    if (candidate.parsed.platformCode || !hasStreetAddressDescription(candidate)) {
      return true;
    }
    // Keep unlabelled stops near a platform despite small GPS discrepancies.
    // A matching terminal name alone cannot override conflicting street metadata.
    return platforms.some((platform) => metersBetween(
      candidate.coordinates,
      platform.coordinates,
    ) <= STREET_STOP_PLATFORM_TOLERANCE_METERS);
  });
}

/**
 * Builds compact, explicitly named terminal groups from the current feed.
 * Groups require exact normalized identities and a complete pairwise 500 m bound.
 */
export function buildBusTerminalCatalog(
  rows: readonly BusTerminalRow[],
): BusTerminalSummary[] {
  const unsafeIdentities = new Set<string>();
  const confirmedCommaMetadataNames = new Set(rows.flatMap((row) =>
    hasConfirmedCommaMetadata(row.stop_name, row.stop_desc, row.platform_code)
      ? [normalizedIdentity(row.stop_name)]
      : [],
  ));
  const rowsById = new Map<string, BusTerminalRow[]>();

  for (const row of rows) {
    if (!row.stop_id || typeof row.stop_name !== 'string') continue;
    const sameId = rowsById.get(row.stop_id) ?? [];
    sameId.push(row);
    rowsById.set(row.stop_id, sameId);
  }

  const byIdentity = new Map<string, Candidate[]>();
  for (const sameId of rowsById.values()) {
    const distinct = new Map(sameId.map((row) => [rowFingerprint(row), row]));
    if (distinct.size > 1) {
      for (const row of distinct.values()) {
        const parsed = parseBusTerminalStop(
          row.stop_name,
          row.stop_desc,
          row.platform_code,
          confirmedCommaMetadataNames,
        );
        if (parsed) unsafeIdentities.add(parsed.identity);
      }
      continue;
    }

    const row = [...distinct.values()][0];
    const parsed = parseBusTerminalStop(
      row.stop_name,
      row.stop_desc,
      row.platform_code,
      confirmedCommaMetadataNames,
    );
    if (!parsed || parsed.excluded) continue;

    const coordinates = validCoordinates(row);
    if (!coordinates) {
      unsafeIdentities.add(parsed.identity);
      continue;
    }
    const candidate: Candidate = { row, parsed, coordinates };
    const identityRows = byIdentity.get(candidate.parsed.identity) ?? [];
    identityRows.push(candidate);
    byIdentity.set(candidate.parsed.identity, identityRows);
  }

  const summaries: BusTerminalSummary[] = [];
  for (const [identity, identityRows] of byIdentity) {
    if (unsafeIdentities.has(identity)) continue;
    const orderedRows = filterStreetStopsOutsidePlatforms(identityRows)
      .slice()
      .sort((left, right) => compareStrings(left.row.stop_id, right.row.stop_id));

    let compact = true;
    for (let left = 0; left < orderedRows.length && compact; left += 1) {
      for (let right = left + 1; right < orderedRows.length; right += 1) {
        if (metersBetween(
          orderedRows[left].coordinates,
          orderedRows[right].coordinates,
        ) > 500) {
          compact = false;
          break;
        }
      }
    }
    if (!compact) continue;

    const names = [...new Set(orderedRows.map(({ parsed }) => parsed.name))]
      .sort(compareStrings);
    const aliases = [...new Set([
      ...names,
      ...orderedRows.map(({ row }) => row.stop_name.trim()),
    ])].sort(compareStrings);
    const latitude = orderedRows.reduce(
      (sum, candidate) => sum + candidate.coordinates.latitude,
      0,
    ) / orderedRows.length;
    const longitude = orderedRows.reduce(
      (sum, candidate) => sum + candidate.coordinates.longitude,
      0,
    ) / orderedRows.length;
    const stopIds = [...new Set(orderedRows.map(({ row }) => row.stop_id))]
      .sort(compareStrings);
    const platformCodes = [...new Set(orderedRows.flatMap(({ parsed }) =>
      parsed.platformCode ? [parsed.platformCode] : [],
    ))].sort(compareStrings);

    summaries.push({
      id: terminalId(identity),
      name: names[0],
      aliases,
      latitude,
      longitude,
      stopIds,
      platformCodes,
    });
  }

  return summaries.sort((left, right) => compareStrings(left.id, right.id));
}

