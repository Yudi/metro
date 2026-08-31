import { GeographyServiceOptimized } from './geography-optimized.service';

describe('GeographyServiceOptimized stop full data', () => {
  it('does not prefetch unrequested route details', async () => {
    const service = createService(3);
    const getRouteFullData = jest.spyOn(service, 'getRouteFullData');

    const result = await service.getStopFullData('stop-1', false);

    expect(getRouteFullData).not.toHaveBeenCalled();
    expect(result?.routes).toHaveLength(3);
    expect(result?.routes[0]).toMatchObject({
      trips: [],
      shapes: [],
      stops: [],
    });
  });

  it('bounds concurrent detail expansion', async () => {
    const service = createService(17);
    let active = 0;
    let maximumActive = 0;
    jest
      .spyOn(service, 'getRouteFullData')
      .mockImplementation(async (routeId) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
        return {
          route: {
            id: routeId,
            routeId,
            shortName: routeId,
            longName: routeId,
            routeType: 3,
            color: '',
            textColor: '',
          },
          trips: [],
          shapes: [],
          stops: [],
        };
      });

    const result = await service.getStopFullData('stop-1', true);

    expect(result?.routes).toHaveLength(17);
    expect(maximumActive).toBeLessThanOrEqual(8);
  });

  it('rejects pathological route fan-out', async () => {
    const service = createService(101);

    await expect(service.getStopFullData('stop-1')).rejects.toMatchObject({
      status: 413,
    });
  });
});

function createService(routeCount: number): GeographyServiceOptimized {
  const busStopService = {
    getBusStop: jest.fn().mockResolvedValue({
      id: 'stop-1',
      stopId: 'stop-1',
      name: 'Parada',
      latitude: -23.55,
      longitude: -46.63,
      isSubwayStation: false,
    }),
  };
  const tripService = {
    getRoutesForStop: jest.fn().mockResolvedValue(
      Array.from({ length: routeCount }, (_, index) => ({
        id: `route-${index}`,
        routeId: `route-${index}`,
        shortName: `${index}`,
        longName: `Route ${index}`,
      })),
    ),
  };

  return new GeographyServiceOptimized(
    {} as never,
    {} as never,
    busStopService as never,
    {} as never,
    {} as never,
    tripService as never,
  );
}
