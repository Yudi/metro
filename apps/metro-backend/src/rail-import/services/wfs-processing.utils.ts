import { createHash } from 'crypto';
import { WFSSourceConfig, WFSConfig } from '../config/wfs.config';
import {
  GeoJsonGeometry,
  WFSFeature,
  WFSFeatureCollection,
} from '../types/wfs.types';

export interface DownloadedWFSLayer {
  text: string;
  fileHash: string;
  fileSize: number;
  featureCollection: WFSFeatureCollection;
  sourceSrid: number;
}

export interface MissingWFSColumn {
  table_name: string;
  column_name: string;
}

export interface WFSFeatureInsert {
  columns: string[];
  values: Array<string | number | null>;
}

export function buildWfsUrl(source: WFSSourceConfig): string {
  const url = new URL(WFSConfig.BASE_URL);
  url.search = new URLSearchParams({
    service: 'WFS',
    version: WFSConfig.WFS_VERSION,
    request: 'GetFeature',
    typeName: source.typeName,
    outputFormat: WFSConfig.OUTPUT_FORMAT,
    srsName: `EPSG:${WFSConfig.TARGET_SRID}`,
  }).toString();

  return url.toString();
}

export function parseFeatureCollection(
  text: string,
  source: WFSSourceConfig,
): WFSFeatureCollection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `GeoSampa WFS did not return JSON for ${source.typeName}: ${previewWfsResponse(text)}`,
    );
  }

  if (!isFeatureCollection(parsed)) {
    throw new Error(`Invalid GeoJSON FeatureCollection for ${source.typeName}`);
  }

  return parsed;
}

export function previewWfsResponse(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

export function extractSrid(
  featureCollection: WFSFeatureCollection,
): number | null {
  const crsName = featureCollection.crs?.properties?.name;
  const match = crsName?.match(/(?:EPSG|epsg\.xml)[^0-9]*(\d+)$/i);
  return match ? Number(match[1]) : null;
}

export function serializeGeometry(geometry: GeoJsonGeometry | null): string {
  if (!geometry) {
    throw new Error('Feature has no geometry');
  }

  return JSON.stringify(geometry);
}

export function validateGeometry(
  source: WFSSourceConfig,
  geometry: GeoJsonGeometry | null,
): void {
  if (!geometry) {
    throw new Error('Feature has no geometry');
  }

  const valid =
    (source.geometryKind === 'point' &&
      ((geometry.type === 'Point' && isPosition(geometry.coordinates)) ||
        (geometry.type === 'MultiPoint' &&
          isPositionCollection(geometry.coordinates)))) ||
    (source.geometryKind === 'line' &&
      ((geometry.type === 'LineString' && isLineString(geometry.coordinates)) ||
        (geometry.type === 'MultiLineString' &&
          Array.isArray(geometry.coordinates) &&
          geometry.coordinates.length > 0 &&
          geometry.coordinates.every((line) => isLineString(line)))));

  if (!valid) {
    throw new Error('Feature geometry contains invalid coordinates');
  }
}

export function getPrimaryIndex(feature: WFSFeature, index: number): string {
  const fromProperties = optionalText(feature.properties ?? {}, [
    'primaryindex',
    'id',
  ]);

  if (fromProperties) {
    return extractNumericSuffix(fromProperties) ?? fromProperties;
  }

  if (feature.id) {
    return extractNumericSuffix(feature.id) ?? feature.id;
  }

  return String(index + 1);
}

export function requiredText(
  properties: Record<string, unknown>,
  names: string[],
): string {
  const value = optionalText(properties, names);
  if (!value) {
    throw new Error(`Missing required WFS property: ${names.join(' or ')}`);
  }

  return value;
}

export function optionalText(
  properties: Record<string, unknown>,
  names: string[],
): string | null {
  const value = getProperty(properties, names);
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function optionalNumber(
  properties: Record<string, unknown>,
  names: string[],
): { value: number | null; malformed: boolean } {
  const value = getProperty(properties, names);
  if (value === null || value === undefined || value === '') {
    return { value: null, malformed: false };
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    ? { value: numberValue, malformed: false }
    : { value: null, malformed: true };
}

/**
 * Hash semantic WFS content rather than transport serialization. Providers
 * are free to reorder features or JSON properties without changing the layer.
 */
export function canonicalWfsHash(
  featureCollection: WFSFeatureCollection,
): string {
  const features = featureCollection.features
    .map((feature) => canonicalize(feature))
    .sort((left, right) => {
      const leftKey = featureSortKey(left);
      const rightKey = featureSortKey(right);
      return leftKey.localeCompare(rightKey);
    });
  const canonical = canonicalize({
    type: featureCollection.type,
    crs: featureCollection.crs,
    features,
  });

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function isFeatureCollection(value: unknown): value is WFSFeatureCollection {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<WFSFeatureCollection>;
  return (
    candidate.type === 'FeatureCollection' && Array.isArray(candidate.features)
  );
}

function isPosition(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every(
      (coordinate) =>
        typeof coordinate === 'number' && Number.isFinite(coordinate),
    )
  );
}

function isPositionCollection(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((position) => isPosition(position))
  );
}

function isLineString(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every((position) => isPosition(position))
  );
}

function getProperty(
  properties: Record<string, unknown>,
  names: string[],
): unknown {
  for (const name of names) {
    if (name in properties) {
      return properties[name];
    }

    const upperName = name.toUpperCase();
    if (upperName in properties) {
      return properties[upperName];
    }
  }

  return null;
}

function extractNumericSuffix(value: string): string | null {
  const match = value.match(/(\d+)$/);
  return match?.[1] ?? null;
}

function featureSortKey(feature: unknown): string {
  if (typeof feature !== 'object' || feature === null) {
    return JSON.stringify(feature);
  }

  const candidate = feature as {
    id?: unknown;
    properties?: Record<string, unknown> | null;
  };
  const stableId =
    candidate.id ??
    candidate.properties?.['primaryindex'] ??
    candidate.properties?.['id'];
  return stableId === undefined ? JSON.stringify(feature) : String(stableId);
}

function canonicalize(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(7)) : null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
}
