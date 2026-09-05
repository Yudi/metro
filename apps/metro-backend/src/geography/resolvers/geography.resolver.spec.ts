import {
  FieldNode,
  FragmentDefinitionNode,
  GraphQLResolveInfo,
  Kind,
  parse,
} from 'graphql';
import { GeographyResolver } from './geography.resolver';

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
  it('keeps direct callers on the legacy full-data service contract', async () => {
    const geographyService = {
      getRouteFullData: jest.fn().mockResolvedValue(null),
    };
    const resolver = createResolver(geographyService);

    await resolver.routeFullData('route-1');

    expect(geographyService.getRouteFullData).toHaveBeenCalledWith('route-1');
  });

  it('does not request related route collections when they are omitted', async () => {
    const geographyService = {
      getRouteFullData: jest.fn().mockResolvedValue(null),
    };
    const resolver = createResolver(geographyService);

    await resolver.routeFullData(
      'route-1',
      resolveInfoFor(`
        query Route {
          routeFullData(routeId: "route-1") {
            route { routeId }
          }
        }
      `, 'routeFullData'),
    );

    expect(geographyService.getRouteFullData).toHaveBeenCalledWith('route-1', {
      includeTrips: false,
      includeShapes: false,
      includeStops: false,
    });
  });

  it('requests each related route collection selected by the operation', async () => {
    const geographyService = {
      getRouteFullData: jest.fn().mockResolvedValue(null),
    };
    const resolver = createResolver(geographyService);

    await resolver.routeFullData(
      'route-1',
      resolveInfoFor(`
        query Route {
          routeFullData(routeId: "route-1") {
            route { routeId }
            trips { tripId }
            stops { stopId }
          }
        }
      `, 'routeFullData'),
    );

    expect(geographyService.getRouteFullData).toHaveBeenCalledWith('route-1', {
      includeTrips: true,
      includeShapes: false,
      includeStops: true,
    });
  });

  it('finds fields through named and inline fragments', async () => {
    const geographyService = {
      getRouteFullData: jest.fn().mockResolvedValue(null),
    };
    const resolver = createResolver(geographyService);

    await resolver.routeFullData(
      'route-1',
      resolveInfoFor(`
        query Route {
          routeFullData(routeId: "route-1") {
            route { routeId }
            ...RouteCollections
            ... on RouteFullData {
              shapes { shapeId }
            }
          }
        }

        fragment RouteCollections on RouteFullData {
          trips { tripId }
        }
      `, 'routeFullData'),
    );

    expect(geographyService.getRouteFullData).toHaveBeenCalledWith('route-1', {
      includeTrips: true,
      includeShapes: true,
      includeStops: false,
    });
  });

  it('retains stop route-detail detection through fragments', async () => {
    const geographyService = {
      getStopFullData: jest.fn().mockResolvedValue(null),
    };
    const resolver = createResolver(geographyService);

    await resolver.stopFullData(
      'stop-1',
      resolveInfoFor(`
        query Stop {
          stopFullData(stopId: "stop-1") {
            ...StopCollections
          }
        }

        fragment StopCollections on StopFullData {
          routes {
            ... on RouteFullData {
              trips { tripId }
            }
          }
        }
      `, 'stopFullData'),
    );

    expect(geographyService.getStopFullData).toHaveBeenCalledWith(
      'stop-1',
      true,
    );
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

function resolveInfoFor(
  source: string,
  fieldName: string,
): GraphQLResolveInfo {
  const document = parse(source);
  const operation = document.definitions.find(
    (definition) => definition.kind === Kind.OPERATION_DEFINITION,
  );

  if (!operation || operation.kind !== Kind.OPERATION_DEFINITION) {
    throw new Error('Expected an operation definition');
  }

  const fieldNodes = operation.selectionSet.selections.filter(
    (selection): selection is FieldNode =>
      selection.kind === Kind.FIELD && selection.name.value === fieldName,
  );
  const fragments: Record<string, FragmentDefinitionNode> = {};

  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments[definition.name.value] = definition;
    }
  }

  return { fieldNodes, fragments } as unknown as GraphQLResolveInfo;
}
