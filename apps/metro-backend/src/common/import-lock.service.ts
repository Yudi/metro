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

    try {
      if (options?.waitForLock) {
        // A blocking advisory lock is atomic with respect to other processes,
        // so a background import remains queued until the current owner
        // releases the shared catalog lock.
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
