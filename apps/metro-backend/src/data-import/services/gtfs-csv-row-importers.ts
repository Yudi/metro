import { GTFSConfig, GTFSFeed } from '../config/gtfs.config';
import { StopRecord, ValidationResult } from '../types/gtfs.types';
import {
  CsvRecord,
  conditionalRouteName,
  optionalColor,
  requiredText,
  strictDate,
  strictFloat,
  strictInt,
  strictRouteType,
  strictTime,
} from './csv-field.utils';

export type { CsvRecord } from './csv-field.utils';

export type SqlValue = string | number | null;

export type SqlExecutor = {
  $executeRaw(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
};

export interface CsvImportContext {
  mapRows<T extends SqlValue[]>(
    fileName: string,
    records: CsvRecord[],
    mapper: (record: CsvRecord) => T,
  ): T[];
  insertRows(
    tx: SqlExecutor,
    tableName: string,
    columns: string[],
    rows: SqlValue[][],
  ): Promise<void>;
  validateStopRecords(records: CsvRecord[]): ValidationResult<StopRecord>;
  warn(message: string): void;
}

export async function importAgency(
  context: CsvImportContext,
  tx: SqlExecutor,
  records: CsvRecord[],
  fileName: string,
  feed: GTFSFeed = 'sptrans',
): Promise<number> {
  const rows = context.mapRows(fileName, records, (record) => [
    record.agency_id?.trim() || '',
    requiredText(record, 'agency_name'),
    requiredText(record, 'agency_url'),
    requiredText(record, 'agency_timezone'),
    record.agency_lang?.trim() || null,
    record.agency_phone?.trim() || null,
    record.agency_fare_url?.trim() || null,
    record.agency_email?.trim() || null,
  ]);
  await context.insertRows(
    tx,
    GTFSConfig.getTableName('agency.txt', feed),
    [
      'agency_id',
      'agency_name',
      'agency_url',
      'agency_timezone',
      'agency_lang',
      'agency_phone',
      'agency_fare_url',
      'agency_email',
    ],
    rows,
  );
  return rows.length;
}

export async function importCalendar(
  context: CsvImportContext,
  tx: SqlExecutor,
  records: CsvRecord[],
  fileName: string,
  feed: GTFSFeed = 'sptrans',
): Promise<number> {
  const rows = context.mapRows(fileName, records, (record) => [
    requiredText(record, 'service_id'),
    strictInt(record, 'monday', { min: 0, max: 1 }),
    strictInt(record, 'tuesday', { min: 0, max: 1 }),
    strictInt(record, 'wednesday', { min: 0, max: 1 }),
    strictInt(record, 'thursday', { min: 0, max: 1 }),
    strictInt(record, 'friday', { min: 0, max: 1 }),
    strictInt(record, 'saturday', { min: 0, max: 1 }),
    strictInt(record, 'sunday', { min: 0, max: 1 }),
    strictDate(record, 'start_date'),
    strictDate(record, 'end_date'),
  ]);
  await context.insertRows(
    tx,
    GTFSConfig.getTableName('calendar.txt', feed),
    [
      'service_id',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
      'start_date',
      'end_date',
    ],
    rows,
  );
  return rows.length;
}

export async function importCalendarDates(
  context: CsvImportContext,
  tx: SqlExecutor,
  records: CsvRecord[],
  fileName: string,
  feed: GTFSFeed = 'sptrans',
): Promise<number> {
  const rows = context.mapRows(fileName, records, (record) => [
    requiredText(record, 'service_id'),
    strictDate(record, 'date'),
    strictInt(record, 'exception_type', { min: 1, max: 2 }),
  ]);
  await context.insertRows(
    tx,
    GTFSConfig.getTableName('calendar_dates.txt', feed),
    ['service_id', 'date', 'exception_type'],
    rows,
  );
  return rows.length;
}

export async function importRoutes(
  context: CsvImportContext,
  tx: SqlExecutor,
  records: CsvRecord[],
  fileName: string,
  feed: GTFSFeed = 'sptrans',
): Promise<number> {
  const rows = context.mapRows(fileName, records, (record) => [
    requiredText(record, 'route_id'),
    record.agency_id?.trim() || '',
    conditionalRouteName(record, 'route_short_name', 'route_long_name'),
    conditionalRouteName(record, 'route_long_name', 'route_short_name'),
    strictRouteType(record),
    optionalColor(record, 'route_color', () =>
      context.warn(
        'Ignoring malformed optional route_color: expected a six-digit hexadecimal color',
      ),
    ),
    optionalColor(record, 'route_text_color', () =>
      context.warn(
        'Ignoring malformed optional route_text_color: expected a six-digit hexadecimal color',
      ),
    ),
  ]);
  await context.insertRows(
    tx,
    GTFSConfig.getTableName('routes.txt', feed),
    [
      'route_id',
      'agency_id',
      'route_short_name',
      'route_long_name',
      'route_type',
      'route_color',
      'route_text_color',
    ],
    rows,
  );
  return rows.length;
}

export async function importStops(
  context: CsvImportContext,
  tx: SqlExecutor,
  records: CsvRecord[],
  fileName: string,
  feed: GTFSFeed = 'sptrans',
): Promise<number> {
  const validationResult = context.validateStopRecords(records);
  if (validationResult.invalid.length > 0) {
    const firstInvalid = validationResult.invalid[0];
    context.warn(
      `Skipped ${validationResult.invalid.length} malformed stop row${
        validationResult.invalid.length === 1 ? '' : 's'
      } from ${fileName}; first rejection: ${firstInvalid.errors.join(', ')}`,
    );
  }

  await context.insertRows(
    tx,
    GTFSConfig.getTableName('stops.txt', feed),
    [
      'stop_id',
      'stop_name',
      'stop_desc',
      'platform_code',
      'stop_lat',
      'stop_lon',
    ],
    validationResult.valid.map((record) => [
      record.stop_id,
      record.stop_name,
      record.stop_desc || null,
      record.platform_code || null,
      record.stop_lat,
      record.stop_lon,
    ]),
  );
  return validationResult.valid.length;
}

export async function importTrips(
  context: CsvImportContext,
  tx: SqlExecutor,
  records: CsvRecord[],
  fileName: string,
  feed: GTFSFeed = 'sptrans',
): Promise<number> {
  const rows = context.mapRows(fileName, records, (record) => [
    requiredText(record, 'route_id'),
    requiredText(record, 'service_id'),
    requiredText(record, 'trip_id'),
    record.trip_headsign?.trim() || '',
    record.direction_id?.trim()
      ? strictInt(record, 'direction_id', { min: 0, max: 1 })
      : 0,
    record.shape_id?.trim() || '',
  ]);
  await context.insertRows(
    tx,
    GTFSConfig.getTableName('trips.txt', feed),
    [
      'route_id',
      'service_id',
      'trip_id',
      'trip_headsign',
      'direction_id',
      'shape_id',
    ],
    rows,
  );
  return rows.length;
}

export async function importStopTimes(
  context: CsvImportContext,
  tx: SqlExecutor,
  records: CsvRecord[],
  fileName: string,
  feed: GTFSFeed = 'sptrans',
): Promise<number> {
  const rows = context.mapRows(fileName, records, (record) => [
    requiredText(record, 'trip_id'),
    strictTime(record, 'arrival_time'),
    strictTime(record, 'departure_time'),
    requiredText(record, 'stop_id'),
    strictInt(record, 'stop_sequence', { min: 0 }),
  ]);
  await context.insertRows(
    tx,
    GTFSConfig.getTableName('stop_times.txt', feed),
    ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
    rows,
  );
  return rows.length;
}

export async function importFrequencies(
  context: CsvImportContext,
  tx: SqlExecutor,
  records: CsvRecord[],
  fileName: string,
  feed: GTFSFeed = 'sptrans',
): Promise<number> {
  const rows = context.mapRows(fileName, records, (record) => [
    requiredText(record, 'trip_id'),
    strictTime(record, 'start_time'),
    strictTime(record, 'end_time'),
    strictInt(record, 'headway_secs', { min: 1 }),
  ]);
  await context.insertRows(
    tx,
    GTFSConfig.getTableName('frequencies.txt', feed),
    ['trip_id', 'start_time', 'end_time', 'headway_secs'],
    rows,
  );
  return rows.length;
}

export async function importFareAttributes(
  context: CsvImportContext,
  tx: SqlExecutor,
  records: CsvRecord[],
  fileName: string,
  feed: GTFSFeed = 'sptrans',
): Promise<number> {
  const rows = context.mapRows(fileName, records, (record) => [
    requiredText(record, 'fare_id'),
    strictFloat(record, 'price', { min: 0 }),
    requiredText(record, 'currency_type'),
    strictInt(record, 'payment_method', { min: 0, max: 2 }),
    strictInt(record, 'transfers', { min: 0, max: 2 }),
    record.transfer_duration?.trim()
      ? strictInt(record, 'transfer_duration', { min: 0 })
      : null,
    record.agency_id?.trim() || null,
  ]);
  await context.insertRows(
    tx,
    GTFSConfig.getTableName('fare_attributes.txt', feed),
    [
      'fare_id',
      'price',
      'currency_type',
      'payment_method',
      'transfers',
      'transfer_duration',
      'agency_id',
    ],
    rows,
  );
  return rows.length;
}

export async function importFareRules(
  context: CsvImportContext,
  tx: SqlExecutor,
  records: CsvRecord[],
  fileName: string,
  feed: GTFSFeed = 'sptrans',
): Promise<number> {
  const rows = context.mapRows(fileName, records, (record) => [
    requiredText(record, 'fare_id'),
    requiredText(record, 'route_id'),
    record.origin_id?.trim() || null,
    record.destination_id?.trim() || null,
    record.contains_id?.trim() || null,
  ]);
  await context.insertRows(
    tx,
    GTFSConfig.getTableName('fare_rules.txt', feed),
    ['fare_id', 'route_id', 'origin_id', 'destination_id', 'contains_id'],
    rows,
  );
  return rows.length;
}

export async function importFeedInfo(
  context: CsvImportContext,
  tx: SqlExecutor,
  records: CsvRecord[],
  fileName: string,
  feed: GTFSFeed = 'sptrans',
): Promise<number> {
  const rows = context.mapRows(fileName, records, (record) => [
    requiredText(record, 'feed_publisher_name'),
    record.feed_publisher_url?.trim() || null,
    record.feed_lang?.trim() || null,
    record.feed_start_date?.trim()
      ? strictDate(record, 'feed_start_date')
      : null,
    record.feed_end_date?.trim() ? strictDate(record, 'feed_end_date') : null,
    record.feed_version?.trim() || null,
    record.feed_contact_email?.trim() || null,
  ]);
  await context.insertRows(
    tx,
    GTFSConfig.getTableName('feed_info.txt', feed),
    [
      'feed_publisher_name',
      'feed_publisher_url',
      'feed_lang',
      'feed_start_date',
      'feed_end_date',
      'feed_version',
      'feed_contact_email',
    ],
    rows,
  );
  return rows.length;
}
