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
      ('directional-route', 3, '123A', 'Directional route', 'abcdef', 'ffffff', 'sptrans', 'directional-original-route'),
      ('artesp:bus-route', 3, 'Regional', 'Regional route', '654321', 'ffffff', 'artesp', 'bus-route'),
      ('rail-route', 1, 'Rail', 'Rail route', '000000', 'ffffff', 'sptrans', 'rail-route'),
      ('METRÔ1', 3, 'Metro', 'Metro route', '000000', 'ffffff', 'sptrans', 'METRÔ1'),
      ('CPTM1', 3, 'Train', 'Train route', '000000', 'ffffff', 'sptrans', 'CPTM1')
  ),
  fixture_trips(trip_id, route_id, shape_id, direction_id) AS (
    VALUES ('bus-trip', 'bus-route', 'shape', 0),
      ('bus-trip-copy', 'bus-route', 'shape', 0),
      ('outbound-trip', 'directional-route', 'shape-out', 0),
      ('outbound-copy', 'directional-route', 'shape-out', 0),
      ('inbound-trip', 'directional-route', 'shape-in', 1),
      ('inbound-shared-shape', 'directional-route', 'shape-out', 1),
      ('regional-trip', 'artesp:bus-route', 'artesp:shape', 0),
      ('rail-trip', 'rail-route', 'shape', 0),
      ('metro-trip', 'METRÔ1', 'shape', 0), ('train-trip', 'CPTM1', 'shape', 0)
  ),
  fixture_stop_times(trip_id, stop_id) AS (
    VALUES ('bus-trip', 'bus'), ('bus-trip-copy', 'bus'),
      ('bus-trip', 'far'), ('regional-trip', 'artesp:mixed'),
      ('outbound-trip', 'out-only'), ('outbound-trip', 'shared-direction'),
      ('inbound-trip', 'in-only'), ('inbound-shared-shape', 'wrong-direction'),
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
      ('far', -46.635, -23.58),
      ('out-only', -46.641, -23.574), ('in-only', -46.642, -23.573),
      ('shared-direction', -46.643, -23.572), ('wrong-direction', -46.644, -23.571)
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
    FROM (VALUES ('shape'), ('artesp:shape'), ('shape-out'), ('shape-in')) AS shapes(shape_id)
  )
`;

interface TileRow {
  physical_stop_id?: string;
  stop_id?: string;
  merged_stop_ids?: string;
  source_agency?: string;
  source_id?: string;
  platform_code?: string;
  route_id?: string;
  shape_id?: string;
  destination?: string;
  favorite_code?: string;
  direction_id?: number;
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
    options: VectorTileOptions = {},
    directions: Array<{
      routeId: string;
      directionId: number;
      destination: string;
      favoriteCode: string;
      shapeIds: string[];
    }> = [],
  ): Promise<TileRow[]> {
    const query = jest.fn().mockResolvedValue([{ mvt: Buffer.alloc(0) }]);
    const transaction = { $queryRaw: query, $executeRaw: jest.fn() };
    const busDirections = {
      forFavorites: jest.fn(async (codes: string[]) =>
        directions.filter((direction) =>
          codes.includes(direction.favoriteCode),
        ),
      ),
    };
    const service = new BusVectorTileService({
      $transaction: (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    } as never, busDirections as never);
    if (layer === 'stops') {
      await service.generateBusStopsTile(15, 12138, 18593);
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

  const outboundCode =
    'bus:v1:sptrans:123A:-23.5000~-46.6000:-23.5100~-46.6100:-23.5200~-46.6200';
  const inboundCode =
    'bus:v1:sptrans:123A:-23.5200~-46.6200:-23.5100~-46.6100:-23.5000~-46.6000';
  const outbound = {
    routeId: 'directional-route',
    directionId: 0,
    destination: 'Terminal Norte',
    favoriteCode: outboundCode,
    shapeIds: ['shape-out'],
  };
  const inbound = {
    routeId: 'directional-route',
    directionId: 1,
    destination: 'Terminal Sul',
    favoriteCode: inboundCode,
    shapeIds: ['shape-in'],
  };
  const ids = (rows: TileRow[]) =>
    rows.map((row) => row.physical_stop_id).sort();

  it('returns only in-bounds bus-serving stops and excludes rail-only or unserved stops', async () => {
    const rows = await tileRows('stops');
    expect(ids(rows)).toEqual(['bus', 'mixed']);
    expect(ids(rows)).not.toContain('far');
  });

  it('emits one physical-stop representative with merged source IDs', async () => {
    const rows = await tileRows('stops');
    const mergedStop = rows.find((row) => row.physical_stop_id === 'mixed');

    expect(ids(rows)).toEqual(['bus', 'mixed']);
    expect(ids(rows).filter((stopId) => stopId === 'mixed')).toHaveLength(1);
    expect(mergedStop?.stop_id).toBe('mixed');
    expect(mergedStop?.merged_stop_ids).toBe('artesp:mixed,mixed');
    expect(mergedStop?.source_agency).toBe('sptrans');
    expect(mergedStop?.source_id).toBe('mixed');
  });

  it('keeps one shape per selected bus route and excludes rail shapes', async () => {
    const rows = await tileRows('routes', {
      routeIds: [
        'bus-route',
        'artesp:bus-route',
        'rail-route',
        'METRÔ1',
        'CPTM1',
      ],
    });
    expect(rows.map((row) => [row.route_id, row.shape_id]).sort()).toEqual([
      ['artesp:bus-route', 'artesp:shape'],
      ['bus-route', 'shape'],
    ]);
  });

  it('filters route features by the selected direction and exposes its selection key', async () => {
    const outboundRows = await tileRows(
      'routes',
      { routeIds: [outboundCode] },
      [outbound, inbound],
    );

    expect(
      outboundRows.map((row) => [
        row.route_id,
        row.shape_id,
        row.destination,
        row.favorite_code,
        row.direction_id,
        row.source_id,
      ]),
    ).toEqual([
      [
        outboundCode,
        'shape-out',
        'Terminal Norte',
        outboundCode,
        0,
        'directional-original-route',
      ],
    ]);

    const inboundRows = await tileRows(
      'routes',
      { routeIds: [inboundCode] },
      [outbound, inbound],
    );
    expect(inboundRows.map((row) => [row.route_id, row.shape_id])).toEqual([
      [inboundCode, 'shape-in'],
    ]);
  });
});
