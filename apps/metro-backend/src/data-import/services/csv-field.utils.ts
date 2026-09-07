export interface CsvRecord {
  [key: string]: string;
}

export interface NumericFieldOptions {
  min?: number;
  max?: number;
}

export function requiredText(record: CsvRecord, field: string): string {
  const value = record[field]?.trim();
  if (!value) {
    throw new Error(`${field} is required`);
  }

  return value;
}

export function conditionalRouteName(
  record: CsvRecord,
  field: 'route_short_name' | 'route_long_name',
  alternativeField: 'route_short_name' | 'route_long_name',
): string {
  const value = record[field]?.trim() || '';
  if (!value && !record[alternativeField]?.trim()) {
    throw new Error('route_short_name or route_long_name must be provided');
  }
  return value;
}

export function optionalColor(
  record: CsvRecord,
  field: string,
  onMalformed?: () => void,
): string {
  const value = record[field]?.trim().replace(/^#/, '') || '';
  if (value && !/^[0-9A-Fa-f]{6}$/.test(value)) {
    onMalformed?.();
    return '';
  }
  return value.toUpperCase();
}

export function strictInt(
  record: CsvRecord,
  field: string,
  options: NumericFieldOptions = {},
): number {
  const value = record[field]?.trim();
  if (!value || !/^-?\d+$/.test(value)) {
    throw new Error(`${field} must be an integer`);
  }

  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    (options.min !== undefined && parsed < options.min) ||
    (options.max !== undefined && parsed > options.max)
  ) {
    throw new Error(`${field} is outside the allowed range`);
  }

  return parsed;
}

export function strictFloat(
  record: CsvRecord,
  field: string,
  options: NumericFieldOptions = {},
): number {
  const value = record[field]?.trim();
  if (!value || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
    throw new Error(`${field} must be a number`);
  }

  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    (options.min !== undefined && parsed < options.min) ||
    (options.max !== undefined && parsed > options.max)
  ) {
    throw new Error(`${field} is outside the allowed range`);
  }

  return parsed;
}

export function strictDate(record: CsvRecord, field: string): string {
  const value = requiredText(record, field);
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`${field} must use YYYYMMDD format`);
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${field} is not a valid calendar date`);
  }

  return value;
}

export function strictTime(record: CsvRecord, field: string): string {
  const value = requiredText(record, field);
  const match = value.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
  if (!match || Number(match[1]) > 99) {
    throw new Error(`${field} must use GTFS HH:MM:SS format`);
  }

  return value;
}

export function strictRouteType(record: CsvRecord): number {
  const value = strictInt(record, 'route_type', { min: 0, max: 999 });
  if (value > 12 && value < 100) {
    throw new Error('route_type is not a valid GTFS route type');
  }

  return value;
}
