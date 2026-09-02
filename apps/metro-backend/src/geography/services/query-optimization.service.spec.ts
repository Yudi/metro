import { QueryOptimizationService } from './query-optimization.service';

describe('QueryOptimizationService precomputed stop service data', () => {
  it('maps precomputed rail service and supplies defaults for unknown stops', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          stop_id: 'rail-stop',
          serves_rail: true,
          serves_bus: false,
          rail_route_short_names: ['METRÔ L1-AZUL'],
        },
      ]),
    };
    const service = new QueryOptimizationService(prisma as never);

    const result = await service.batchGetStopServiceInfo([
      'rail-stop',
      'unknown-stop',
    ]);

    expect(result.get('rail-stop')).toMatchObject({
      servesRail: true,
      servesBus: false,
      railRouteShortNames: ['METRÔ L1-AZUL'],
    });
    expect(result.get('unknown-stop')).toEqual({
      servesRail: false,
      servesBus: false,
      agencies: [],
      railRouteShortNames: [],
    });
  });

  it('returns correct precomputed classification from the multiple-stop path', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 1,
            stop_id: 'mixed-stop',
            stop_name: 'Integração',
            stop_desc: null,
            stop_lat: -23.5,
            stop_lon: -46.6,
          },
        ])
        .mockResolvedValueOnce([
          {
            stop_id: 'mixed-stop',
            serves_rail: true,
            serves_bus: true,
            rail_route_short_names: ['CPTM L09'],
          },
        ]),
    };
    const service = new QueryOptimizationService(prisma as never);

    await expect(service.getStopsById(['mixed-stop'])).resolves.toEqual([
      expect.objectContaining({
        stopId: 'mixed-stop',
        isSubwayStation: true,
        routeShortNames: ['CPTM L09'],
        geometry: {
          type: 'Point',
          coordinates: [[-46.6, -23.5]],
        },
      }),
    ]);
  });
});
