import { TripServiceOptimized } from './trip-optimized.service';

describe('TripServiceOptimized', () => {
  it('requests deterministic representatives for each route pattern', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        id: 2,
        route_id: 'route-1',
        service_id: 'weekday',
        trip_id: 'trip-2',
        trip_headsign: 'Centro',
        direction_id: 0,
        shape_id: 'shape-1',
      },
    ]);
    const service = new TripServiceOptimized(
      { $queryRaw: queryRaw } as never,
      {
        findRouteByMultipleCriteria: jest.fn().mockResolvedValue({
          route_id: 'route-1',
        }),
      } as never,
    );

    await expect(service.getTripsForRoute('route-1')).resolves.toHaveLength(1);
    const query = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join(' ');
    expect(query).toContain(
      'DISTINCT ON (direction_id, trip_headsign, shape_id)',
    );
    expect(query).toContain(
      'ORDER BY direction_id, trip_headsign, shape_id, trip_id',
    );
    expect(query).not.toContain('LIMIT 20');
  });
});
