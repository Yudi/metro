import { Pool } from 'pg';
import {
  ImportLockService,
  TRANSIT_CATALOG_IMPORT_LOCK,
} from './import-lock.service';

jest.mock('pg', () => ({
  Pool: jest.fn(),
}));

describe('ImportLockService', () => {
  let service: ImportLockService;
  let client: { query: jest.Mock; release: jest.Mock };
  let pool: { connect: jest.Mock; end: jest.Mock };
  let previousDatabaseUrl: string | undefined;

  beforeEach(() => {
    previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://localhost:5432/metro';

    client = {
      query: jest.fn(),
      release: jest.fn(),
    };
    pool = {
      connect: jest.fn().mockResolvedValue(client),
      end: jest.fn().mockResolvedValue(undefined),
    };
    (Pool as unknown as jest.Mock).mockImplementation(() => pool);
    service = new ImportLockService();
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    jest.clearAllMocks();
  });

  it('keeps interactive lock attempts fail-fast by default', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ locked: false }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.withLock(
        TRANSIT_CATALOG_IMPORT_LOCK,
        'manual import',
        jest.fn(),
      ),
    ).rejects.toThrow('manual import already in progress in another process');

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [TRANSIT_CATALOG_IMPORT_LOCK],
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('blocks background lock attempts until the shared lock is available', async () => {
    const action = jest.fn().mockResolvedValue('imported');
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.withLock(
        TRANSIT_CATALOG_IMPORT_LOCK,
        'scheduled import',
        action,
        { waitForLock: true },
      ),
    ).resolves.toBe('imported');

    expect(client.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_advisory_lock(hashtext($1))',
      [TRANSIT_CATALOG_IMPORT_LOCK],
    );
    expect(action).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_unlock(hashtext($1))',
      [TRANSIT_CATALOG_IMPORT_LOCK],
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
