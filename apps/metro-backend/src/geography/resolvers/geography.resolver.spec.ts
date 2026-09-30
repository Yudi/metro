import {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLResolveInfo,
  Kind,
  parse,
} from 'graphql';
import {
  GeographyResolver,
  RouteFullDataResolver,
  StopFullDataResolver,
} from './geography.resolver';

describe('GeographyResolver input bounds', () => {
  it('rejects oversized ID arrays before service work', async () => {
    const geographyService = {
      getMultipleBusStops: jest.fn(),
    };
    const resolver = new GeographyResolver(
      geographyService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      resolver.multipleBusStops(
        Array.from({ length: 501 }, (_, index) => `stop-${index}`),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(geographyService.getMultipleBusStops).not.toHaveBeenCalled();
  });

  it('normalizes and deduplicates bounded identifiers', async () => {
    const geographyService = {
      getMultipleBusStops: jest.fn().mockResolvedValue([]),
    };
    const resolver = new GeographyResolver(
      geographyService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await resolver.multipleBusStops([' stop-1 ', 'stop-1', 'stop-2']);

    expect(geographyService.getMultipleBusStops).toHaveBeenCalledWith([
      'stop-1',
      'stop-2',
    ]);
  });

  it('rejects whitespace and control characters in singular identifiers', async () => {
    const geographyService = {
      getBusStop: jest.fn(),
    };
    const resolver = new GeographyResolver(
      geographyService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(resolver.busStop('  ')).rejects.toMatchObject({ status: 400 });
    await expect(resolver.busStop('stop\n1')).rejects.toMatchObject({
      status: 400,
    });
    expect(geographyService.getBusStop).not.toHaveBeenCalled();
  });
});

describe('GeographyResolver full-data selections', () => {
  it('returns stop data without waiting for its route list', async () => {
    const geographyService = {
      getBusStop: jest.fn().mockResolvedValue({ stopId: 'stop-1' }),
      getStopRoutesFullData: jest.fn(),
    };
    const resolver = createResolver(geographyService);

    await expect(resolver.stopFullData('stop-1')).resolves.toEqual({
      stop: { stopId: 'stop-1' },
    });

    expect(geographyService.getBusStop).toHaveBeenCalledWith('stop-1');
    expect(geographyService.getStopRoutesFullData).not.toHaveBeenCalled();
  });

  it('loads only selected stop-route collections through fragments and directives', async () => {
    const geographyService = {
      getStopRoutesFullData: jest.fn().mockResolvedValue([]),
    };
    const resolver = new StopFullDataResolver(geographyService as never);

    await resolver.routes(
      { stop: { stopId: 'stop-1' } } as never,
      resolveInfoForNestedField(
        `
        query Stop($includeTrips: Boolean!) {
          stopFullData(stopId: "stop-1") {
            routes {
              route { routeId }
              ...RouteCollections
            }
          }
        }

        fragment RouteCollections on RouteFullData {
          trips @include(if: $includeTrips) { tripId }
          shapes @skip(if: true) { shapeId }
          ... on RouteFullData {
            stops { stopId }
          }
        }
      `,
        'stopFullData',
        'routes',
        { includeTrips: false },
      ),
    );

    expect(geographyService.getStopRoutesFullData).toHaveBeenCalledWith(
      'stop-1',
      { includeTrips: false, includeShapes: false, includeStops: true },
    );
  });

  it('returns a route root without loading unselected collections', async () => {
    const geographyService = {
      getBusRoute: jest.fn().mockResolvedValue({
        routeId: 'route-1',
        id: 'route-1',
      }),
      getTripsForRoute: jest.fn(),
    };
    const resolver = createResolver(geographyService);

    const result = await resolver.routeFullData('route-1');

    expect(result).toEqual({ route: { routeId: 'route-1', id: 'route-1' } });
    expect(result).not.toHaveProperty('trips');
    expect(geographyService.getBusRoute).toHaveBeenCalledWith('route-1');
    expect(geographyService.getTripsForRoute).not.toHaveBeenCalled();
  });

  it('loads deferred route collections independently', async () => {
    let releaseShapes: (shapes: { shapeId: string }[]) => void = () =>
      undefined;
    const shapesGate = new Promise<{ shapeId: string }[]>((resolve) => {
      releaseShapes = resolve;
    });
    const geographyService = {
      getBusRoute: jest.fn().mockResolvedValue({
        routeId: 'route-1',
        id: 'route-1',
      }),
      getTripsForRoute: jest.fn().mockResolvedValue([{ tripId: 'trip-1' }]),
      getRouteShapesForRoute: jest.fn().mockReturnValue(shapesGate),
      getStopsForRoute: jest.fn().mockResolvedValue([{ stopId: 'stop-1' }]),
    };
    const rootResolver = createResolver(geographyService);
    const fieldsResolver = new RouteFullDataResolver(geographyService as never);

    const result = await rootResolver.routeFullData('route-1');

    const tripsPromise = fieldsResolver.trips(result as never);
    const shapesPromise = fieldsResolver.shapes(result as never);
    const stopsPromise = fieldsResolver.stops(result as never);

    await expect(tripsPromise).resolves.toEqual([{ tripId: 'trip-1' }]);
    await expect(stopsPromise).resolves.toEqual([{ stopId: 'stop-1' }]);
    expect(geographyService.getTripsForRoute).toHaveBeenCalledWith('route-1');
    expect(geographyService.getStopsForRoute).toHaveBeenCalledWith('route-1');
    expect(geographyService.getRouteShapesForRoute).toHaveBeenCalledWith(
      'route-1',
    );

    releaseShapes([{ shapeId: 'shape-1' }]);
    await expect(shapesPromise).resolves.toEqual([{ shapeId: 'shape-1' }]);

    await fieldsResolver.trips(result as never);
    expect(geographyService.getTripsForRoute).toHaveBeenCalledTimes(1);
  });

  it('uses hydrated stop routes without loading their details again', async () => {
    const geographyService = {
      getRouteFullDataForRoute: jest.fn(),
    };
    const resolver = new RouteFullDataResolver(geographyService as never);

    await expect(
      resolver.trips({ route: { routeId: 'route-1' }, trips: [] } as never),
    ).resolves.toEqual([]);

    expect(geographyService.getRouteFullDataForRoute).not.toHaveBeenCalled();
  });
});

function createResolver(geographyService: object): GeographyResolver {
  return new GeographyResolver(
    geographyService as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function resolveInfoForNestedField(
  source: string,
  outerFieldName: string,
  fieldName: string,
  variableValues: Record<string, unknown> = {},
): GraphQLResolveInfo {
  const document = parse(source);
  const operation = document.definitions.find(
    (definition) => definition.kind === Kind.OPERATION_DEFINITION,
  );

  if (!operation || operation.kind !== Kind.OPERATION_DEFINITION) {
    throw new Error('Expected an operation definition');
  }

  const outerField = operation.selectionSet.selections.find(
    (selection): selection is FieldNode =>
      selection.kind === Kind.FIELD && selection.name.value === outerFieldName,
  );
  const fieldNodes = outerField?.selectionSet?.selections.filter(
    (selection): selection is FieldNode =>
      selection.kind === Kind.FIELD && selection.name.value === fieldName,
  );
  const fragments: Record<string, FragmentDefinitionNode> = {};

  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments[definition.name.value] = definition;
    }
  }

  return {
    fieldNodes: fieldNodes ?? [],
    fragments,
    variableValues,
  } as unknown as GraphQLResolveInfo;
}
