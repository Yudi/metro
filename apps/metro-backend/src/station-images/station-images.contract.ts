import type {
  StationImage as StationImageMetadataEntry,
  StationImageManifest,
} from '@metro/shared/station-image-contracts';

export const STATION_IMAGES_KEY_PREFIX = 'station-images/';

const stationIdentityPattern = /^[a-z0-9][a-z0-9_-]{0,159}$/;
const stationImageKeyPattern =
  /^station-images\/(?:metro|monorail|rail|terminal)\/[a-z0-9]+(?:-[a-z0-9]+)*\.avif$/;
const terminalIdentityPattern = /^terminal:[a-z0-9][a-z0-9_-]{0,159}$/;

export function buildStationImageObjectKey(
  category: string,
  filename: string,
): string {
  if (!['metro', 'monorail', 'rail', 'terminal'].includes(category)) {
    throw new Error('Invalid station image category');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.avif$/.test(filename)) {
    throw new Error('Invalid station image filename');
  }

  return `${STATION_IMAGES_KEY_PREFIX}${category}/${filename}`;
}

export function parseStationImageManifest(value: string): StationImageManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Station image metadata is not valid JSON');
  }

  if (!isRecord(parsed) || parsed['version'] !== 1) {
    throw new Error('Station image metadata has an unsupported version');
  }
  const stations = parsed['stations'];
  if (!isRecord(stations)) {
    throw new Error('Station image metadata must contain a stations object');
  }

  validateImageGroups(stations, stationIdentityPattern, 'station');

  const terminals = parsed['terminals'];
  if (terminals !== undefined) {
    if (!isRecord(terminals)) {
      throw new Error('Station image metadata must contain a terminals object');
    }
    validateImageGroups(terminals, terminalIdentityPattern, 'terminal');
  }

  return parsed as unknown as StationImageManifest;
}

function validateImageGroups(
  groups: Record<string, unknown>,
  identityPattern: RegExp,
  groupName: 'station' | 'terminal',
): void {
  for (const [identity, images] of Object.entries(groups)) {
    if (!identityPattern.test(identity) || !Array.isArray(images)) {
      throw new Error(`Station image metadata contains an invalid ${groupName}`);
    }
    if (
      images.length > 12 ||
      !images.every((image) =>
        isStationImageMetadataEntry(image, groupName === 'terminal'),
      )
    ) {
      throw new Error('Station image metadata contains an invalid image entry');
    }
  }
}

function isStationImageMetadataEntry(
  value: unknown,
  terminal: boolean,
): value is StationImageMetadataEntry {
  if (!isRecord(value)) {
    return false;
  }

  const isTerminalImage =
    typeof value['key'] === 'string' &&
    value['key'].startsWith('station-images/terminal/');
  return (
    typeof value['key'] === 'string' &&
    stationImageKeyPattern.test(value['key']) &&
    terminal === isTerminalImage &&
    isOptionalText(value['label'], 160) &&
    isLineIds(value['lineIds']) &&
    (value['service'] === undefined || value['service'] === 'train') &&
    isRequiredText(value['author'], 256) &&
    isRequiredText(value['title'], 1024) &&
    isWebUrl(value['sourceUrl']) &&
    isRequiredText(value['license'], 128) &&
    isOptionalWebUrl(value['licenseUrl'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRequiredText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isOptionalText(value: unknown, maxLength: number): boolean {
  return value === undefined || isRequiredText(value, maxLength);
}

function isLineIds(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= 8 &&
      value.every(
        (entry) => typeof entry === 'string' && /^\d{1,3}$/.test(entry),
      ))
  );
}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function isOptionalWebUrl(value: unknown): boolean {
  return value === undefined || isWebUrl(value);
}
