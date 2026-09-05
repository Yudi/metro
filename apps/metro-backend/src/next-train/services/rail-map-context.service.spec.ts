import { PrismaService } from '../../prisma/prisma.service';
import { RailMapContextService } from './rail-map-context.service';

describe('RailMapContextService', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  let service: RailMapContextService;

  beforeEach(() => {
    queryRaw.mockReset();
    service = new RailMapContextService(prisma);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps exact station aliases and ordered transformed path points for a line', async () => {
    queryRaw
      .mockResolvedValueOnce([
        {
          id: 'jag',
          name: 'Villa Lobos',
          originalName: 'VILLA LOBOS',
          latitude: -23.55,
          longitude: -46.72,
        },
        {
          id: 'usp',
          name: 'Cidade Universitária',
          originalName: 'Cidade Universitária',
          latitude: -23.56,
          longitude: -46.715,
        },
      ])
      .mockResolvedValueOnce([
        { path_id: 1, point_index: 2, lat: -23.56, lng: -46.715 },
        { path_id: 1, point_index: 1, lat: -23.55, lng: -46.72 },
      ]);

    await expect(service.getContext('L9')).resolves.toEqual({
      stations: [
        { code: 'JAG', lat: -23.55, lng: -46.72 },
        { code: 'USP', lat: -23.56, lng: -46.715 },
      ],
      paths: [
        {
          points: [
            { lat: -23.55, lng: -46.72 },
            { lat: -23.56, lng: -46.715 },
          ],
        },
      ],
    });

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(queryRaw.mock.calls[0].slice(1)).toContain('Esmeralda');
    expect(queryRaw.mock.calls[1].slice(1)).toContain(9);
    const pathSql = queryRaw.mock.calls[1][0].join('');
    expect(pathSql).toContain('ST_CollectionExtract');
    expect(pathSql).toContain('ST_LineMerge');
    expect(pathSql).toContain('ST_Dump');
    expect(pathSql).toContain('ST_Transform');
  });

  it('skips an ambiguous exact station match without accepting broad names', async () => {
    queryRaw
      .mockResolvedValueOnce([
        {
          id: 'one',
          name: 'Villa Lobos',
          originalName: 'Villa Lobos',
          latitude: -23.55,
          longitude: -46.72,
        },
        {
          id: 'two',
          name: 'Villa Lobos',
          originalName: 'Villa Lobos',
          latitude: -23.551,
          longitude: -46.721,
        },
        {
          id: 'extra',
          name: 'Cidade Universitária Extra',
          originalName: 'Cidade Universitária Extra',
          latitude: -23.56,
          longitude: -46.715,
        },
      ])
      .mockResolvedValueOnce([
        { path_id: 1, point_index: 1, lat: -23.55, lng: -46.72 },
        { path_id: 1, point_index: 2, lat: -23.56, lng: -46.715 },
      ]);

    await expect(service.getContext('L9')).resolves.toBeUndefined();
  });

  it('returns undefined for unknown or incomplete network data', async () => {
    await expect(service.getContext('L99')).resolves.toBeUndefined();
    queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(service.getContext('L9')).resolves.toBeUndefined();

    queryRaw.mockResolvedValueOnce([
      {
        id: 'jag',
        name: 'Villa Lobos',
        originalName: 'Villa Lobos',
        latitude: -23.55,
        longitude: -46.72,
      },
    ]).mockResolvedValueOnce([]);
    await expect(service.getContext('L9')).resolves.toBeUndefined();
  });

  it.each(['invalid coordinate', 'missing point', 'duplicate point'])(
    'rejects a path with an %s rather than joining its remaining vertices', async (scenario) => {
      const points = [
        { path_id: 1, point_index: 1, lat: -23.55, lng: -46.72 },
        { path_id: 1, point_index: 2, lat: scenario === 'invalid coordinate' ? NaN : -23.56, lng: -46.715 },
        { path_id: 1, point_index: 3, lat: -23.57, lng: -46.71 },
      ];
      if (scenario === 'missing point') points.splice(1, 1);
      if (scenario === 'duplicate point') points[1].point_index = 1;
      queryRaw.mockResolvedValueOnce([
        { name: 'Villa Lobos', originalName: 'Villa Lobos', latitude: -23.55, longitude: -46.72 },
      ]).mockResolvedValueOnce(points);
      await expect(service.getContext('L9')).resolves.toBeUndefined();
    },
  );

  it('coalesces concurrent loads and caches only successful contexts for five minutes', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    let resolveStations!: (rows: unknown[]) => void;
    const pendingStations = new Promise<unknown[]>((resolve) => {
      resolveStations = resolve;
    });
    queryRaw
      .mockReturnValueOnce(pendingStations)
      .mockResolvedValueOnce([
        { path_id: 1, point_index: 1, lat: -23.55, lng: -46.72 },
        { path_id: 1, point_index: 2, lat: -23.56, lng: -46.715 },
      ]);

    const first = service.getContext('L9');
    const second = service.getContext('L09');
    expect(queryRaw).toHaveBeenCalledTimes(2);
    resolveStations([
      {
        id: 'jag',
        name: 'Villa Lobos',
        originalName: 'Villa Lobos',
        latitude: -23.55,
        longitude: -46.72,
      },
    ]);
    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        stations: [{ code: 'JAG', lat: -23.55, lng: -46.72 }],
        paths: [
          {
            points: [
              { lat: -23.55, lng: -46.72 },
              { lat: -23.56, lng: -46.715 },
            ],
          },
        ],
      },
      {
        stations: [{ code: 'JAG', lat: -23.55, lng: -46.72 }],
        paths: [
          {
            points: [
              { lat: -23.55, lng: -46.72 },
              { lat: -23.56, lng: -46.715 },
            ],
          },
        ],
      },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(2);

    await expect(service.getContext('L9')).resolves.toBeDefined();
    expect(queryRaw).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(5 * 60 * 1000);
    queryRaw
      .mockResolvedValueOnce([
        {
          id: 'jag',
          name: 'Villa Lobos',
          originalName: 'Villa Lobos',
          latitude: -23.55,
          longitude: -46.72,
        },
      ])
      .mockResolvedValueOnce([
        { path_id: 1, point_index: 1, lat: -23.55, lng: -46.72 },
        { path_id: 1, point_index: 2, lat: -23.56, lng: -46.715 },
      ]);
    await expect(service.getContext('L9')).resolves.toBeDefined();
    expect(queryRaw).toHaveBeenCalledTimes(4);
  });
});
