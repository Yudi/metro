import { randomUUID } from 'crypto';
import { GTFSConfig } from '../config/gtfs.config';
import type { SqlExecutor, SqlValue } from './gtfs-csv-row-importers';
import { withCause } from './data-import-error.utils';

export async function truncateTable(
  tx: SqlExecutor,
  tableName: string,
  qualifiedTable: string,
  logDebug: (message: string) => void,
  logError: (message: string, errorMessage: string) => void,
): Promise<void> {
  try {
    await tx.$executeRawUnsafe(
      `TRUNCATE TABLE ${qualifiedTable} RESTART IDENTITY CASCADE`,
    );
    logDebug(`Truncated ${tableName}`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logError(`Failed to truncate table ${tableName}:`, errorMessage);
    throw withCause(`Table truncate failed: ${errorMessage}`, error);
  }
}

export async function updateStopGeography(
  tx: SqlExecutor,
  qualifiedTable: string,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE ${qualifiedTable}
     SET location = ST_SetSRID(ST_MakePoint(stop_lon, stop_lat), 4326)::geography
     WHERE location IS NULL`,
  );
}

export async function insertRows(
  tx: SqlExecutor,
  tableName: string,
  columns: string[],
  rows: SqlValue[][],
  qualifiedTable: string,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const insertColumns = columns.includes('id') ? columns : ['id', ...columns];
  const quotedColumns = insertColumns.map(quoteIdent);
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

export function qualifyGtfsTable(
  tableName: string,
  rawGtfsTables: ReadonlySet<string>,
): string {
  if (!rawGtfsTables.has(tableName)) {
    throw new Error(`Unsupported GTFS table: ${tableName}`);
  }

  return `${quoteIdent(GTFSConfig.EXTERNAL_SCHEMA)}.${quoteIdent(tableName)}`;
}

export function quoteIdent(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }

  return `"${identifier.replace(/"/g, '""')}"`;
}
