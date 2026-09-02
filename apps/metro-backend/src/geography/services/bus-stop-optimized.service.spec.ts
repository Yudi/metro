import { BusStopServiceOptimized } from './bus-stop-optimized.service';

describe('BusStopServiceOptimized', () => {
  const stop = {
    id: 1,
    stop_id: '190011837',
    stop_name: 'Parada de teste',
    stop_desc: null,
    stop_lat: -23.55,
    stop_lon: -46.63,
  };

  let prisma: { $queryRaw: jest.Mock };
  let queryOptimization: { batchGetStopServiceInfo: jest.Mock };
  let service: BusStopServiceOptimized;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([stop]) };
    queryOptimization = {
      batchGetStopServiceInfo: jest.fn().mockResolvedValue(
        new Map([
          [
            stop.stop_id,
            {
              servesRail: false,
              servesBus: true,
              agencies: [],
              railRouteShortNames: [],
            },
          ],
        ]),
      ),
    };
    service = new BusStopServiceOptimized(
      prisma as never,
      queryOptimization as never,
    );
  });

  it('uses the simple ordered path when loading all city stops', async () => {
    await service.searchBusStops({ limit: 25_000 });

    const sql = sqlText(prisma.$queryRaw);
    expect(sql).not.toContain('ST_MakeEnvelope');
    expect(sql).not.toContain('stop_lat BETWEEN');
    expect(prisma.$queryRaw.mock.calls[0].slice(1)).toEqual([25_000]);
  });

  it('uses the indexed geography column for bounded map queries', async () => {
    await service.searchBusStops({
      bounds: {
        minLat: -23.7,
        maxLat: -23.4,
        minLng: -46.8,
        maxLng: -46.4,
      },
      limit: 500,
    });

    const sql = sqlText(prisma.$queryRaw);
    expect(sql).toContain('location &&');
    expect(sql).toContain('location');
    expect(sql).toContain('ST_MakeEnvelope');
    expect(sql).toContain('stop_lat BETWEEN');
    expect(sql).toContain('stop_lon BETWEEN');
    expect(prisma.$queryRaw.mock.calls[0].slice(1)).toEqual([
      -46.8,
      -23.7,
      -46.4,
      -23.4,
      -23.7,
      -23.4,
      -46.8,
      -46.4,
      500,
    ]);
  });
});

function sqlText(queryRaw: jest.Mock): string {
  const strings = queryRaw.mock.calls[0][0] as TemplateStringsArray;
  return strings.join('?');
}
