import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { createYoga } from 'graphql-yoga';
import { useDeferStream } from '@graphql-yoga/plugin-defer-stream';
import { GraphQLObjectType, GraphQLSchema } from 'graphql';
import {
  GeographyResolver,
  RouteFullDataResolver,
  StopFullDataResolver,
} from './geography.resolver';

describe('geography incremental GraphQL delivery', () => {
  it('delivers stop fields before the deferred route resolver finishes', async () => {
    const module = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();

    let releaseRoutes: (routes: unknown[]) => void = () => undefined;
    let routesReleased = false;
    const routesGate = new Promise<unknown[]>((resolve) => {
      releaseRoutes = (routes) => {
        routesReleased = true;
        resolve(routes);
      };
    });
    const geographyService = {
      getBusStop: jest.fn().mockResolvedValue({
        id: 'stop-1',
        stopId: 'stop-1',
        name: 'Parada',
        sourceAgency: 'sptrans',
        sourceId: 'stop-1',
        latitude: -23.55,
        longitude: -46.63,
        isSubwayStation: false,
        mergedStopIds: [],
      }),
      getStopRoutesFullData: jest.fn(() => routesGate),
    };
    const geographyResolver = new GeographyResolver(
      geographyService as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const stopFullDataResolver = new StopFullDataResolver(
      geographyService as never,
    );
    const routeFullDataResolver = new RouteFullDataResolver(
      geographyService as never,
    );

    try {
      const factory = module.get(GraphQLSchemaFactory);
      const schema = await factory.create([
        GeographyResolver,
        StopFullDataResolver,
        RouteFullDataResolver,
      ]);
      attachGeographyResolvers(
        schema,
        geographyResolver,
        stopFullDataResolver,
        routeFullDataResolver,
      );

      const yoga = createYoga({
        schema,
        plugins: [useDeferStream()],
        logging: false,
      });
      const response = await yoga.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'multipart/mixed; deferSpec=20220824',
        },
        body: JSON.stringify({
          query: `
            query StopDetails {
              stopFullData(stopId: "stop-1") {
                stop { stopId }
                ... @defer {
                  routes {
                    route { shortName }
                    trips { tripId }
                  }
                }
              }
            }
          `,
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('multipart/mixed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Expected an incremental response stream');

      const initialPayload = await readUntil(reader, '"stopId":"stop-1"');
      expect(initialPayload).toContain('"stop":{"stopId":"stop-1"}');
      expect(initialPayload).not.toContain('"routes"');
      expect(routesReleased).toBe(false);
      expect(geographyService.getStopRoutesFullData).toHaveBeenCalledWith(
        'stop-1',
        { includeTrips: true, includeShapes: false, includeStops: false },
      );

      releaseRoutes([
        {
          route: { routeId: 'route-1', shortName: '123A-10' },
          trips: [{ tripId: 'trip-1' }],
          shapes: [],
          stops: [],
        },
      ]);

      const deferredPayload = await readUntil(reader, '"tripId":"trip-1"');
      expect(deferredPayload).toContain('"routes"');
      expect(geographyService.getStopRoutesFullData).toHaveBeenCalledWith(
        'stop-1',
        { includeTrips: true, includeShapes: false, includeStops: false },
      );
      await reader.cancel();
    } finally {
      releaseRoutes([]);
      await module.close();
    }
  });

  it('delivers route stops before a deferred shape query finishes', async () => {
    const module = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();

    let releaseShapes: (shapes: unknown[]) => void = () => undefined;
    let shapesReleased = false;
    const shapesGate = new Promise<unknown[]>((resolve) => {
      releaseShapes = (shapes) => {
        shapesReleased = true;
        resolve(shapes);
      };
    });
    const geographyService = {
      getBusRoute: jest.fn().mockResolvedValue({
        id: 'route-1',
        routeId: 'route-1',
      }),
      getStopsForRoute: jest
        .fn()
        .mockResolvedValue([{ id: 'stop-1', stopId: 'stop-1' }]),
      getRouteShapesForRoute: jest.fn(() => shapesGate),
    };
    const geographyResolver = new GeographyResolver(
      geographyService as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const stopFullDataResolver = new StopFullDataResolver(
      geographyService as never,
    );
    const routeFullDataResolver = new RouteFullDataResolver(
      geographyService as never,
    );

    try {
      const factory = module.get(GraphQLSchemaFactory);
      const schema = await factory.create([
        GeographyResolver,
        StopFullDataResolver,
        RouteFullDataResolver,
      ]);
      attachGeographyResolvers(
        schema,
        geographyResolver,
        stopFullDataResolver,
        routeFullDataResolver,
      );

      const yoga = createYoga({
        schema,
        plugins: [useDeferStream()],
        logging: false,
      });
      const response = await yoga.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'multipart/mixed; deferSpec=20220824',
        },
        body: JSON.stringify({
          query: `
            query RouteDetails {
              routeFullData(routeId: "route-1") {
                route { routeId }
                stops { stopId }
                ... @defer {
                  shapes { shapeId }
                }
              }
            }
          `,
        }),
      });

      expect(response.status).toBe(200);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Expected an incremental response stream');

      const initialPayload = await readUntil(reader, '"stopId":"stop-1"');
      expect(initialPayload).toContain('"stops":[{"stopId":"stop-1"}]');
      expect(initialPayload).not.toContain('"shapes"');
      expect(shapesReleased).toBe(false);
      expect(geographyService.getRouteShapesForRoute).toHaveBeenCalledWith(
        'route-1',
      );

      releaseShapes([{ shapeId: 'shape-1' }]);
      const deferredPayload = await readUntil(reader, '"shapeId":"shape-1"');
      expect(deferredPayload).toContain('"shapes"');
      await reader.cancel();
    } finally {
      releaseShapes([]);
      await module.close();
    }
  });
});

