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
    expect(maximumActive).toBeLessThanOrEqual(2);
  });

  it('rejects pathological route fan-out', async () => {
    const service = createService(101);

    await expect(service.getStopFullData('stop-1')).rejects.toMatchObject({
      status: 413,
    });
  });
});

describe('GeographyServiceOptimized route full data', () => {
  it('does not load omitted related collections', async () => {
    const { service, tripService } = createRouteDataService();
    const getTripsForRoute = jest.spyOn(service, 'getTripsForRoute');
    const getStopsForRoute = jest.spyOn(service, 'getStopsForRoute');

    await service.getRouteFullData('route-1', {
      includeTrips: false,
      includeShapes: false,
      includeStops: false,
    });

    expect(getTripsForRoute).not.toHaveBeenCalled();
    expect(getStopsForRoute).not.toHaveBeenCalled();
    expect(tripService.getTripsForRoute).not.toHaveBeenCalled();
    expect(tripService.getStopsForRoute).not.toHaveBeenCalled();
  });

  it('loads only the related collections requested by the caller', async () => {
    const { service, tripService } = createRouteDataService();
    const getTripsForRoute = jest.spyOn(service, 'getTripsForRoute');
    const getStopsForRoute = jest.spyOn(service, 'getStopsForRoute');

    await service.getRouteFullData('route-1', {
      includeTrips: true,
      includeShapes: false,
      includeStops: false,
    });

    expect(getTripsForRoute).toHaveBeenCalledWith('route-1');
    expect(getStopsForRoute).not.toHaveBeenCalled();
    expect(tripService.getTripsForRoute).toHaveBeenCalledWith('route-1');
    expect(tripService.getStopsForRoute).not.toHaveBeenCalled();
  });

  it('returns shapes when the route-full-data caller requests them', async () => {
    const { service } = createRouteDataService();
    const busRouteService = (
      service as never as {
        busRouteService: { getRouteShapesForRoute: jest.Mock };
      }
    ).busRouteService;
    busRouteService.getRouteShapesForRoute.mockResolvedValue([
      { shape_id: 'shape-1', coordinates: [[-46.6, -23.5]] },
    ]);

    await expect(
      service.getRouteFullData('route-1', {
        includeTrips: false,
        includeShapes: true,
        includeStops: false,
      }),
    ).resolves.toMatchObject({
      shapes: [
        {
          id: 'shape-1',
          shapeId: 'shape-1',
          geometry: { type: 'LineString', coordinates: [[-46.6, -23.5]] },
        },
      ],
    });
  });

  it('keeps full-data loading for callers without options', async () => {
    const { service } = createRouteDataService();
    const getTripsForRoute = jest.spyOn(service, 'getTripsForRoute');
    const getStopsForRoute = jest.spyOn(service, 'getStopsForRoute');

    await service.getRouteFullData('route-1');

    expect(getTripsForRoute).toHaveBeenCalledWith('route-1');
    expect(getStopsForRoute).toHaveBeenCalledWith('route-1');
  });
});

describe('GeographyServiceOptimized precomputed rail connections', () => {
  it('hydrates indexed GeoSampa station hits with one database query', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          route_id: '477A-10',
          route_short_name: '477A-10',
          route_long_name: 'Terminal - Estação',
          direction_id: 0,
          trip_headsign: 'Estação',
          stop_id: 'near-stop',
          stop_name: 'Parada da estação',
          stop_sequence: 12,
          station_id: 42,
          station_name: 'Estação Central',
          agencies: ['METRO'],
          lines: ['Azul'],
          distance_meters: 84.6,
        },
      ]),
    };
    const service = new GeographyServiceOptimized(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getRouteRailConnectionsForStop(' stop-1 ', ['477A-10']),
    ).resolves.toEqual([
      {
        routeId: '477A-10',
        routeShortName: '477A-10',
        routeLongName: 'Terminal - Estação',
        directions: [
          {
            directionId: 0,
            headsign: 'Estação',
            stations: [
              {
                id: '42',
                name: 'Estação Central',
                agencies: ['METRO'],
                lines: ['Azul'],
                distanceMeters: 85,
                nearStopId: 'near-stop',
                nearStopName: 'Parada da estação',
                stopSequence: 12,
              },
            ],
          },
        ],
      },
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      (prisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join(' '),
    ).toContain('route_rail_connection_hits');
  });

  it('omits routes without a positive precomputed rail connection', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = new GeographyServiceOptimized(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getRouteRailConnectionsForStop('stop-1', ['775A-10']),
    ).resolves.toEqual([]);
  });

  it('rejects route-rail connection requests that exceed the service cap', async () => {
    const service = new GeographyServiceOptimized(
      { $queryRaw: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getRouteRailConnectionsForStop(
        'stop-1',
        Array.from({ length: 101 }, (_, index) => `route-${index}`),
      ),
    ).rejects.toMatchObject({ status: 413 });
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

function createRouteDataService(): {
  service: GeographyServiceOptimized;
  tripService: {
    getTripsForRoute: jest.Mock;
    getStopsForRoute: jest.Mock;
  };
} {
  const tripService = {
    getTripsForRoute: jest.fn().mockResolvedValue([]),
    getStopsForRoute: jest.fn().mockResolvedValue([]),
  };
  const busRouteService = {
    getBusRoute: jest.fn().mockResolvedValue({
      id: 'route-1',
      routeId: 'route-1',
      shortName: '1',
      longName: 'Route 1',
      routeType: 3,
      color: '',
      textColor: '',
    }),
    getRouteShapesForRoute: jest.fn().mockResolvedValue([]),
  };

  return {
    service: new GeographyServiceOptimized(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      busRouteService as never,
      tripService as never,
    ),
    tripService,
  };
}
