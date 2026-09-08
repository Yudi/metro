import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GTFSConfig, GTFSFeed } from '../config/gtfs.config';
import type { StopRecord, ValidationResult } from '../types/gtfs.types';
import { withCause } from './data-import-error.utils';
import { CsvRecord, strictFloat } from './csv-field.utils';
import { validateStopRecords as validateStopRecordsRows } from './gtfs-stop-validation.utils';
import type {
  CsvImportContext,
  SqlExecutor,
  SqlValue,
} from './gtfs-csv-row-importers';
import {
  insertRows as insertRowsSql,
  qualifyGtfsTable,
  quoteIdent,
  truncateTable as truncateTableSql,
  updateStopGeography as updateStopGeographySql,
} from './gtfs-sql.utils';
import { readCsvBatches } from './csv-reader.utils';
import {
  importAgency as importAgencyRows,
  importCalendar as importCalendarRows,
  importCalendarDates as importCalendarDatesRows,
  importFareAttributes as importFareAttributesRows,
  importFareRules as importFareRulesRows,
  importFeedInfo as importFeedInfoRows,
  importFrequencies as importFrequenciesRows,
  importRoutes as importRoutesRows,
  importStopTimes as importStopTimesRows,
  importStops as importStopsRows,
  importTrips as importTripsRows,
} from './gtfs-csv-row-importers';

const CSV_BATCH_SIZE = 1_000;

type RowMapper<T extends SqlValue[]> = (record: CsvRecord) => T;

