import { Client } from 'pg';
import { BusVectorTileService } from './bus-vector-tile.service';
import { VectorTileOptions } from '../vector-tile.types';

const databaseUrl = process.env.VECTOR_TILES_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

// All fixtures are CTEs: these tests require PostGIS but never create tables,
// change catalog data, or run migrations in the supplied database.
const fixtures = `
  fixture_routes(route_id, route_type, route_short_name, route_long_name,
    route_color, route_text_color, source_agency, source_id) AS (
    VALUES
      ('bus-route', 3, 'Bus', 'Bus route', '123456', 'ffffff', 'sptrans', 'bus-route'),
      ('artesp:bus-route', 3, 'Regional', 'Regional route', '654321', 'ffffff', 'artesp', 'bus-route'),
      ('rail-route', 1, 'Rail', 'Rail route', '000000', 'ffffff', 'sptrans', 'rail-route'),
      ('METRÔ1', 3, 'Metro', 'Metro route', '000000', 'ffffff', 'sptrans', 'METRÔ1'),
      ('CPTM1', 3, 'Train', 'Train route', '000000', 'ffffff', 'sptrans', 'CPTM1')
  ),
  fixture_trips(trip_id, route_id, shape_id) AS (
    VALUES ('bus-trip', 'bus-route', 'shape'),
      ('bus-trip-copy', 'bus-route', 'shape'),
      ('regional-trip', 'artesp:bus-route', 'artesp:shape'),
      ('rail-trip', 'rail-route', 'shape'),
      ('metro-trip', 'METRÔ1', 'shape'), ('train-trip', 'CPTM1', 'shape')
  ),
  fixture_stop_times(trip_id, stop_id) AS (
    VALUES ('bus-trip', 'bus'), ('bus-trip-copy', 'bus'),
      ('bus-trip', 'far'), ('regional-trip', 'artesp:mixed'),
      ('rail-trip', 'mixed'), ('rail-trip', 'rail'),
      ('metro-trip', 'metro'), ('train-trip', 'train')
  ),
  fixture_stops AS (
    SELECT stop_id AS id, stop_id, stop_id AS stop_name,
      ''::text AS stop_desc, ''::text AS platform_code,
      latitude AS stop_lat, longitude AS stop_lon,
      ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography AS location,
      CASE WHEN stop_id LIKE 'artesp:%' THEN 'artesp' ELSE 'sptrans' END AS source_agency,
      stop_id AS source_id
    FROM (VALUES
      ('bus', -46.64::float8, -23.575::float8),
      ('mixed', -46.64, -23.575), ('artesp:mixed', -46.6401, -23.575),
      ('rail', -46.64, -23.575), ('metro', -46.64, -23.575),
      ('train', -46.64, -23.575), ('unknown', -46.64, -23.575),
      ('far', -46.635, -23.58)
    ) AS stops(stop_id, longitude, latitude)
  ),
  fixture_members(source_stop_id, physical_stop_id) AS (
    VALUES ('mixed', 'mixed'), ('artesp:mixed', 'mixed'), ('missing', 'mixed')
  ),
  fixture_summary AS (
    SELECT stop_id, BOOL_OR(NOT (route_type IN (1, 2)
      OR route_id LIKE 'METRÔ%' OR route_id LIKE 'CPTM%')) AS serves_bus
    FROM fixture_stop_times
    JOIN fixture_trips USING (trip_id)
    JOIN fixture_routes USING (route_id)
    GROUP BY stop_id
  ),
  fixture_shapes AS (
    SELECT shape_id, ST_GeomFromText(
      'LINESTRING(-46.64 -23.575, -46.635 -23.58)', 4326) AS geom
    FROM (VALUES ('shape'), ('artesp:shape')) AS shapes(shape_id)
  )
`;

interface TileRow {
  physical_stop_id?: string;
  merged_stop_ids?: string;
  route_id?: string;
  shape_id?: string;
}

interface TileQuery {
  strings: readonly string[];
  values: unknown[];
}

