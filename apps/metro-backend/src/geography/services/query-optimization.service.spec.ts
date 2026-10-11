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

  it('uses precomputed membership and deduplicates physical-stop routes before fares', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          requested_stop_id: 'sptrans:1',
          route_id: '123A-10',
          route_short_name: '123A-10',
          route_long_name: 'Terminal - Centro',
          route_type: 3,
          route_color: '#000000',
          route_text_color: '#FFFFFF',
          source_agency: 'sptrans',
          source_id: '123A-10',
          fares: [],
        },
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
          fares: [
            { price: 5.4, currency: 'BRL' },
            { price: 7.2, currency: 'BRL' },
          ],
        },
      ]),
    };
    const service = new QueryOptimizationService(prisma as never);

    await expect(
      service.getRoutesForMultipleStops([
        'sptrans:1',
        'artesp:2',
        'sptrans:1',
        'stop-without-routes',
      ]),
    ).resolves.toEqual(
      new Map([
        [
          'sptrans:1',
          [
            expect.objectContaining({
              routeId: '123A-10',
              sourceAgency: 'sptrans',
              fares: [],
            }),
          ],
        ],
        [
          'artesp:2',
          [
            expect.objectContaining({
              routeId: 'artesp:001',
              sourceAgency: 'artesp',
              sourceId: '001',
              supportsRealtime: false,
              fares: [
                { price: 5.4, currency: 'BRL' },
                { price: 7.2, currency: 'BRL' },
              ],
            }),
          ],
        ],
        ['stop-without-routes', []],
      ]),
    );

    const sql = (
      prisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray
    ).join('?');
    expect(sql).not.toContain('Gtfs_StopTime');
    expect(sql).not.toContain('Gtfs_Trip');
    expect(sql).toContain('stop_route_membership');
    expect(sql).toContain('Gtfs_Route');
    expect(sql).toContain('physical_stop_members');
    expect(sql).toMatch(/expanded_stops AS MATERIALIZED\s*\(/);
    expect(sql).toContain('ON membership.stop_id = expanded.source_stop_id');
    expect(sql).toContain(
      'COALESCE(member.source_stop_id, resolved.physical_stop_id) AS source_stop_id',
    );
    expect(sql).toContain('route_hits AS MATERIALIZED');
    expect(sql).toContain('unique_routes AS MATERIALIZED');
    expect(sql.indexOf('unique_routes AS MATERIALIZED')).toBeLessThan(
      sql.indexOf('LEFT JOIN LATERAL'),
    );
    expect(sql).toContain('WHERE rule.route_id = unique_routes.route_id');
    expect(sql).toContain('ORDER BY fare.price, fare.currency_type');
  });

  it('coalesces repeated stop batches while keeping separate stops isolated', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const service = new QueryOptimizationService(prisma as never);
    const results = await Promise.all([
      service.getRoutesForMultipleStops(['a', 'b', 'a']),
      service.getRoutesForMultipleStops(['b', 'a']),
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(results[0].get('a')).toEqual([]);
    await service.getRoutesForMultipleStops(['c']);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('expires stop membership results and retries failed loads', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    try {
      const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
      const service = new QueryOptimizationService(prisma as never);
      await service.getRoutesForMultipleStops(['a']);
      await service.getRoutesForMultipleStops(['a']);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      now.mockReturnValue(30_000);
      prisma.$queryRaw.mockRejectedValueOnce(new Error('unavailable'));
      await expect(service.getRoutesForMultipleStops(['a'])).rejects.toThrow('unavailable');
      await service.getRoutesForMultipleStops(['a']);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    } finally {
      now.mockRestore();
    }
  });

  it('shares repeated map line-name lookups without loading the timetable', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { requested_stop_id: 'a', route_short_name: '001' },
      ]),
    };
    const service = new QueryOptimizationService(prisma as never);
    const results = await Promise.all([
      service.getBatchRoutesForStops(['a', 'b']),
      service.getBatchRoutesForStops(['b', 'a']),
    ]);
    expect(results[0]).toEqual(new Map([['a', ['001']], ['b', []]]));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = (prisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('stop_route_membership');
    expect(sql).not.toContain('Gtfs_StopTime');
    expect(sql).not.toContain('Gtfs_Trip');
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
