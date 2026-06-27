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

@Injectable()
export class CsvProcessingService {
  private readonly logger = new Logger(CsvProcessingService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readonly rawGtfsTables = new Set(GTFSConfig.getRawTables());

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
  private async *readCsvBatches(
    filePath: string,
  ): AsyncGenerator<CsvRecord[]> {
    const stream = createReadStream(filePath).pipe(csv()) as AsyncIterable<CsvRecord>;
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
        return this.importAgency(tx, records);
      case 'SPTrans_Calendar':
        return this.importCalendar(tx, records);
      case 'SPTrans_Route':
        return this.importRoutes(tx, records);
      case 'SPTrans_Stop':
        return this.importStops(tx, records);
      case 'SPTrans_Trip':
        return this.importTrips(tx, records);
      case 'SPTrans_StopTime':
        return this.importStopTimes(tx, records);
      case 'SPTrans_Frequency':
        return this.importFrequencies(tx, records);
      case 'SPTrans_FareAttribute':
        return this.importFareAttributes(tx, records);
      case 'SPTrans_FareRule':
        return this.importFareRules(tx, records);
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
  ): Promise<number> {
    const validRecords = records.filter((r) => r.agency_id && r.agency_name);

    await this.insertRows(tx, 'SPTrans_Agency', [
      'agency_id',
      'agency_name',
      'agency_url',
      'agency_timezone',
      'agency_lang',
      'agency_phone',
      'agency_fare_url',
    ], validRecords.map((record) => [
      record.agency_id,
      record.agency_name,
      record.agency_url || '',
      record.agency_timezone || '',
      record.agency_lang || null,
      record.agency_phone || null,
      record.agency_fare_url || null,
    ]));

    return validRecords.length;
  }

  /**
   * Import calendar records
   */
  private async importCalendar(
    tx: SqlExecutor,
    records: CsvRecord[],
  ): Promise<number> {
    const validRecords = records.filter((r) => r.service_id);

    await this.insertRows(tx, 'SPTrans_Calendar', [
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
    ], validRecords.map((record) => [
      record.service_id,
      parseInt(record.monday) || 0,
      parseInt(record.tuesday) || 0,
      parseInt(record.wednesday) || 0,
      parseInt(record.thursday) || 0,
      parseInt(record.friday) || 0,
      parseInt(record.saturday) || 0,
      parseInt(record.sunday) || 0,
      record.start_date || '',
      record.end_date || '',
    ]));

    return validRecords.length;
  }

  /**
   * Import route records
   */
  private async importRoutes(
    tx: SqlExecutor,
    records: CsvRecord[],
  ): Promise<number> {
    const validRecords = records.filter(
      (r) => r.route_id && r.route_short_name,
    );

    await this.insertRows(tx, 'SPTrans_Route', [
      'route_id',
      'agency_id',
      'route_short_name',
      'route_long_name',
      'route_type',
      'route_color',
      'route_text_color',
    ], validRecords.map((record) => [
      record.route_id,
      record.agency_id || '',
      record.route_short_name,
      record.route_long_name || '',
      parseInt(record.route_type) || 0,
      record.route_color || '',
      record.route_text_color || '',
    ]));

    return validRecords.length;
  }

  /**
   * Import stop records with type safety and PostGIS geography
   */
  private async importStops(
    tx: SqlExecutor,
    records: CsvRecord[],
  ): Promise<number> {
    // Step 1: Validate and transform records with type safety
    const validationResult = this.validateStopRecords(records);

    if (validationResult.invalid.length > 0) {
      this.logger.warn(
        `Found ${validationResult.invalid.length} invalid stop records`,
      );
      validationResult.invalid.forEach((invalidRecord) => {
        this.logger.warn(
          `Invalid stop record ${
            invalidRecord.record.stop_id
          }: ${invalidRecord.errors.join(', ')}`,
        );
      });
    }

    if (validationResult.valid.length === 0) {
      this.logger.warn('No valid stop records to import');
      return 0;
    }

    // Step 2: Import CSV data using raw SQL into the external GTFS schema
    await this.insertRows(tx, 'SPTrans_Stop', [
      'stop_id',
      'stop_name',
      'stop_desc',
      'stop_lat',
      'stop_lon',
    ], validationResult.valid.map((record: StopRecord) => [
        record.stop_id,
        record.stop_name,
        record.stop_desc || null,
        record.stop_lat,
        record.stop_lon,
      ]));

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
      if (!record.stop_lat) errors.push('stop_lat is required');
      if (!record.stop_lon) errors.push('stop_lon is required');

      // Coordinate validation
      const lat = parseFloat(record.stop_lat);
      const lon = parseFloat(record.stop_lon);

      if (isNaN(lat)) errors.push('stop_lat must be a valid number');
      if (isNaN(lon)) errors.push('stop_lon must be a valid number');
      if (lat < -90 || lat > 90)
        errors.push('stop_lat must be between -90 and 90');
      if (lon < -180 || lon > 180)
        errors.push('stop_lon must be between -180 and 180');

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
  ): Promise<number> {
    const validRecords = records.filter((r) => r.trip_id && r.route_id);

    await this.insertRows(tx, 'SPTrans_Trip', [
      'route_id',
      'service_id',
      'trip_id',
      'trip_headsign',
      'direction_id',
      'shape_id',
    ], validRecords.map((record) => [
      record.route_id,
      record.service_id || '',
      record.trip_id,
      record.trip_headsign || '',
      parseInt(record.direction_id) || 0,
      record.shape_id || '',
    ]));

    return validRecords.length;
  }

  /**
   * Import stop time records
   */
  private async importStopTimes(
    tx: SqlExecutor,
    records: CsvRecord[],
  ): Promise<number> {
    const validRecords = records.filter((r) => r.trip_id && r.stop_id);

    await this.insertRows(tx, 'SPTrans_StopTime', [
      'trip_id',
      'arrival_time',
      'departure_time',
      'stop_id',
      'stop_sequence',
    ], validRecords.map((record) => [
      record.trip_id,
      record.arrival_time || '',
      record.departure_time || '',
      record.stop_id,
      parseInt(record.stop_sequence) || 0,
    ]));

    return validRecords.length;
  }

  /**
   * Import frequency records
   */
  private async importFrequencies(
    tx: SqlExecutor,
    records: CsvRecord[],
  ): Promise<number> {
    const validRecords = records.filter((r) => r.trip_id);

    await this.insertRows(tx, 'SPTrans_Frequency', [
      'trip_id',
      'start_time',
      'end_time',
      'headway_secs',
    ], validRecords.map((record) => [
      record.trip_id,
      record.start_time || '',
      record.end_time || '',
      parseInt(record.headway_secs) || 0,
    ]));

    return validRecords.length;
  }

  /**
   * Import fare attribute records
   */
  private async importFareAttributes(
    tx: SqlExecutor,
    records: CsvRecord[],
  ): Promise<number> {
    const validRecords = records.filter((r) => r.fare_id);

    await this.insertRows(tx, 'SPTrans_FareAttribute', [
      'fare_id',
      'price',
      'currency_type',
      'payment_method',
      'transfers',
      'transfer_duration',
    ], validRecords.map((record) => [
      record.fare_id,
      parseFloat(record.price) || 0,
      record.currency_type || '',
      parseInt(record.payment_method) || 0,
      parseInt(record.transfers) || 0,
      record.transfer_duration ? parseInt(record.transfer_duration) : null,
    ]));

    return validRecords.length;
  }

  /**
   * Import fare rule records
   */
  private async importFareRules(
    tx: SqlExecutor,
    records: CsvRecord[],
  ): Promise<number> {
    const validRecords = records.filter((r) => r.fare_id);

    await this.insertRows(tx, 'SPTrans_FareRule', [
      'fare_id',
      'route_id',
      'origin_id',
      'destination_id',
      'contains_id',
    ], validRecords.map((record) => [
      record.fare_id,
      record.route_id || '',
      record.origin_id || null,
      record.destination_id || null,
      record.contains_id || null,
    ]));

    return validRecords.length;
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
    const quotedColumns = insertColumns.map((column) => this.quoteIdent(column));
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
      return 0;
    }
  }

  /**
   * Disconnect Prisma client
   */
  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
