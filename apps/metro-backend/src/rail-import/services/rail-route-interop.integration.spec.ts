import { Client } from 'pg';
import { railRoutesSql } from './rail-route-interop.sql';
import { RAIL_DATASETS } from '../config/rail-datasets.config';

// Exercise the real parameterized SQL in PostGIS; unit tests mock Prisma SQL.
jest.mock('../../../generated/prisma/client', () => {
  const runtime = jest.requireActual<typeof import('@prisma/client/runtime/client')>(
    '@prisma/client/runtime/client',
  );
  return { Prisma: { sql: runtime.sqltag, join: runtime.join } };
});

const databaseUrl = process.env.VECTOR_TILES_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

const fixtures = `
  fixture_routes(route_id) AS (
    VALUES ('METRÔ L6'), ('CPTM L10'), ('METRÔ 15'), ('METRÔ17A'), ('METRÔ17W')
  ),
  fixture_trips(route_id, shape_id) AS (
    VALUES ('METRÔ L6', 'six'), ('METRÔ L6', 'six'), ('METRÔ L6', 'six-short'),
      ('CPTM L10', 'ten'), ('METRÔ 15', 'fifteen'),
      ('METRÔ17A', 'seventeen-main'), ('METRÔ17W', 'seventeen-branch')
  ),
  fixture_shapes AS (
    SELECT shape_id, ST_GeomFromText(wkt, 4326) AS geom
    FROM (VALUES
      ('six', 'LINESTRING(-46.7 -23.5, -46.6 -23.5)'),
      ('six-short', 'LINESTRING(-46.7 -23.5, -46.65 -23.5)'),
      ('ten', 'LINESTRING(-46.7 -23.6, -46.6 -23.6)'),
      ('fifteen', 'LINESTRING(-46.7 -23.7, -46.6 -23.7)'),
      ('seventeen-main', 'LINESTRING(-46.7 -23.8, -46.6 -23.8)'),
      ('seventeen-branch', 'LINESTRING(-46.65 -23.8, -46.65 -23.85)')
    ) shapes(shape_id, wkt)
  ),
  fixture_geosampa AS (
    SELECT line_number, ST_Transform(ST_GeomFromText(wkt, 4326), 3857) AS geom_3857
    FROM (VALUES
      (6, 'LINESTRING(-46.7 -23.4, -46.6 -23.4)'),
      (10, 'LINESTRING(-46.7 -23.3, -46.6 -23.3)'),
      (10, 'LINESTRING(-46.6 -23.3, -46.5 -23.3)'),
      (15, 'LINESTRING(-46.7 -23.2, -46.6 -23.2)'),
      (17, 'LINESTRING(-46.7 -23.1, -46.6 -23.1)')
    ) shapes(line_number, wkt)
  )
`;

interface RouteRow {
  line_number: number;
  source: string;
  matches_sptrans: boolean;
  matches_geosampa: boolean;
  includes_branch_endpoint: boolean;
  includes_full_l6_shape: boolean;
}

describeDatabase('rail route dataset interoperability in PostGIS', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString: databaseUrl,
      options: '-c default_transaction_read_only=on -c statement_timeout=10000',
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  async function routes(configuration = RAIL_DATASETS): Promise<RouteRow[]> {
    const statement = railRoutesSql(configuration);
    let sql = statement.text.replace('WITH line_config', `WITH ${fixtures}, line_config`);
    for (const [table, fixture] of Object.entries({
      SPTrans_Route: 'fixture_routes',
      SPTrans_Trip: 'fixture_trips',
      SPTrans_Shape: 'fixture_shapes',
      mvt_rail_routes: 'fixture_geosampa',
    })) {
      sql = sql.split(`"public"."${table}"`).join(fixture);
    }
    const result = await client.query<RouteRow>(`${sql}
      SELECT selected.line_number, selected.source,
        ST_Equals(selected.geom_3857, sp.geom_3857) AS matches_sptrans,
        ST_Equals(selected.geom_3857, geo.geom_3857) AS matches_geosampa,
        ST_DWithin(selected.geom_3857,
          ST_Transform(ST_SetSRID(ST_MakePoint(-46.65, -23.85), 4326), 3857), 1
        ) AS includes_branch_endpoint,
        ST_Equals(selected.geom_3857,
          ST_Transform((SELECT geom FROM fixture_shapes WHERE shape_id = 'six'), 3857)
        ) AS includes_full_l6_shape
      FROM selected_rail_routes selected
      LEFT JOIN sptrans_lines sp ON sp.line_code = selected.line_number
      LEFT JOIN geosampa_lines geo ON geo.line_code = selected.line_number
      ORDER BY selected.line_number
    `, statement.values);
    return result.rows;
  }

  it('uses SPTrans for L6 and both L17 branches, and GeoSampa for L10 and L15', async () => {
    const selected = await routes();
    expect(selected).toMatchObject([
      { line_number: 6, source: 'sptrans', matches_sptrans: true, matches_geosampa: false },
      { line_number: 10, source: 'geosampa', matches_sptrans: false, matches_geosampa: true },
      { line_number: 15, source: 'geosampa', matches_sptrans: false, matches_geosampa: true },
      { line_number: 17, source: 'sptrans', matches_sptrans: true, matches_geosampa: false },
    ]);
    expect(selected.find((line) => line.line_number === 17)?.includes_branch_endpoint).toBe(true);
    expect(selected.find((line) => line.line_number === 6)?.includes_full_l6_shape).toBe(true);
  });

  it('switches one line without changing the others', async () => {
    const configuration = RAIL_DATASETS.map((line) =>
      line.lineCode === 10 ? { ...line, source: 'sptrans' as const } : line,
    );
    const selected = await routes(configuration);
    expect(selected.find((line) => line.line_number === 10)).toMatchObject({
      source: 'sptrans', matches_sptrans: true,
    });
    expect(selected.find((line) => line.line_number === 15)?.source).toBe('geosampa');
  });

  it('falls back as a whole line when the selected dataset has no shape', async () => {
    const configuration = RAIL_DATASETS.map((line) =>
      line.lineCode === 6 ? { ...line, gtfsRouteIds: [] } : line,
    );
    expect((await routes(configuration)).find((line) => line.line_number === 6))
      .toMatchObject({ source: 'geosampa', matches_geosampa: true });
  });
});
