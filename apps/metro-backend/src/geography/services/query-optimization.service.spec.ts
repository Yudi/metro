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
          bus_agencies: ['artesp', 'sptrans'],
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

  it('queries normalized feed views and expands matched stops for routes', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          requested_stop_id: 'artesp:2',
          route_id: 'artesp:001',
          route_short_name: '001',
          route_long_name: 'Terminal - Centro',
          route_type: 3,
          route_color: '#000000',
          route_text_color: '#FFFFFF',
          source_agency: 'artesp',
          source_id: '001',
          fares: [{ price: 5.4, currency: 'BRL' }],
        },
      ]),
    };
    const service = new QueryOptimizationService(prisma as never);

    await expect(service.getRoutesForMultipleStops(['artesp:2'])).resolves.toEqual(
      new Map([
        [
          'artesp:2',
          [
            expect.objectContaining({
              routeId: 'artesp:001',
              sourceAgency: 'artesp',
              sourceId: '001',
              supportsRealtime: false,
              fares: [{ price: 5.4, currency: 'BRL' }],
            }),
          ],
        ],
      ]),
    );

    const sql = (prisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('Gtfs_StopTime');
    expect(sql).toContain('Gtfs_Trip');
    expect(sql).toContain('Gtfs_Route');
    expect(sql).toContain('physical_stop_members');
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
