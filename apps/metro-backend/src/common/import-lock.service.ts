import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

export const TRANSIT_CATALOG_IMPORT_LOCK =
  'metro-dev:transit-catalog-import';

export interface ImportLockOptions {
  /**
   * Wait until the lock is released instead of rejecting on contention.
   * Background imports use this so startup ordering cannot drop a run.
   */
  readonly waitForLock?: boolean;
  /** Maximum time to wait for a background lock, when configured. */
  readonly timeoutMs?: number;
}

@Injectable()
export class ImportLockService implements OnModuleDestroy {
  private readonly logger = new Logger(ImportLockService.name);
  private readonly pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      application_name: 'metro-import-locks',
    });
  }

  async withLock<T>(
    lockName: string,
    operation: string,
    action: () => Promise<T>,
    options?: ImportLockOptions,
  ): Promise<T> {
    const client = await this.pool.connect();
    let lockAcquired = false;
    let statementTimeoutConfigured = false;

    try {
      if (options?.waitForLock) {
        if (
          options.timeoutMs !== undefined &&
          (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0)
        ) {
          throw new Error('Import lock timeout must be a positive integer');
        }

        if (options.timeoutMs !== undefined) {
          await client.query('SELECT set_config($1, $2, false)', [
            'statement_timeout',
            `${options.timeoutMs}ms`,
          ]);
          statementTimeoutConfigured = true;
        }

        // A blocking advisory lock is atomic with respect to other processes,
        // so a background import remains queued until the current owner
        // releases the shared catalog lock. PostgreSQL's statement timeout
        // bounds the wait when a configured deadline is supplied.
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [
          lockName,
        ]);
        lockAcquired = true;
      } else {
        const result = await client.query<{ locked: boolean }>(
          'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
          [lockName],
        );

        lockAcquired = result.rows[0]?.locked === true;
        if (!lockAcquired) {
          throw new Error(
            `${operation} already in progress in another process`,
          );
        }
      }

      return await action();
    } finally {
      if (statementTimeoutConfigured) {
        try {
          await client.query('SELECT set_config($1, $2, false)', [
            'statement_timeout',
            '0',
          ]);
        } catch (error) {
          this.logger.warn('Failed to reset import lock statement timeout:', error);
        }
      }

      if (lockAcquired) {
        try {
          await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
            lockName,
          ]);
        } catch (error) {
          this.logger.error(`Failed to release ${operation} lock:`, error);
        }
      }

      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