function attachGeographyResolvers(
  schema: GraphQLSchema,
  geographyResolver: GeographyResolver,
  stopFullDataResolver: StopFullDataResolver,
  routeFullDataResolver: RouteFullDataResolver,
): void {
  const queryFields = schema.getQueryType()?.getFields();
  if (!queryFields?.stopFullData || !queryFields.routeFullData) {
    throw new Error('Code-first schema is missing full-data query fields');
  }

  queryFields.stopFullData.resolve = (_source, args) =>
    geographyResolver.stopFullData(args.stopId);
  queryFields.routeFullData.resolve = (_source, args) =>
    geographyResolver.routeFullData(args.routeId);
  objectType(schema, 'StopFullData').getFields().routes.resolve = (
    parent,
    _args,
    _context,
    info,
  ) => stopFullDataResolver.routes(parent as never, info);
  const routeFields = objectType(schema, 'RouteFullData').getFields();
  routeFields.trips.resolve = (parent) =>
    routeFullDataResolver.trips(parent as never);
  routeFields.shapes.resolve = (parent) =>
    routeFullDataResolver.shapes(parent as never);
  routeFields.stops.resolve = (parent) =>
    routeFullDataResolver.stops(parent as never);
}

function objectType(
  schema: GraphQLSchema,
  typeName: string,
): GraphQLObjectType {
  const type = schema.getType(typeName);
  if (!(type instanceof GraphQLObjectType)) {
    throw new Error(`Code-first schema is missing object type ${typeName}`);
  }

  return type;
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  marker: string,
): Promise<string> {
  let output = '';
  const deadline = Date.now() + 3000;
  const decoder = new TextDecoder();

  while (!output.includes(marker)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for incremental payload ${marker}`);
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const next = await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${marker}`)),
          Math.max(1, deadline - Date.now()),
        );
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
    if (next.done) throw new Error('Incremental response ended early');
    output += decoder.decode(next.value, { stream: true });
  }

  return output;
}
