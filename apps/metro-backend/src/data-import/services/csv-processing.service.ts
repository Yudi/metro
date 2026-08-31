import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import csv from 'csv-parser';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { GTFSConfig } from '../config/gtfs.config';
import { StopRecord, ValidationResult } from '../types/gtfs.types';

interface CsvRecord {
  [key: string]: string;
}

const CSV_BATCH_SIZE = 1_000;

type SqlValue = string | number | null;
type SqlExecutor = {
  $executeRaw(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
};

type RowMapper<T extends SqlValue[]> = (record: CsvRecord) => T;

@Injectable()
export class CsvProcessingService {
  private readonly logger = new Logger(CsvProcessingService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readonly rawGtfsTables = new Set(GTFSConfig.getRawTables());

  private requiredText(record: CsvRecord, field: string): string {
    const value = record[field]?.trim();
    if (!value) {
      throw new Error(`${field} is required`);
    }

    return value;
  }

  private conditionalRouteName(
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

  private optionalColor(record: CsvRecord, field: string): string {
    const value = record[field]?.trim().replace(/^#/, '') || '';
    if (value && !/^[0-9A-Fa-f]{6}$/.test(value)) {
      this.logger.warn(
        `Ignoring malformed optional ${field}: expected a six-digit hexadecimal color`,
      );
      return '';
    }
    return value.toUpperCase();
  }

  private strictInt(
    record: CsvRecord,
    field: string,
    options: { min?: number; max?: number } = {},
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

  private strictFloat(
    record: CsvRecord,
    field: string,
    options: { min?: number; max?: number } = {},
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

  private strictDate(record: CsvRecord, field: string): string {
    const value = this.requiredText(record, field);
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

  private strictTime(record: CsvRecord, field: string): string {
    const value = this.requiredText(record, field);
    const match = value.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
    if (!match || Number(match[1]) > 99) {
      throw new Error(`${field} must use GTFS HH:MM:SS format`);
    }

    return value;
  }

  private strictRouteType(record: CsvRecord): number {
    const value = this.strictInt(record, 'route_type', { min: 0, max: 999 });
    if (value > 12 && value < 100) {
      throw new Error('route_type is not a valid GTFS route type');
    }

    return value;
  }

  private mapRows<T extends SqlValue[]>(
    fileName: string,
    records: CsvRecord[],
    mapper: RowMapper<T>,
  ): T[] {
    const rows: T[] = [];
    let rejectedCount = 0;
    let firstRejection: string | undefined;

    records.forEach((record, index) => {
      try {
        rows.push(mapper(record));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid row';
        rejectedCount++;
        firstRejection ??= `batch row ${index + 1}: ${message}`;
      }
    });

    if (rejectedCount > 0) {
      this.logger.warn(
        `Skipped ${rejectedCount} malformed row(s) from ${fileName}; first rejection: ${firstRejection}`,
      );
    }

    return rows;
  }

  /**
   * Process a single CSV file and sync to database using transaction
   */
  async processCsvFile(filePath: string, fileName: string): Promise<number> {
    const tableName = GTFSConfig.getTableName(fileName);
    this.logger.debug(`Processing ${fileName} -> ${tableName}`);

    try {
      const recordCount = await this.syncRecordsToTable(
        tableName,
        fileName,
        filePath,
      );

      this.logger.debug(
        `Successfully synced ${recordCount} records to ${tableName}`,
      );
      return recordCount;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to process ${fileName}:`, errorMessage);
      throw new Error(`CSV processing failed for ${fileName}: ${errorMessage}`);
    }
  }

  /**
   * Read CSV file in bounded batches.
   */
  private async *readCsvBatches(filePath: string): AsyncGenerator<CsvRecord[]> {
    const input = createReadStream(filePath);
    const parser = input.pipe(csv());
    // csv-parser does not always forward an input stream open/read error to
    // its async iterator. Forward it explicitly so callers can fail the run
    // instead of hanging and later recording a zero count.
    input.on('error', (error) => parser.destroy(error));
    const stream = parser as AsyncIterable<CsvRecord>;
    let batch: CsvRecord[] = [];

    for await (const record of stream) {
      batch.push(record);
      if (batch.length >= CSV_BATCH_SIZE) {
        yield batch;
        batch = [];
      }
    }

    if (batch.length > 0) {
      yield batch;
    }
  }

  /**
   * Sync records to table using transaction (truncate and reimport)
   */
  private async syncRecordsToTable(
    tableName: string,
    fileName: string,
    filePath: string,
  ): Promise<number> {
    return await this.prisma.$transaction(
      async (tx) => {
        await this.truncateTable(tx, tableName);

        let recordCount = 0;
        for await (const records of this.readCsvBatches(filePath)) {
          recordCount += await this.importRecordsBatch(
            tx,
            tableName,
            fileName,
            records,
          );
        }

        if (recordCount === 0) {
          this.logger.warn(`No records found in ${fileName}`);
          throw new Error(`${fileName} contains no usable records`);
        }

        if (tableName === 'SPTrans_Stop' && recordCount > 0) {
          await this.updateStopGeography(tx);
        }

        this.logger.debug(
          `Transaction completed for ${tableName}: ${recordCount} records`,
        );
        return recordCount;
      },
      {
        maxWait: 600000, // 10 minutes max wait
        timeout: 900000, // 15 minutes timeout
      },
    );
  }

  /**
   * Truncate table data
   */
  private async truncateTable(
    tx: SqlExecutor,
    tableName: string,
  ): Promise<void> {
    try {
      const qualifiedTable = this.getQualifiedGtfsTable(tableName);
      await tx.$executeRawUnsafe(
        `TRUNCATE TABLE ${qualifiedTable} RESTART IDENTITY CASCADE`,
      );
      this.logger.debug(`Truncated ${tableName}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to truncate table ${tableName}:`, errorMessage);
      throw new Error(`Table truncate failed: ${errorMessage}`);
    }
  }

  /**
   * Import records within transaction
   */
  private async importRecordsBatch(
    tx: SqlExecutor,
    tableName: string,
    fileName: string,
    records: CsvRecord[],
  ): Promise<number> {
    switch (tableName) {
      case 'SPTrans_Agency':
        return this.importAgency(tx, records, fileName);
      case 'SPTrans_Calendar':
        return this.importCalendar(tx, records, fileName);
      case 'SPTrans_Route':
        return this.importRoutes(tx, records, fileName);
      case 'SPTrans_Stop':
        return this.importStops(tx, records, fileName);
      case 'SPTrans_Trip':
        return this.importTrips(tx, records, fileName);
      case 'SPTrans_StopTime':
        return this.importStopTimes(tx, records, fileName);
      case 'SPTrans_Frequency':
        return this.importFrequencies(tx, records, fileName);
      case 'SPTrans_FareAttribute':
        return this.importFareAttributes(tx, records, fileName);
      case 'SPTrans_FareRule':
        return this.importFareRules(tx, records, fileName);
      case 'SPTrans_Shape':
        // Shapes are processed by Rust tool, skip here
        this.logger.debug(`Skipping ${fileName} - processed by Rust tool`);
        return 0;
      default:
        this.logger.warn(`No import handler for table: ${tableName}`);
        return 0;
    }
  }

  /**
   * Import agency records
   */
  private async importAgency(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
  ): Promise<number> {
    const rows = this.mapRows(fileName, records, (record) => [
      record.agency_id?.trim() || '',
      this.requiredText(record, 'agency_name'),
      this.requiredText(record, 'agency_url'),
      this.requiredText(record, 'agency_timezone'),
      record.agency_lang?.trim() || null,
      record.agency_phone?.trim() || null,
      record.agency_fare_url?.trim() || null,
    ]);
    await this.insertRows(
      tx,
      'SPTrans_Agency',
      [
        'agency_id',
        'agency_name',
        'agency_url',
        'agency_timezone',
        'agency_lang',
        'agency_phone',
        'agency_fare_url',
      ],
      rows,
    );

    return rows.length;
  }

  /**
   * Import calendar records
   */
  private async importCalendar(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
  ): Promise<number> {
    const rows = this.mapRows(fileName, records, (record) => [
      this.requiredText(record, 'service_id'),
      this.strictInt(record, 'monday', { min: 0, max: 1 }),
      this.strictInt(record, 'tuesday', { min: 0, max: 1 }),
      this.strictInt(record, 'wednesday', { min: 0, max: 1 }),
      this.strictInt(record, 'thursday', { min: 0, max: 1 }),
      this.strictInt(record, 'friday', { min: 0, max: 1 }),
      this.strictInt(record, 'saturday', { min: 0, max: 1 }),
      this.strictInt(record, 'sunday', { min: 0, max: 1 }),
      this.strictDate(record, 'start_date'),
      this.strictDate(record, 'end_date'),
    ]);
    await this.insertRows(
      tx,
      'SPTrans_Calendar',
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

  /**
   * Import route records
   */
  private async importRoutes(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
  ): Promise<number> {
    const rows = this.mapRows(fileName, records, (record) => [
      this.requiredText(record, 'route_id'),
      record.agency_id?.trim() || '',
      this.conditionalRouteName(record, 'route_short_name', 'route_long_name'),
      this.conditionalRouteName(record, 'route_long_name', 'route_short_name'),
      this.strictRouteType(record),
      this.optionalColor(record, 'route_color'),
      this.optionalColor(record, 'route_text_color'),
    ]);
    await this.insertRows(
      tx,
      'SPTrans_Route',
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

  /**
   * Import stop records with type safety and PostGIS geography
   */
  private async importStops(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
  ): Promise<number> {
    // Step 1: Validate and transform records with type safety
    const validationResult = this.validateStopRecords(records);

    if (validationResult.invalid.length > 0) {
      const firstInvalid = validationResult.invalid[0];
      this.logger.warn(
        `Skipped ${validationResult.invalid.length} malformed stop row(s) from ${fileName}; first rejection: ${firstInvalid.errors.join(', ')}`,
      );
    }

    // Step 2: Import CSV data using raw SQL into the external GTFS schema
    await this.insertRows(
      tx,
      'SPTrans_Stop',
      ['stop_id', 'stop_name', 'stop_desc', 'stop_lat', 'stop_lon'],
      validationResult.valid.map((record: StopRecord) => [
        record.stop_id,
        record.stop_name,
        record.stop_desc || null,
        record.stop_lat,
        record.stop_lon,
      ]),
    );

    return validationResult.valid.length;
  }

  /**
   * Validate stop records with proper TypeScript typing
   */
  private validateStopRecords(
    records: CsvRecord[],
  ): ValidationResult<StopRecord> {
    const valid: StopRecord[] = [];
    const invalid: Array<{
      record: Record<string, unknown>;
      errors: string[];
    }> = [];

    for (const record of records) {
      const errors: string[] = [];

      // Required field validation
      if (!record.stop_id) errors.push('stop_id is required');
      if (!record.stop_name) errors.push('stop_name is required');
      if (!record.stop_lat?.trim()) errors.push('stop_lat is required');
      if (!record.stop_lon?.trim()) errors.push('stop_lon is required');

      // Coordinate validation
      let lat = Number.NaN;
      let lon = Number.NaN;
      try {
        lat = this.strictFloat(record, 'stop_lat', { min: -90, max: 90 });
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : 'invalid stop_lat',
        );
      }
      try {
        lon = this.strictFloat(record, 'stop_lon', { min: -180, max: 180 });
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : 'invalid stop_lon',
        );
      }

      if (errors.length > 0) {
        invalid.push({ record, errors });
      } else {
        valid.push({
          stop_id: record.stop_id,
          stop_name: record.stop_name,
          stop_desc: record.stop_desc || undefined,
          stop_lat: lat,
          stop_lon: lon,
        });
      }
    }

    return { valid, invalid };
  }

  /**
   * Update PostGIS geography column for all stops in a single batch operation
   */
  private async updateStopGeography(tx: SqlExecutor): Promise<void> {
    await tx.$executeRaw`
      UPDATE external_gtfs."SPTrans_Stop" 
      SET location = ST_SetSRID(ST_MakePoint(stop_lon, stop_lat), 4326)::geography 
      WHERE location IS NULL
    `;
  }

  /**
   * Import trip records
   */
  private async importTrips(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
  ): Promise<number> {
    const rows = this.mapRows(fileName, records, (record) => [
      this.requiredText(record, 'route_id'),
      this.requiredText(record, 'service_id'),
      this.requiredText(record, 'trip_id'),
      record.trip_headsign?.trim() || '',
      record.direction_id?.trim()
        ? this.strictInt(record, 'direction_id', { min: 0, max: 1 })
        : 0,
      record.shape_id?.trim() || '',
    ]);
    await this.insertRows(
      tx,
      'SPTrans_Trip',
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

  /**
   * Import stop time records
   */
  private async importStopTimes(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
  ): Promise<number> {
    const rows = this.mapRows(fileName, records, (record) => [
      this.requiredText(record, 'trip_id'),
      this.strictTime(record, 'arrival_time'),
      this.strictTime(record, 'departure_time'),
      this.requiredText(record, 'stop_id'),
      this.strictInt(record, 'stop_sequence', { min: 1 }),
    ]);
    await this.insertRows(
      tx,
      'SPTrans_StopTime',
      ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
      rows,
    );

    return rows.length;
  }

  /**
   * Import frequency records
   */
  private async importFrequencies(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
  ): Promise<number> {
    const rows = this.mapRows(fileName, records, (record) => [
      this.requiredText(record, 'trip_id'),
      this.strictTime(record, 'start_time'),
      this.strictTime(record, 'end_time'),
      this.strictInt(record, 'headway_secs', { min: 1 }),
    ]);
    await this.insertRows(
      tx,
      'SPTrans_Frequency',
      ['trip_id', 'start_time', 'end_time', 'headway_secs'],
      rows,
    );

    return rows.length;
  }

  /**
   * Import fare attribute records
   */
  private async importFareAttributes(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
  ): Promise<number> {
    const rows = this.mapRows(fileName, records, (record) => [
      this.requiredText(record, 'fare_id'),
      this.strictFloat(record, 'price', { min: 0 }),
      this.requiredText(record, 'currency_type'),
      this.strictInt(record, 'payment_method', { min: 0, max: 2 }),
      this.strictInt(record, 'transfers', { min: 0, max: 2 }),
      record.transfer_duration?.trim()
        ? this.strictInt(record, 'transfer_duration', { min: 0 })
        : null,
    ]);
    await this.insertRows(
      tx,
      'SPTrans_FareAttribute',
      [
        'fare_id',
        'price',
        'currency_type',
        'payment_method',
        'transfers',
        'transfer_duration',
      ],
      rows,
    );

    return rows.length;
  }

  /**
   * Import fare rule records
   */
  private async importFareRules(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
  ): Promise<number> {
    const rows = this.mapRows(fileName, records, (record) => [
      this.requiredText(record, 'fare_id'),
      this.requiredText(record, 'route_id'),
      record.origin_id?.trim() || null,
      record.destination_id?.trim() || null,
      record.contains_id?.trim() || null,
    ]);
    await this.insertRows(
      tx,
      'SPTrans_FareRule',
      ['fare_id', 'route_id', 'origin_id', 'destination_id', 'contains_id'],
      rows,
    );

    return rows.length;
  }

  private async insertRows(
    tx: SqlExecutor,
    tableName: string,
    columns: string[],
    rows: SqlValue[][],
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    const qualifiedTable = this.getQualifiedGtfsTable(tableName);
    const insertColumns = columns.includes('id') ? columns : ['id', ...columns];
    const quotedColumns = insertColumns.map((column) =>
      this.quoteIdent(column),
    );
    const chunkSize = Math.max(1, Math.floor(5000 / insertColumns.length));

    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize);
      const values: SqlValue[] = [];
      const placeholders = chunk.map((row) => {
        if (row.length !== columns.length) {
          throw new Error(`Invalid row width for ${tableName}`);
        }

        const insertRow = columns.includes('id') ? row : [randomUUID(), ...row];
        const rowPlaceholders = insertRow.map((value) => {
          values.push(value);
          return `$${values.length}`;
        });

        return `(${rowPlaceholders.join(', ')})`;
      });

      await tx.$executeRawUnsafe(
        `INSERT INTO ${qualifiedTable} (${quotedColumns.join(', ')}) VALUES ${placeholders.join(', ')}`,
        ...values,
      );
    }
  }

  private getQualifiedGtfsTable(tableName: string): string {
    if (!this.rawGtfsTables.has(tableName)) {
      throw new Error(`Unsupported GTFS table: ${tableName}`);
    }

    return `${this.quoteIdent(GTFSConfig.EXTERNAL_SCHEMA)}.${this.quoteIdent(tableName)}`;
  }

  private quoteIdent(identifier: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
      throw new Error(`Invalid SQL identifier: ${identifier}`);
    }

    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Count records in CSV file
   */
  async countCsvRecords(filePath: string): Promise<number> {
    try {
      let count = 0;
      for await (const records of this.readCsvBatches(filePath)) {
        count += records.length;
      }
      return count;
    } catch (error) {
      this.logger.error(`Failed to count records in ${filePath}:`, error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `CSV record count failed for ${filePath}: ${errorMessage}`,
      );
    }
  }
}
