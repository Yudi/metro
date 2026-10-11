import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { QueryOptimizationRouteFacade } from './query-optimization-route.facade';

const databaseUrl = process.env.VECTOR_TILES_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

// CTE fixtures exercise the migration and lookup without changing any tables.
const fixtures = `
  fixture_routes(id, route_id, agency_id, route_short_name, route_long_name,
    route_type, route_color, route_text_color, source_agency, source_id) AS (
    VALUES ('bus', 'bus', 'agency', '001', 'Local', 3, '000000', 'FFFFFF', 'sptrans', 'bus'),
      ('regional', 'artesp:bus', 'agency', '001', 'Regional', 3, '000000', 'FFFFFF', 'artesp', 'bus'),
      ('rail', 'rail', 'agency', 'L1', 'Rail', 1, '000000', 'FFFFFF', 'sptrans', 'rail')
  ),
  fixture_trips(trip_id, route_id) AS (
    VALUES ('trip-1', 'bus'), ('trip-2', 'bus'),
      ('artesp:trip', 'artesp:bus'), ('rail-trip', 'rail')
  ),
  fixture_stop_times(trip_id, stop_id) AS (
    VALUES ('trip-1', 'local-stop'), ('trip-2', 'local-stop'),
      ('artesp:trip', 'artesp:stop'), ('rail-trip', 'rail-stop')
  ),
  fixture_members(source_stop_id, physical_stop_id) AS (
    VALUES ('local-stop', 'physical'), ('artesp:stop', 'physical'), ('alias', 'physical')
  ),
  fixture_fare_rules(route_id, fare_id) AS (
    VALUES ('bus', 'fare'), ('bus', 'fare'), ('artesp:bus', 'regional-fare')
  ),
  fixture_fares(fare_id, price, currency_type) AS (
    VALUES ('fare', 5.0, 'BRL'), ('regional-fare', 7.2, 'BRL')
  )
`;

function replaceTables(sql: string): string {
  for (const [table, fixture] of Object.entries({
    Gtfs_Route: 'fixture_routes', Gtfs_Trip: 'fixture_trips',
    Gtfs_StopTime: 'fixture_stop_times', physical_stop_members: 'fixture_members',
    Gtfs_FareRule: 'fixture_fare_rules', Gtfs_FareAttribute: 'fixture_fares',
    stop_route_membership: 'fixture_membership',
  })) {
    sql = sql.split(`public."${table}"`).join(fixture)
      .split(`"public"."${table}"`).join(fixture);
  }
  return sql;
}

const membershipQuery = readFileSync(join(
  __dirname,
  '../../../prisma/migrations/20261011010000_precompute_stop_route_membership/migration.sql',
), 'utf8').split('CREATE MATERIALIZED VIEW public.stop_route_membership AS\n')[1].split(';')[0];

describeDatabase('precomputed stop-route membership in PostgreSQL', () => {
  let client: Client;
  let routes: QueryOptimizationRouteFacade;

  beforeAll(async () => {
    client = new Client({
      connectionString: databaseUrl,
      options: '-c default_transaction_read_only=on -c statement_timeout=10000',
    });
    await client.connect();
    routes = new QueryOptimizationRouteFacade({
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce((sql, part, index) =>
          sql + (index ? `$${index}` : '') + part, '');
        const prefix = `WITH ${fixtures}, fixture_membership AS (${replaceTables(membershipQuery)})`;
        const result = await client.query(
          `${prefix}, ${replaceTables(query).trim().replace(/^WITH /, '')}`, values,
        );
        return result.rows;
      },
    } as never);
  });

  afterAll(async () => { await client?.end(); });

  it('preserves merged aliases, feed identities, fares and stops without service', async () => {
    const result = await routes.getRoutesForMultipleStops([
      'physical', 'alias', 'local-stop', 'artesp:stop', 'unknown',
    ]);
    for (const stopId of ['physical', 'alias', 'local-stop', 'artesp:stop']) {
      expect(result.get(stopId)).toEqual([
        expect.objectContaining({ routeId: 'bus', sourceAgency: 'sptrans', fares: [{ price: 5, currency: 'BRL' }] }),
        expect.objectContaining({ routeId: 'artesp:bus', sourceAgency: 'artesp', fares: [{ price: 7.2, currency: 'BRL' }] }),
      ]);
    }
    expect(result.get('unknown')).toEqual([]);
  });

  it('includes rail service and returns deduplicated line names for physical stops', async () => {
    const result = await routes.getRoutesForMultipleStops(['rail-stop']);
    expect(result.get('rail-stop')).toEqual([
      expect.objectContaining({ routeId: 'rail', routeType: 1, shortName: 'L1' }),
    ]);
    const names = await routes.getBatchRoutesForStops(['physical', 'rail-stop', 'unknown']);
    expect(names).toEqual(new Map([
      ['physical', ['001']], ['rail-stop', ['L1']], ['unknown', []],
    ]));
  });
});
