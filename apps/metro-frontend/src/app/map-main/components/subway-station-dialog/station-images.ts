import type {
  StationImage,
  StationImageManifest,
} from '@metro/shared/station-image-contracts';
export type {
  StationImage,
  StationImageManifest,
} from '@metro/shared/station-image-contracts';

export interface StationHeaderImage extends StationImage {
  readonly src: string;
}

const stationIdentityPattern = /^[a-z0-9][a-z0-9_-]{0,159}$/;
const terminalIdentityPattern = /^terminal:[a-z0-9][a-z0-9_-]{0,159}$/;
const stationImageKeyPattern =
  /^station-images\/(?:metro|monorail|rail)\/[a-z0-9]+(?:-[a-z0-9]+)*\.avif$/;
const terminalImageKeyPattern =
  /^station-images\/terminal\/[a-z0-9]+(?:-[a-z0-9]+)*\.avif$/;

/** Checks API data before it can supply attribution links or proxy image paths. */
export function isStationImageManifest(
  value: unknown,
): value is StationImageManifest {
  if (!isRecord(value) || value['version'] !== 1 || !isRecord(value['stations']))
    return false;

  const keys = new Set<string>();
  if (!isImageGroup(value['stations'], stationIdentityPattern, false, keys))
    return false;

  const terminals = value['terminals'];
  return (
    terminals === undefined ||
    (isRecord(terminals) &&
      isImageGroup(terminals, terminalIdentityPattern, true, keys))
  );
}

export function isTerminalImageIdentity(value: string): boolean {
  return terminalIdentityPattern.test(value);
}

export function isStationImageFileKey(
  value: string,
  category: 'station' | 'terminal',
): boolean {
  return category === 'terminal'
    ? terminalImageKeyPattern.test(value)
    : stationImageKeyPattern.test(value);
}

function isImageGroup(
  groups: Record<string, unknown>,
  identityPattern: RegExp,
  terminal: boolean,
  keys: Set<string>,
): boolean {
  return Object.entries(groups).every(([identity, images]) => {
    if (
      !identityPattern.test(identity) ||
      !Array.isArray(images) ||
      images.length > 12
    ) {
      return false;
    }

    return images.every((image) => {
      if (!isStationImage(image, terminal) || keys.has(image.key)) return false;
      keys.add(image.key);
      return true;
    });
  });
}

function isStationImage(value: unknown, terminal: boolean): value is StationImage {
  if (!isRecord(value)) return false;
  const key = value['key'];
  const keyIsValid =
    typeof key === 'string' &&
    isStationImageFileKey(key, terminal ? 'terminal' : 'station');

  return (
    keyIsValid &&
    isRequiredText(value['author'], 256) &&
    isRequiredText(value['title'], 1024) &&
    isWebUrl(value['sourceUrl']) &&
    isRequiredText(value['license'], 128) &&
    isOptionalText(value['label'], 160) &&
    isLineIds(value['lineIds']) &&
    (value['service'] === undefined || value['service'] === 'train') &&
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
      value.every((lineId) => typeof lineId === 'string' && /^\d{1,3}$/.test(lineId)))
  );
}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isOptionalWebUrl(value: unknown): boolean {
  return value === undefined || isWebUrl(value);
}

/** Explicit line assignments outrank service photos; manifest order is the fallback. */
export function selectStationImage(
  images: readonly StationImage[],
  lineId?: string | number | null,
): StationImage | undefined {
  const code = String(lineId ?? '').replace(/^L/i, '');
  const specific = images.find((image) => image.lineIds?.includes(code));
  if (specific) return specific;
  const isTrain = /^(?:[7-9]|1[0-4]|10X|EA|EJ)$/.test(code);
  return (
    (isTrain ? images.find((image) => image.service === 'train') : undefined) ??
    images[0]
  );
}
