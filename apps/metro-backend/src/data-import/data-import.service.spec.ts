import { Test, TestingModule } from '@nestjs/testing';
import { DataImportService } from './data-import.service';
import { FileOperationsService } from './services/file-operations.service';
import { ZipProcessingService } from './services/zip-processing.service';
import { GTFSDatabaseService } from './services/gtfs-database.service';
import { CsvProcessingService } from './services/csv-processing.service';
import { RustGtfsService } from './services/rust-gtfs.service';
import { DataImportHooksService } from './services/data-import-hooks.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImportLockService } from '../common/import-lock.service';

describe('DataImportService', () => {
  let service: DataImportService;
  let hooks: { onDataImportComplete: jest.Mock };
  let importLock: { withLock: jest.Mock };
  beforeEach(async () => {
    hooks = { onDataImportComplete: jest.fn().mockResolvedValue(undefined) };
    importLock = {
      withLock: jest.fn((_: string, __: string, action: () => Promise<unknown>) =>
        action(),
      ),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataImportService,
        {
          provide: FileOperationsService,
          useValue: {},
        },
        {
          provide: ZipProcessingService,
          useValue: {},
        },
        {
          provide: GTFSDatabaseService,
          useValue: {},
        },
        {
          provide: CsvProcessingService,
          useValue: {},
        },
        {
          provide: RustGtfsService,
          useValue: {},
        },
        {
          provide: DataImportHooksService,
          useValue: hooks,
        },
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
          },
        },
        {
          provide: ImportLockService,
          useValue: importLock,
        },
      ],
    }).compile();
    service = module.get<DataImportService>(DataImportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('fails the run and skips post-import hooks when a required file fails', async () => {
    jest.useFakeTimers();
    jest
      .spyOn(service as never, 'performImport' as never)
      .mockResolvedValue({
        success: false,
        filesProcessed: 1,
        recordsImported: 1,
        skippedFiles: [],
        errors: ['routes.txt: parse failed'],
      } as never);

    await expect(service.startImport()).rejects.toThrow(
      'GTFS import failed: routes.txt: parse failed',
    );
    expect(hooks.onDataImportComplete).not.toHaveBeenCalled();
    expect(service.getImportStatus().status).toBe('error');
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('aborts timed-out operations and clears the timeout after success', async () => {
    jest.useFakeTimers();
    const signalState: { signal?: AbortSignal } = {};
    let resolveOperation: (() => void) | undefined;
    const pending = (service as never as {
      withTimeout: (
        operation: (signal: AbortSignal) => Promise<void>,
        timeoutMs: number,
        message: string,
      ) => Promise<void>;
    }).withTimeout(
      (signal) => {
        signalState.signal = signal;
        return new Promise<void>((resolve) => {
          resolveOperation = resolve;
        });
      },
      100,
      'Download timeout',
    );

    jest.advanceTimersByTime(100);
    await expect(pending).rejects.toThrow('Download timeout');
    expect(signalState.signal?.aborted).toBe(true);
    resolveOperation?.();

    await expect(
      (service as never as {
        withTimeout: (
          operation: (signal: AbortSignal) => Promise<void>,
          timeoutMs: number,
          message: string,
        ) => Promise<void>;
      }).withTimeout(async () => undefined, 100, 'unused'),
    ).resolves.toBeUndefined();
    jest.advanceTimersByTime(100);
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('reports missing required GTFS files instead of treating a partial archive as valid', async () => {
    const result = await (service as never as {
      processGTFSFiles: (
        datasetId: string,
        extractDir: string,
        files: Array<{ fileName: string; fileHash: string; fileSize: number }>,
      ) => Promise<{ success: boolean; errors: string[] }>;
    }).processGTFSFiles('dataset', '/tmp', [
      { fileName: 'agency.txt', fileHash: 'hash', fileSize: 1 },
    ]);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['Missing required GTFS file: routes.txt']),
    );
  });

  it('removes only Prisma schema metadata before invoking the Rust importer', () => {
    const cleanUrl = (service as never as {
      getRustDatabaseUrl: (databaseUrl: string) => string;
    }).getRustDatabaseUrl(
      'postgresql://user:p%40ss@db:5432/metro?schema=public&sslmode=require&application_name=gtfs',
    );

    expect(cleanUrl).toContain('sslmode=require');
    expect(cleanUrl).toContain('application_name=gtfs');
    expect(cleanUrl).not.toContain('schema=public');
    expect(cleanUrl).toContain('p%40ss');
  });

  it('does not let an older reset timer mark a newer run idle', async () => {
    jest.useFakeTimers();
    let resolveFirst: ((result: unknown) => void) | undefined;
    let resolveSecond: ((result: unknown) => void) | undefined;
    const performImport = jest.fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    Object.defineProperty(service, 'performImport', { value: performImport });

    const successfulResult = {
      success: true,
      filesProcessed: 1,
      recordsImported: 1,
      skippedFiles: [],
      errors: [],
    };
    const firstRun = service.startImport();
    await Promise.resolve();
    resolveFirst?.(successfulResult);
    await firstRun;

    const secondRun = service.startImport();
    await Promise.resolve();
    expect(service.getImportStatus().status).toBe('downloading');
    jest.advanceTimersByTime(1000);
    expect(service.getImportStatus().status).toBe('downloading');

    resolveSecond?.(successfulResult);
    await secondRun;
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });
});
