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

// Identities use the catalog's normalization, including names like engº.goulart.
const stationIdentityPattern = /^.{1,160}$/u;
const terminalIdentityPattern = /^terminal:[a-z0-9][a-z0-9_-]{0,159}$/;
// eslint-disable-next-line no-control-regex -- Reject control characters in imported stop identities.
const stopIdentityPattern = /^stop:[^\u0000-\u001f\u007f]{1,256}$/u;
type ImageCategory = 'station' | 'terminal' | 'stop';
const stationImageKeyPattern =
  /^station-images\/(?:metro|monorail|rail)\/[a-z0-9]+(?:-[a-z0-9]+)*\.avif$/;
const terminalImageKeyPattern =
  /^station-images\/terminal\/[a-z0-9]+(?:-[a-z0-9]+)*\.avif$/;
const stopImageKeyPattern =
  /^station-images\/stop\/[a-z0-9]+(?:-[a-z0-9]+)*\.avif$/;

/** Checks API data before it can supply attribution links or proxy image paths. */
export function isStationImageManifest(
  value: unknown,
): value is StationImageManifest {
  if (!isRecord(value) || value['version'] !== 1 || !isRecord(value['stations']))
    return false;

  const keys = new Set<string>();
  if (!isImageGroup(value['stations'], stationIdentityPattern, 'station', keys))
    return false;

  const terminals = value['terminals'];
  const stops = value['stops'];
  return (
    (terminals === undefined ||
    (isRecord(terminals) &&
      isImageGroup(terminals, terminalIdentityPattern, 'terminal', keys))) &&
    (stops === undefined ||
    (isRecord(stops) && isImageGroup(stops, stopIdentityPattern, 'stop', keys)))
  );
}

export function isTerminalImageIdentity(value: string): boolean {
  return terminalIdentityPattern.test(value);
}

export function isStationImageFileKey(
  value: string,
  category: ImageCategory,
): boolean {
  switch (category) {
    case 'terminal': return terminalImageKeyPattern.test(value);
    case 'stop': return stopImageKeyPattern.test(value);
    case 'station': return stationImageKeyPattern.test(value);
  }
}

function isImageGroup(
  groups: Record<string, unknown>,
  identityPattern: RegExp,
  category: ImageCategory,
  keys: Set<string>,
): boolean {
  return Object.entries(groups).every(([identity, images]) => {
    if (
      !identityPattern.test(identity) || hasControlCharacters(identity) ||
      !Array.isArray(images) ||
      images.length > 12
    ) {
      return false;
    }

    return images.every((image) => {
      if (!isStationImage(image, category) || keys.has(image.key)) return false;
      keys.add(image.key);
      return true;
    });
  });
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function isStationImage(value: unknown, category: ImageCategory): value is StationImage {
  if (!isRecord(value)) return false;
  const key = value['key'];
  const keyIsValid =
    typeof key === 'string' &&
    isStationImageFileKey(key, category);

  return (
    keyIsValid &&
    isRequiredText(value['author'], 256) &&
    isRequiredText(value['title'], 1024) &&
    isOptionalWebUrl(value['sourceUrl']) &&
    isRequiredText(value['license'], 128) &&
    isOptionalText(value['label'], 160) &&
    isLineIds(value['lineIds']) &&
    isStopIds(value['stopIds']) &&
    (value['isDefault'] === undefined || typeof value['isDefault'] === 'boolean') &&
    (value['service'] === undefined || value['service'] === 'train') &&
    isOptionalWebUrl(value['licenseUrl'])
  );
}

function isStopIds(value: unknown): boolean {
  // eslint-disable-next-line no-control-regex -- Reject control characters in imported stop identities.
  const controls = /[\u0000-\u001f\u007f]/u;
  return value === undefined || (Array.isArray(value) && value.length <= 64 &&
    value.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 256 &&
      !controls.test(id)));
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
  return value === undefined || value === null ||
    (typeof value === 'string' && !value.trim()) || isWebUrl(value);
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
    images.find((image) => image.isDefault) ?? images[0]
  );
}

/** Scoped terminal photos never become an unrelated platform's fallback. */
export function selectStopImage(
  images: readonly StationImage[],
  stopId?: string,
): StationImage | undefined {
  return (stopId ? images.find((image) => image.stopIds?.includes(stopId)) : undefined) ??
    images.find((image) => image.isDefault) ??
    images.find((image) => !image.stopIds?.length);
}
