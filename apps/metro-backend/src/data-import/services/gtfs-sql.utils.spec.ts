import { insertRows } from './gtfs-sql.utils';

describe('GTFS bulk inserts', () => {
  it('splits wider rows within the parameter budget, including generated IDs', async () => {
    const execute = jest.fn<
      Promise<number>,
      [string | TemplateStringsArray, ...unknown[]]
    >().mockResolvedValue(1);
    const rows = Array.from({ length: 5_000 }, () => [
      'a', 'b', 'c', 'd', 'e', 'f',
    ]);
    await insertRows(
      { $executeRaw: execute, $executeRawUnsafe: execute },
      'ARTESP_Trip',
      [
        'route_id', 'service_id', 'trip_id', 'trip_headsign',
        'direction_id', 'shape_id',
      ],
      rows,
      '"external_gtfs"."ARTESP_Trip"',
    );
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]).toHaveLength(29_996);
    expect(execute.mock.calls[1]).toHaveLength(5_006);
    const ids = execute.mock.calls.flatMap((call) =>
      call.slice(1).filter((_, index) => index % 7 === 0),
    );
    expect(new Set(ids).size).toBe(5_000);
  });

  it('propagates database errors to the enclosing import transaction', async () => {
    const failure = new Error('database write failed');
    const execute = jest.fn().mockRejectedValue(failure);
    await expect(insertRows(
      { $executeRaw: execute, $executeRawUnsafe: execute },
      'ARTESP_StopTime',
      ['trip_id'],
      [['trip']],
      '"external_gtfs"."ARTESP_StopTime"',
    )).rejects.toBe(failure);
  });
});