@Injectable()
export class CsvProcessingService {
  private readonly logger = new Logger(CsvProcessingService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readonly rawGtfsTables = new Set([
    ...GTFSConfig.getRawTables('sptrans'),
    ...GTFSConfig.getRawTables('artesp'),
  ]);

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
        `Skipped ${rejectedCount} malformed row${
          rejectedCount === 1 ? '' : 's'
        } from ${fileName}; first rejection: ${firstRejection}`,
      );
    }

    return rows;
  }

  private importContext(): CsvImportContext {
    return {
      mapRows: this.mapRows.bind(this),
      insertRows: this.insertRows.bind(this),
      validateStopRecords: this.validateStopRecords.bind(this),
      warn: (message) => this.logger.warn(message),
    };
  }

  /**
   * Process a single CSV file and sync to database using transaction
   */
  async processCsvFile(
    filePath: string,
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<number> {
    const tableName = GTFSConfig.getTableName(fileName, feed);
    this.logger.debug(`Processing ${fileName} -> ${tableName}`);

    try {
      const recordCount = await this.syncRecordsToTable(
        tableName,
        fileName,
        filePath,
        feed,
      );

      this.logger.debug(
        `Successfully synced ${recordCount} records to ${tableName}`,
      );
      return recordCount;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to process ${fileName}:`, errorMessage);
      throw withCause(
        `CSV processing failed for ${fileName}: ${errorMessage}`,
        error,
      );
    }
  }

  /**
   * Read CSV file in bounded batches.
   */
  private async *readCsvBatches(filePath: string): AsyncGenerator<CsvRecord[]> {
    yield* readCsvBatches(filePath, CSV_BATCH_SIZE);
  }

  /**
   * Sync records to table using transaction (truncate and reimport)
   */
  private async syncRecordsToTable(
    tableName: string,
    fileName: string,
    filePath: string,
    feed: GTFSFeed,
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
            feed,
          );
        }

        if (
          recordCount === 0 &&
          !GTFSConfig.isEmptyAllowedFile(fileName, feed)
        ) {
          this.logger.warn(`No records found in ${fileName}`);
          throw new Error(`${fileName} contains no usable records`);
        }

        if (fileName === 'stops.txt' && recordCount > 0) {
          await this.updateStopGeography(tx, feed);
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
    return truncateTableSql(
      tx,
      tableName,
      this.getQualifiedGtfsTable(tableName),
      (message) => this.logger.debug(message),
      (message, errorMessage) => this.logger.error(message, errorMessage),
    );
  }

  /**
   * Import records within transaction
   */
  private async importRecordsBatch(
    tx: SqlExecutor,
    tableName: string,
    fileName: string,
    records: CsvRecord[],
    feed: GTFSFeed,
  ): Promise<number> {
    switch (fileName) {
      case 'agency.txt':
        return this.importAgency(tx, records, fileName, feed);
      case 'calendar.txt':
        return this.importCalendar(tx, records, fileName, feed);
      case 'calendar_dates.txt':
        return this.importCalendarDates(tx, records, fileName, feed);
      case 'routes.txt':
        return this.importRoutes(tx, records, fileName, feed);
      case 'stops.txt':
        return this.importStops(tx, records, fileName, feed);
      case 'trips.txt':
        return this.importTrips(tx, records, fileName, feed);
      case 'stop_times.txt':
        return this.importStopTimes(tx, records, fileName, feed);
      case 'frequencies.txt':
        return this.importFrequencies(tx, records, fileName, feed);
      case 'fare_attributes.txt':
        return this.importFareAttributes(tx, records, fileName, feed);
      case 'fare_rules.txt':
        return this.importFareRules(tx, records, fileName, feed);
      case 'feed_info.txt':
        return this.importFeedInfo(tx, records, fileName, feed);
      case 'shapes.txt':
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
    feed: GTFSFeed = 'sptrans',
  ): Promise<number> {
    return importAgencyRows(this.importContext(), tx, records, fileName, feed);
  }

  /**
   * Import calendar records
   */
  private async importCalendar(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<number> {
    return importCalendarRows(
      this.importContext(),
      tx,
      records,
      fileName,
      feed,
    );
  }

  /** Import optional service exceptions from calendar_dates.txt. */
  private async importCalendarDates(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<number> {
    return importCalendarDatesRows(
      this.importContext(),
      tx,
      records,
      fileName,
      feed,
    );
  }

  /**
   * Import route records
   */
  private async importRoutes(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<number> {
    return importRoutesRows(this.importContext(), tx, records, fileName, feed);
  }

  /**
   * Import stop records with type safety and PostGIS geography
   */
  private async importStops(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<number> {
    return importStopsRows(this.importContext(), tx, records, fileName, feed);
  }

  /**
   * Validate stop records with proper TypeScript typing
   */
  private validateStopRecords(
    records: CsvRecord[],
  ): ValidationResult<StopRecord> {
    return validateStopRecordsRows(records, strictFloat);
  }

  /**
   * Update PostGIS geography column for all stops in a single batch operation
   */
  private async updateStopGeography(
    tx: SqlExecutor,
    feed: GTFSFeed = 'sptrans',
  ): Promise<void> {
    const tableName = GTFSConfig.getTableName('stops.txt', feed);
    const qualifiedTable = this.getQualifiedGtfsTable(tableName);
    await updateStopGeographySql(tx, qualifiedTable);
  }

  /**
   * Import trip records
   */
  private async importTrips(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<number> {
    return importTripsRows(this.importContext(), tx, records, fileName, feed);
  }

  /**
   * Import stop time records
   */
  private async importStopTimes(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<number> {
    return importStopTimesRows(
      this.importContext(),
      tx,
      records,
      fileName,
      feed,
    );
  }

  /**
   * Import frequency records
   */
  private async importFrequencies(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<number> {
    return importFrequenciesRows(
      this.importContext(),
      tx,
      records,
      fileName,
      feed,
    );
  }

  /**
   * Import fare attribute records
   */
  private async importFareAttributes(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<number> {
    return importFareAttributesRows(
      this.importContext(),
      tx,
      records,
      fileName,
      feed,
    );
  }

  /**
   * Import fare rule records
   */
  private async importFareRules(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<number> {
    return importFareRulesRows(
      this.importContext(),
      tx,
      records,
      fileName,
      feed,
    );
  }

  private async importFeedInfo(
    tx: SqlExecutor,
    records: CsvRecord[],
    fileName: string,
    feed: GTFSFeed = 'sptrans',
  ): Promise<number> {
    return importFeedInfoRows(
      this.importContext(),
      tx,
      records,
      fileName,
      feed,
    );
  }

  private async insertRows(
    tx: SqlExecutor,
    tableName: string,
    columns: string[],
    rows: SqlValue[][],
  ): Promise<void> {
    return insertRowsSql(
      tx,
      tableName,
      columns,
      rows,
      this.getQualifiedGtfsTable(tableName),
    );
  }

  private getQualifiedGtfsTable(tableName: string): string {
    return qualifyGtfsTable(tableName, this.rawGtfsTables);
  }

  private quoteIdent(identifier: string): string {
    return quoteIdent(identifier);
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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to count records in ${filePath}:`,
        errorMessage,
      );
      throw withCause(
        `CSV record count failed for ${filePath}: ${errorMessage}`,
        error,
      );
    }
  }
}
