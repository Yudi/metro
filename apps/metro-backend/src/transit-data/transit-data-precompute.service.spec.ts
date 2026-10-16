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
  const physicalStops = { refresh: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    service = new TransitDataPrecomputeService(
      prisma as never,
      physicalStops as never,
    );
  });

  it('refreshes GTFS-derived views and records their source signatures', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ source_signature: 'gtfs-hash' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
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
      'REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."stop_route_membership"',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      3,
      'ANALYZE "public"."stop_route_membership"',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(4,
      'REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."bus_stop_membership"');
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(5,
      'ANALYZE "public"."bus_stop_membership"');
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(6,
      'REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."bus_terminal_stops"');
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(7,
      'ANALYZE "public"."bus_terminal_stops"');
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      8,
      'REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."bus_direction_patterns"',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      9,
      'ANALYZE "public"."bus_direction_patterns"',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      10,
      'REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."route_rail_connection_hits"',
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(6);
  });

  it('skips refreshes when the imported GTFS and merged GeoSampa data are unchanged', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ source_signature: 'gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'v2:gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'v1:gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'v1:gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'v1:gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'v1:gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'rail-hash' }])
      .mockResolvedValueOnce([
        {
          source_signature: 'v3:radius=200:gtfs=gtfs-hash:rail=rail-hash',
        },
      ]);

    await service.refreshAfterGtfsImport();

    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('builds stop-route membership and direction patterns for an unchanged feed after upgrading the catalog', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ source_signature: 'gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'v2:gtfs-hash' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ source_signature: 'rail-hash' }])
      .mockResolvedValueOnce([
        { source_signature: 'v3:radius=200:gtfs=gtfs-hash:rail=rail-hash' },
      ]);

    await service.refreshAfterGtfsImport();

    expect(prisma.$executeRawUnsafe.mock.calls).toEqual([
      ['REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."stop_route_membership"'],
      ['ANALYZE "public"."stop_route_membership"'],
      ['REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."bus_stop_membership"'],
      ['ANALYZE "public"."bus_stop_membership"'],
      ['REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."bus_terminal_stops"'],
      ['ANALYZE "public"."bus_terminal_stops"'],
      ['REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."bus_direction_patterns"'],
      ['ANALYZE "public"."bus_direction_patterns"'],
    ]);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(4);
  });

  it('leaves failed direction refreshes eligible for retry', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ source_signature: 'gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'v2:gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'v1:gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'v1:gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'v1:gtfs-hash' }])
      .mockResolvedValueOnce([]);
    prisma.$executeRawUnsafe.mockRejectedValueOnce(new Error('direction refresh failed'));

    await expect(service.refreshAfterGtfsImport()).rejects.toThrow('direction refresh failed');
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('does not mark failed stop-route membership refreshes as current', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ source_signature: 'gtfs-hash' }])
      .mockResolvedValueOnce([{ source_signature: 'v2:gtfs-hash' }])
      .mockResolvedValueOnce([]);
    prisma.$executeRawUnsafe.mockRejectedValueOnce(
      new Error('stop-route membership refresh failed'),
    );

    await expect(service.refreshAfterGtfsImport()).rejects.toThrow(
      'stop-route membership refresh failed',
    );
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
    const [, requiredFiles, dependentFiles, dependentFileCount] = prisma
      .$queryRaw.mock.calls[0] as [
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

  it('refreshes rail stop counts when upgrading an unchanged feed from v2', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ source_signature: 'rail-hash' }])
      .mockResolvedValueOnce([{
        source_signature: 'v2:radius=200:gtfs=gtfs-hash:rail=rail-hash',
      }]);

    await service.refreshRouteRailConnections('gtfs-hash');

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY "public"."route_rail_connection_hits"',
    );
    expect(prisma.$executeRaw.mock.calls[0].slice(1)).toEqual([
      'route-rail-connections',
      'v3:radius=200:gtfs=gtfs-hash:rail=rail-hash',
    ]);
  });

  it('does not mark a failed materialized-view refresh as current', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ source_signature: 'rail-hash' }])
      .mockResolvedValueOnce([]);
    prisma.$executeRawUnsafe.mockRejectedValueOnce(new Error('refresh failed'));

    await expect(
      service.refreshRouteRailConnections('gtfs-hash'),
    ).rejects.toThrow('refresh failed');
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

  it('keeps stop-route membership complete across the public GTFS views', () => {
    const migration = readFileSync(
      join(
        __dirname,
        '../../prisma/migrations/20261011010000_precompute_stop_route_membership/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toMatch(
      /CREATE MATERIALIZED VIEW public\.stop_route_membership AS[\s\S]*?SELECT DISTINCT stop_time\.stop_id, trip\.route_id/i,
    );
    expect(migration).toContain('FROM public."Gtfs_StopTime" stop_time');
    expect(migration).toContain('INNER JOIN public."Gtfs_Trip" trip');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX stop_route_membership_stop_id_route_id_key',
    );
    expect(migration).toContain(
      'ON public.stop_route_membership (stop_id, route_id)',
    );
    expect(migration).toContain(
      'CREATE INDEX stop_route_membership_route_id_idx',
    );
    expect(migration).toContain('ANALYZE public.stop_route_membership');
    expect(migration).toContain(
      "DELETE FROM public.transit_precompute_state WHERE key = 'gtfs-post-processing'",
    );
    expect(migration).not.toContain('physical_stop_members');
  });
});
