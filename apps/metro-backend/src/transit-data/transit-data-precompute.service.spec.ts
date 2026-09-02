import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROUTE_RAIL_CONNECTION_RADIUS_METERS,
  TransitDataPrecomputeService,
} from './transit-data-precompute.service';
import { GTFSConfig } from '../data-import/config/gtfs.config';

describe('TransitDataPrecomputeService', () => {
  let prisma: {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $executeRawUnsafe: jest.Mock;
  };
  let service: TransitDataPrecomputeService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    service = new TransitDataPrecomputeService(prisma as never);
  });

  it('refreshes both GTFS-derived views and records their source signatures', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ source_signature: 'gtfs-hash' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ source_signature: 'rail-hash' }])
      .mockResolvedValueOnce([]);

    await service.refreshAfterGtfsImport();

    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      'REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."gtfs_stop_service_summary"',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      'REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."route_rail_connection_hits"',
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('skips refreshes when the imported GTFS and merged GeoSampa data are unchanged', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ source_signature: 'gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'v1:gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'rail-hash' }])
      .mockResolvedValueOnce([
        {
          source_signature:
            'v1:radius=200:gtfs=gtfs-hash:rail=rail-hash',
        },
      ]);

    await service.refreshAfterGtfsImport();

    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('keeps the newest dataset when only optional files failed', async () => {
    const optionalFailures = [
      { fileName: 'frequencies.txt', recordCount: null },
      { fileName: 'fare_attributes.txt', recordCount: 0 },
    ];
    prisma.$queryRaw.mockResolvedValueOnce([
      { source_signature: 'newest-gtfs-hash' },
    ]);

    const getCompleteGtfsSignature = (
      service as unknown as {
        getCompleteGtfsSignature: () => Promise<string | null>;
      }
    ).getCompleteGtfsSignature.bind(service);

    await expect(getCompleteGtfsSignature()).resolves.toBe('newest-gtfs-hash');

    const query = (
      prisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray
    ).join(' ');
    const [, requiredFiles, dependentFiles, dependentFileCount] =
      prisma.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        string[],
        string[],
        number,
      ];

    expect(
      optionalFailures.every((file) => !requiredFiles.includes(file.fileName)),
    ).toBe(true);
    expect(requiredFiles).toEqual(GTFSConfig.getRequiredFiles());
    expect(dependentFiles).toEqual([
      'routes.txt',
      'stops.txt',
      'trips.txt',
      'stop_times.txt',
    ]);
    expect(dependentFileCount).toBe(dependentFiles.length);
    expect(query).toContain('UNNEST');
    expect(query).toContain('file."fileName" = required.file_name');
    expect(query).toContain('file."recordCount" > 0');
    expect(query).toContain('HAVING COUNT(DISTINCT file."fileName")');
    expect(query).not.toContain('COALESCE(file."recordCount", 0) <= 0');
  });

  it('does not mark a failed materialized-view refresh as current', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ source_signature: 'rail-hash' }])
      .mockResolvedValueOnce([]);
    prisma.$executeRawUnsafe.mockRejectedValueOnce(
      new Error('refresh failed'),
    );

    await expect(service.refreshRouteRailConnections('gtfs-hash')).rejects.toThrow(
      'refresh failed',
    );
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('keeps the migration and runtime contract fixed at 200 metres', () => {
    const migration = readFileSync(
      join(
        __dirname,
        '../../prisma/migrations/20260902000000_precompute_route_rail_connections/migration.sql',
      ),
      'utf8',
    );

    expect(ROUTE_RAIL_CONNECTION_RADIUS_METERS).toBe(200);
    expect(migration).toContain('merged_rail_stations');
    expect(migration).toContain('200.0');
    expect(migration).not.toContain('merged_subway_stations');
  });
});
