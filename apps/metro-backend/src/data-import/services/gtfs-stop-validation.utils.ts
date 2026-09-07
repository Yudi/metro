import type { StopRecord, ValidationResult } from '../types/gtfs.types';
import type { CsvRecord } from './csv-field.utils';

export function validateStopRecords(
  records: CsvRecord[],
  parseFloat: (
    record: CsvRecord,
    field: string,
    options: { min?: number; max?: number },
  ) => number,
): ValidationResult<StopRecord> {
  const valid: StopRecord[] = [];
  const invalid: Array<{
    record: Record<string, unknown>;
    errors: string[];
  }> = [];

  for (const record of records) {
    const errors: string[] = [];
    if (!record.stop_id) errors.push('stop_id is required');
    if (!record.stop_name) errors.push('stop_name is required');
    if (!record.stop_lat?.trim()) errors.push('stop_lat is required');
    if (!record.stop_lon?.trim()) errors.push('stop_lon is required');

    let lat = Number.NaN;
    let lon = Number.NaN;
    try {
      lat = parseFloat(record, 'stop_lat', { min: -90, max: 90 });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'invalid stop_lat');
    }
    try {
      lon = parseFloat(record, 'stop_lon', { min: -180, max: 180 });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'invalid stop_lon');
    }

    if (errors.length > 0) {
      invalid.push({ record, errors });
    } else {
      valid.push({
        stop_id: record.stop_id.trim(),
        stop_name: record.stop_name.trim(),
        stop_desc: record.stop_desc?.trim() || undefined,
        platform_code:
          record.platform_code?.trim() ||
          record.stop_platform_code?.trim() ||
          record.platform?.trim() ||
          undefined,
        stop_lat: lat,
        stop_lon: lon,
      });
    }
  }

  return { valid, invalid };
}