describeDatabase('bus vector tile SQL feature parity', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString: databaseUrl,
      options: '-c default_transaction_read_only=on -c statement_timeout=5000',
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  async function tileRows(
    layer: 'stops' | 'routes',
    options: VectorTileOptions,
  ): Promise<TileRow[]> {
    const query = jest.fn().mockResolvedValue([{ mvt: Buffer.alloc(0) }]);
    const transaction = { $queryRaw: query, $executeRaw: jest.fn() };
    const service = new BusVectorTileService({
      $transaction: (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    } as never);
    if (layer === 'stops') {
      await service.generateBusStopsTile(14, 6069, 9296, options);
    } else {
      await service.generateBusRoutesTile(14, 6069, 9296, options);
    }

    const statement = query.mock.calls[0][0] as TileQuery;
    let text = statement.strings.reduce(
      (sql, part, index) => sql + (index ? `$${index}` : '') + part,
      '',
    );
    const tables: Record<string, string> = {
      Gtfs_Route: 'fixture_routes',
      Gtfs_Trip: 'fixture_trips',
      Gtfs_StopTime: 'fixture_stop_times',
      Gtfs_Stop: 'fixture_stops',
      Gtfs_Shape: 'fixture_shapes',
      physical_stop_members: 'fixture_members',
      gtfs_stop_service_summary: 'fixture_summary',
    };
    for (const [table, fixture] of Object.entries(tables)) {
      text = text.split(`"public"."${table}"`).join(fixture);
    }
    text = text.replace('WITH bounds AS', `WITH ${fixtures}, bounds AS`);
    // Inspect the exact rows supplied to the MVT encoder, including clipped
    // geometry, so assertions cover filtering and deduplication independently
    // of protobuf field ordering.
    text = text.replace(
      /SELECT ST_AsMVT\(mvtgeom\.\*, '[^']+', 4096, 'geom'\) AS mvt\s+FROM mvtgeom/,
      'SELECT * FROM mvtgeom',
    );
    const result = await client.query<TileRow>(text, statement.values);
    return result.rows;
  }

  const nearby = { latitude: -23.575, longitude: -46.64, radiusMeters: 100 };
  const ids = (rows: TileRow[]) => rows.map((row) => row.physical_stop_id).sort();

  it('retains bus and mixed stops while excluding rail-only and unserved stops', async () => {
    expect(ids(await tileRows('stops', { nearby }))).toEqual(['bus', 'mixed']);
  });

  it('matches a selected merged member and emits its representative only once', async () => {
    const rows = await tileRows('stops', { stopIds: ['artesp:mixed'] });
    expect(ids(rows)).toEqual(['mixed']);
    expect(rows[0].merged_stop_ids).toBe('artesp:mixed,mixed');
  });

  it('keeps the serves-bus requirement for explicitly selected stops', async () => {
    expect(ids(await tileRows('stops', {
      stopIds: ['bus', 'rail', 'metro', 'train', 'unknown'],
    }))).toEqual(['bus']);
  });

  it('matches routes through merged members from either feed', async () => {
    expect(ids(await tileRows('stops', {
      routeIds: ['artesp:bus-route'],
    }))).toEqual(['mixed']);
    expect(ids(await tileRows('stops', {
      routeIds: ['bus-route'],
    }))).toEqual(['bus', 'far']);
  });

  it('combines route, stop, and nearby selections with OR semantics', async () => {
    expect(ids(await tileRows('stops', {
      routeIds: ['artesp:bus-route'], stopIds: ['far'], nearby,
    }))).toEqual(['bus', 'far', 'mixed']);
  });

  it('does not treat rail routes as selected bus routes', async () => {
    expect(await tileRows('stops', {
      routeIds: ['rail-route', 'METRÔ1', 'CPTM1'],
    })).toEqual([]);
  });

  it('keeps one shape per selected bus route and excludes rail shapes', async () => {
    const rows = await tileRows('routes', {
      routeIds: ['bus-route', 'artesp:bus-route', 'rail-route', 'METRÔ1', 'CPTM1'],
    });
    expect(rows.map((row) => [row.route_id, row.shape_id]).sort()).toEqual([
      ['artesp:bus-route', 'artesp:shape'], ['bus-route', 'shape'],
    ]);
  });
});
