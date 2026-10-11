import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { BusDirectionService } from './bus-direction.service';

const databaseUrl = process.env.VECTOR_TILES_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

// Read-only CTE fixtures: never apply the migration to the supplied database.
const fixtures = `
  fixture_routes(route_id, route_short_name, route_long_name, route_type,
    route_color, route_text_color, source_agency, source_id) AS (
    VALUES ('route', '001', 'A - B', 3, '000000', 'ffffff', 'sptrans', 'route'),
      ('artesp:route', '001', 'Regional', 3, '000000', 'ffffff', 'artesp', 'route'),
      ('rail', 'L1', 'Rail', 1, '000000', 'ffffff', 'sptrans', 'rail'),
      ('circle', 'C1', 'Circular', 3, '000000', 'ffffff', 'sptrans', 'circle')
  ),
  fixture_trips(route_id, direction_id, trip_headsign, shape_id, trip_id) AS (
    VALUES ('route', 0, 'Terminal B', 'out', 'long'),
      ('route', 0, 'Terminal B', 'out', 'short'),
      ('route', 0, 'Terminal B', 'out-variant', 'variant'),
      ('route', 0, 'Terminal A', 'in', 'inbound'),
      ('route', 0, 'Branch', 'out', 'branch'),
      ('artesp:route', 0, 'Regional', 'artesp:shape', 'artesp:trip'),
      ('rail', 0, 'Rail', 'rail', 'rail-trip'),
      ('circle', 0, ' Loop ', 'circle-out', 'circle-out-trip'),
      ('circle', 1, 'loop', 'circle-in', 'circle-in-trip')
  ),
  fixture_stop_times(trip_id, stop_id, stop_sequence) AS (
    VALUES ('long', 'a', 1), ('long', 'v1', 2), ('long', 'v2', 3), ('long', 'b', 4),
      ('short', 'a', 1), ('short', 'short-only', 2), ('short', 'b', 3),
      ('variant', 'a', 1), ('variant', 'b', 2),
      ('inbound', 'b', 1), ('inbound', 'a', 2),
      ('branch', 'a', 1), ('branch', 'branch-end', 2),
      ('artesp:trip', 'artesp:a', 1), ('artesp:trip', 'artesp:b', 2),
      ('rail-trip', 'a', 1), ('rail-trip', 'b', 2),
      ('circle-out-trip', 'circle-a', 1), ('circle-out-trip', 'circle-b', 2),
      ('circle-in-trip', 'circle-b', 1), ('circle-in-trip', 'circle-a', 2)
  ),
  fixture_stops(stop_id, stop_lat, stop_lon, stop_name) AS (
    VALUES ('a', -23.55::float8, -46.63::float8, 'Terminal A'),
      ('v1', -23.56, -46.64, 'Via 1'), ('v2', -23.57, -46.65, 'Via 2'),
      ('b', -23.59, -46.68, 'Terminal B'),
      ('short-only', -23.57, -46.66, 'Short only'),
      ('branch-end', -23.60, -46.70, 'Branch'),
      ('artesp:a', -23.65, -46.73, 'Regional A'),
      ('artesp:b', -23.69, -46.78, 'Regional B'),
      ('circle-a', -23.61, -46.71, 'Circle A'),
      ('circle-b', -23.62, -46.72, 'Circle B')
  ),
  fixture_members(source_stop_id, physical_stop_id) AS (
    VALUES ('short-only', 'physical'), ('alias', 'physical')
  ),
  fixture_fare_rules(route_id, fare_id) AS (VALUES ('route', 'fare')),
  fixture_fares(fare_id, price, currency_type) AS (VALUES ('fare', 5.0, 'BRL'))
`;

const patternQuery = readFileSync(join(
  __dirname,
  '../../../prisma/migrations/20261011000000_precompute_bus_direction_patterns/migration.sql',
), 'utf8').split('CREATE MATERIALIZED VIEW public.bus_direction_patterns AS\n')[1].split(';')[0];

function replaceTables(sql: string): string {
  for (const [table, fixture] of Object.entries({
    Gtfs_Route: 'fixture_routes', Gtfs_Trip: 'fixture_trips',
    Gtfs_StopTime: 'fixture_stop_times', Gtfs_Stop: 'fixture_stops',
    physical_stop_members: 'fixture_members', Gtfs_FareRule: 'fixture_fare_rules',
    Gtfs_FareAttribute: 'fixture_fares', bus_direction_patterns: 'fixture_patterns',
  })) {
    sql = sql.split(`public."${table}"`).join(fixture)
      .split(`"public"."${table}"`).join(fixture);
  }
  return sql;
}

describeDatabase('precomputed bus directions in PostgreSQL', () => {
  let client: Client;
  let service: BusDirectionService;

  beforeAll(async () => {
    client = new Client({
      connectionString: databaseUrl,
      options: '-c default_transaction_read_only=on -c statement_timeout=10000',
    });
    await client.connect();
    const tx = {
      $executeRaw: jest.fn(),
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce((sql, part, index) =>
          sql + (index ? `$${index}` : '') + part, '');
        const prefix = `WITH ${fixtures}, fixture_patterns AS (${replaceTables(patternQuery)})`;
        const result = await client.query(
          `${prefix}, ${replaceTables(query).trim().replace(/^WITH /, '')}`, values,
        );
        return result.rows;
      },
    };
    service = new BusDirectionService({
      $transaction: (read: (transaction: typeof tx) => Promise<unknown>) => read(tx),
    } as never);
  });

  afterAll(async () => { await client?.end(); });

  it('retains both orientations, terminal branches and combined shapes', async () => {
    const directions = await service.forRoutes(['route']);
    expect(directions.map((direction) => direction.destination).sort()).toEqual([
      'Branch', 'Terminal A', 'Terminal B',
    ]);
    expect(directions.every((direction) => direction.directionId === 0)).toBe(true);
    expect(directions.find((direction) => direction.destination === 'Terminal B')?.shapeIds.sort())
      .toEqual(['out', 'out-variant']);
    expect(directions.every((direction) => direction.fares[0]?.price === 5)).toBe(true);
  });

  it('finds a physical-stop alias served only by a shorter trip', async () => {
    const directions = await service.forStop('alias');
    expect(directions).toHaveLength(1);
    expect(directions[0]).toMatchObject({
      routeId: 'route', destination: 'Terminal B', isCircular: false,
    });
  });

  it('marks one normalized full-line destination circular without rewriting its destination', async () => {
    const directions = await service.forRoutes(['circle']);
    expect(directions).toHaveLength(2);
    expect(directions.map((direction) => direction.destination).sort()).toEqual(['Loop', 'loop']);
    expect(directions.every((direction) => direction.isCircular)).toBe(true);
  });

  it('does not infer circularity from only the destination served at a requested stop', async () => {
    const directions = await service.forRoutes(['route'], 'alias');
    expect(directions).toHaveLength(1);
    expect(directions[0]).toMatchObject({ destination: 'Terminal B', isCircular: false });
  });

  it('keeps feeds separate and excludes rail patterns', async () => {
    const directions = await service.forRoutes(['route', 'artesp:route', 'rail']);
    expect(directions).toHaveLength(4);
    expect(directions.filter((direction) => direction.sourceAgency === 'artesp')).toHaveLength(1);
    expect(directions.some((direction) => direction.routeId === 'rail')).toBe(false);
  });
});
