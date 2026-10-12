import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type {
  ImageCopyrightInput,
} from '@metro/shared/admin-contracts';
import {
  MAX_STATION_IMAGE_BYTES,
} from '../station-images/station-images.service';

const STOP_CATALOG_ID_PATTERN = /^[^:]{1,64}:.{1,190}$/u;
const LICENSE_ID_MAX_LENGTH = 128;

export interface ParsedAdminImageInput {
  readonly stationIdentity: string;
  readonly author: string;
  readonly title: string;
  readonly label?: string;
  readonly sourceUrl: string;
  readonly copyrightId: string;
  readonly lineIds: readonly string[];
  readonly stopIds: readonly string[];
  readonly service?: 'train';
  readonly isDefault: boolean;
}

export interface ImageUploadFile {
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export async function readImageUploadBuffer(
  file: Buffer | ImageUploadFile,
  maximumBytes: number,
): Promise<Buffer> {
  if (Buffer.isBuffer(file)) {
    if (file.byteLength > maximumBytes) {
      throw new PayloadTooLargeException(`Image upload exceeds ${maximumBytes} bytes`);
    }
    return file;
  }
  if (
    !file ||
    typeof file.arrayBuffer !== 'function' ||
    !Number.isSafeInteger(file.size) ||
    file.size < 0
  ) {
    throw new BadRequestException('Image upload must be a multipart file');
  }
  if (file.size > maximumBytes) {
    throw new PayloadTooLargeException(`Image upload exceeds ${maximumBytes} bytes`);
  }
  const data = await file.arrayBuffer();
  if (data.byteLength > maximumBytes) {
    throw new PayloadTooLargeException(`Image upload exceeds ${maximumBytes} bytes`);
  }
  if (data.byteLength !== file.size) {
    throw new BadRequestException('Image upload size did not match its data');
  }
  return Buffer.from(data);
}

export function parseAdminImageInput(value: unknown): ParsedAdminImageInput {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new BadRequestException('Image metadata must be valid JSON');
    }
  }
  if (!isRecord(parsed)) {
    throw new BadRequestException('Image metadata must be an object');
  }

  const stationIdentity = requiredText(
    parsed['stationIdentity'],
    512,
    'stationIdentity',
  );
  const author = requiredText(parsed['author'], 256, 'author');
  const title = requiredText(parsed['title'], 1024, 'title');
  const sourceUrl = webUrl(parsed['sourceUrl'], 'sourceUrl');
  const copyrightId = requiredText(
    parsed['copyrightId'],
    LICENSE_ID_MAX_LENGTH,
    'copyrightId',
  );
  const label = parsed['label'] === undefined || parsed['label'] === null
    ? undefined
    : requiredText(parsed['label'], 160, 'label');
  const lineIds = stringArray(
    parsed['lineIds'],
    8,
    'lineIds',
    (entry) => /^\d{1,3}$/.test(entry),
  );
  const stopIds = stringArray(
    parsed['stopIds'],
    64,
    'stopIds',
    (entry) => STOP_CATALOG_ID_PATTERN.test(entry),
  );
  const service = parsed['service'] === null ? undefined : parsed['service'];
  if (service !== undefined && service !== 'train') {
    throw new BadRequestException('service must be train when provided');
  }
  if (typeof parsed['isDefault'] !== 'boolean') {
    throw new BadRequestException('isDefault must be a boolean');
  }
  if (
    parsed['isDefault'] &&
    (lineIds.length > 0 || stopIds.length > 0 || service === 'train')
  ) {
    throw new BadRequestException(
      'A default image cannot be limited to a line, stop, or service',
    );
  }

  return {
    stationIdentity,
    author,
    title,
    ...(label !== undefined ? { label } : {}),
    sourceUrl,
    copyrightId,
    lineIds,
    stopIds,
    ...(service === 'train' ? { service } : {}),
    isDefault: parsed['isDefault'],
  };
}

export function parseCopyrightInput(value: unknown): ImageCopyrightInput {
  if (!isRecord(value)) {
    throw new BadRequestException('License metadata must be an object');
  }
  const license = requiredText(value['license'], 128, 'license');
  const licenseUrl = value['licenseUrl'] === undefined || value['licenseUrl'] === null
    ? undefined
    : webUrl(value['licenseUrl'], 'licenseUrl', 2048);
  return {
    license,
    ...(licenseUrl !== undefined ? { licenseUrl } : {}),
  };
}

export function assertAvifImage(file: Buffer): void {
  if (!Buffer.isBuffer(file) || file.byteLength < 16) {
    throw new BadRequestException('Upload must be a valid AVIF image');
  }
  if (file.byteLength > MAX_STATION_IMAGE_BYTES) {
    throw new BadRequestException('Station images cannot exceed 10 MiB');
  }
  const boxSize = file.readUInt32BE(0);
  if (file.toString('ascii', 4, 8) !== 'ftyp') {
    throw new BadRequestException('Upload must be a valid AVIF image');
  }
  const headerSize = boxSize === 1 ? 16 : 8;
  const resolvedSize = boxSize === 1
    ? Number(file.readBigUInt64BE(8))
    : boxSize === 0
      ? file.byteLength
      : boxSize;
  const brandOffset = headerSize;
  if (
    resolvedSize < brandOffset + 8 ||
    resolvedSize > file.byteLength ||
    (resolvedSize - brandOffset) % 4 !== 0
  ) {
    throw new BadRequestException('Upload must be a valid AVIF image');
  }
  const majorBrand = file.toString('ascii', brandOffset, brandOffset + 4);
  let hasAvifBrand = majorBrand === 'avif' || majorBrand === 'avis';
  for (let offset = brandOffset + 8; offset + 4 <= resolvedSize; offset += 4) {
    const brand = file.toString('ascii', offset, offset + 4);
    if (brand === 'avif' || brand === 'avis') {
      hasAvifBrand = true;
      break;
    }
  }
  if (!hasAvifBrand) {
    throw new BadRequestException('Upload must be a valid AVIF image');
  }
}

export function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      return true;
    }
  }
  return false;
}

function requiredText(value: unknown, maxLength: number, field: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maxLength ||
    hasControlCharacters(value)
  ) {
    throw new BadRequestException(
      `${field} must be a non-empty string of at most ${maxLength} characters`,
    );
  }
  return value.trim();
}

function webUrl(value: unknown, field: string, maxLength = 2048): string {
  const text = requiredText(value, maxLength, field);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new BadRequestException(`${field} must be an HTTP or HTTPS URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new BadRequestException(`${field} must be an HTTP or HTTPS URL`);
  }
  return url.toString();
}

function stringArray(
  value: unknown,
  maxCount: number,
  field: string,
  validate: (entry: string) => boolean,
): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxCount) {
    throw new BadRequestException(`${field} has too many values`);
  }
  const result: string[] = [];
  for (const entry of value) {
    if (
      typeof entry !== 'string' ||
      !entry ||
      entry.length > 256 ||
      hasControlCharacters(entry) ||
      !validate(entry) ||
      result.includes(entry)
    ) {
      throw new BadRequestException(`${field} contains an invalid value`);
    }
    result.push(entry);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
