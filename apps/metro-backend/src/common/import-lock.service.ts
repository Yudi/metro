import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

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
  ): Promise<T> {
    const client = await this.pool.connect();
    let lockAcquired = false;

    try {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [lockName],
      );

      lockAcquired = result.rows[0]?.locked === true;
      if (!lockAcquired) {
        throw new Error(`${operation} already in progress in another process`);
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
