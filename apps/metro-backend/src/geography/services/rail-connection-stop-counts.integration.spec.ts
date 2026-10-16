import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { GeographyServiceOptimized } from './geography-optimized.service';

const databaseUrl = process.env.VECTOR_TILES_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const migrationQuery = readFileSync(join(
  __dirname,
  '../../../prisma/migrations/20261016000000_precompute_rail_connection_stop_counts/migration.sql',
), 'utf8').split('CREATE MATERIALIZED VIEW "public"."route_rail_connection_hits" AS\n')[1].split(';')[0];

// Execute only the view's SELECT against read-only CTE fixtures, never the migration.
const fixtures = `
  fixture_routes(route_id, route_short_name, route_long_name, route_type) AS (
    VALUES ('stable', '001', 'Regular', 3), ('ambiguous', '002', 'Variants', 3),
      ('loop', '003', 'Circular', 3), ('artesp:regional', '004', 'Regional', 3),
      ('rail', 'L1', 'Rail', 1)
  ),
  fixture_trips(trip_id, route_id, direction_id, trip_headsign) AS (
    VALUES ('stable-a', 'stable', 0, 'Station'), ('stable-b', 'stable', 0, 'Station'),
      ('reverse', 'stable', 1, 'Return'), ('branch', 'stable', 0, 'Branch'),
      ('ambiguous-a', 'ambiguous', 0, 'Station'),
      ('ambiguous-b', 'ambiguous', 0, 'Station'),
      ('loop', 'loop', 0, 'Station'), ('regional', 'artesp:regional', 0, 'Station'),
      ('rail', 'rail', 0, 'Station')
  ),
  fixture_stop_times(trip_id, stop_id, stop_sequence) AS (
    VALUES ('stable-a', 'origin', 10), ('stable-a', 'hidden', 20),
      ('stable-a', 'middle', 30), ('stable-a', 'near', 50),
      ('stable-b', 'origin', 1), ('stable-b', 'hidden', 2),
      ('stable-b', 'middle', 3), ('stable-b', 'near', 50),
      ('reverse', 'origin', 10), ('reverse', 'near', 50),
      ('branch', 'origin', 10), ('branch', 'near', 50),
      ('ambiguous-a', 'origin', 10), ('ambiguous-a', 'middle', 30),
      ('ambiguous-a', 'near', 50), ('ambiguous-b', 'origin', 10),
      ('ambiguous-b', 'near', 50),
      ('loop', 'origin', 10), ('loop', 'middle', 20),
      ('loop', 'origin', 30), ('loop', 'near', 50),
      ('regional', 'origin', 10), ('regional', 'near', 50),
      ('rail', 'origin', 10), ('rail', 'near', 50)
  ),
  fixture_stops(stop_id, stop_name, location) AS (
    VALUES ('origin', 'Origin', ST_SetSRID(ST_MakePoint(-46.70, -23.55), 4326)::geography),
      ('middle', 'Middle', ST_SetSRID(ST_MakePoint(-46.69, -23.55), 4326)::geography),
      ('hidden', 'Missing coordinates', NULL::geography),
      ('near', 'Station stop', ST_SetSRID(ST_MakePoint(-46.65, -23.55), 4326)::geography)
  ),
  fixture_stations("primaryId", name, agencies, lines, longitude, latitude) AS (
    VALUES (1, 'Station', ARRAY['METRO'], ARRAY['L1'], -46.65, -23.55)
  ),
  fixture_members(source_stop_id, physical_stop_id) AS (
    SELECT NULL::text, NULL::text WHERE false
  )
`;

function replaceTables(sql: string): string {
  for (const [table, fixture] of Object.entries({
    Gtfs_Route: 'fixture_routes', Gtfs_Trip: 'fixture_trips',
    Gtfs_StopTime: 'fixture_stop_times', Gtfs_Stop: 'fixture_stops',
    merged_rail_stations: 'fixture_stations', physical_stop_members: 'fixture_members',
    route_rail_connection_hits: 'fixture_hits',
  })) {
    sql = sql.split(`public."${table}"`).join(fixture)
      .split(`"public"."${table}"`).join(fixture);
  }
  return sql;
}

describeDatabase('precomputed rail connection stop counts in PostgreSQL', () => {
  let client: Client;
  let service: GeographyServiceOptimized;

  beforeAll(async () => {
    client = new Client({
      connectionString: databaseUrl,
      options: '-c default_transaction_read_only=on -c statement_timeout=10000',
    });
    await client.connect();
    service = new GeographyServiceOptimized({
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce((sql, part, index) =>
          sql + (index ? `$${index}` : '') + part, '');
        const prefix = `WITH ${fixtures}, fixture_hits AS (${replaceTables(migrationQuery)})`;
        const result = await client.query(
          `${prefix}, ${replaceTables(query).trim().replace(/^WITH /, '')}`, values,
        );
        return result.rows;
      },
    } as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  });

  afterAll(async () => { await client?.end(); });

  it('counts actual stops including missing coordinates and isolates directions and headsigns', async () => {
    const result = await service.getRouteRailConnectionsForStop('origin', ['stable']);
    expect(result[0].directions.map((direction) => ({
      direction: direction.directionId,
      headsign: direction.headsign,
      count: direction.stations[0].stopsUntil,
    }))).toEqual([
      { direction: 0, headsign: 'Branch', count: 1 },
      { direction: 0, headsign: 'Station', count: 3 },
      { direction: 1, headsign: 'Return', count: 1 },
    ]);
  });

  it('preserves null for differing trip variants and repeated origins in circular trips', async () => {
    const result = await service.getRouteRailConnectionsForStop('origin', ['ambiguous', 'loop']);
    expect(result).toHaveLength(2);
    for (const connection of result) {
      expect(connection.directions[0].stations[0].stopsUntil).toBeNull();
    }
  });

  it('supports regional routes and excludes rail routes from bus connections', async () => {
    const result = await service.getRouteRailConnectionsForStop('origin', ['artesp:regional', 'rail']);
    expect(result).toHaveLength(1);
    expect(result[0].routeId).toBe('artesp:regional');
    expect(result[0].directions[0].stations[0].stopsUntil).toBe(1);
  });

  it('omits counts from the badge projection', async () => {
    const result = await service.getRouteRailConnectionsForStop('origin', ['stable'], false);
    expect(result[0].directions).toHaveLength(3);
    for (const direction of result[0].directions) {
      expect(direction.stations[0].stopsUntil).toBeNull();
    }
  });
});
