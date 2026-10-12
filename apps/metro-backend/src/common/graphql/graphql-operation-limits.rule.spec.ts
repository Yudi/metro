import { buildSchema, parse, validate } from 'graphql';
import { graphqlOperationLimitsRule } from './graphql-operation-limits.rule';

const schema = buildSchema(`
  type Query {
    node: Node!
    favoriteBusDirections(codes: [String!]!): [BusRouteDirection!]!
    busRouteDirections(ids: [String!]!): [BusRouteDirection!]!
    busStopDirections(stopId: String!): [BusRouteDirection!]!
    busServiceIntervals(routeCodes: [String!]!): IntervalsResult!
    busRouteItinerary(routeId: String!, serviceDate: String!): IntervalsResult!
    busPublishedRouteInformation(routeId: String!): IntervalsResult!
  }
  type Node { value: String, child: Node! }
  type BusRouteDirection { geometry: Geometry }
  type Geometry { type: String! }
  type IntervalsResult { status: String! }
`);

describe('graphqlOperationLimitsRule', () => {
  it('accepts a representative query', () => {
    const errors = validate(
      schema,
      parse('query Dashboard { node { value child { value } } }'),
      [graphqlOperationLimitsRule],
    );

    expect(errors).toEqual([]);
  });

  it('rejects excessive depth through fragments before execution', () => {
    const fragments = Array.from({ length: 13 }, (_, index) => {
      const next = index === 12 ? 'value' : `child { ...Level${index + 1} }`;
      return `fragment Level${index} on Node { ${next} }`;
    }).join('\n');
    const errors = validate(
      schema,
      parse(`query Deep { node { ...Level0 } } ${fragments}`),
      [graphqlOperationLimitsRule],
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extensions: { code: 'QUERY_DEPTH_LIMIT_EXCEEDED' },
        }),
      ]),
    );
  });

  it('rejects excessive alias fan-out', () => {
    const aliases = Array.from(
      { length: 51 },
      (_, index) => `value${index}: value`,
    ).join('\n');
    const errors = validate(
      schema,
      parse(`query Aliases { node { ${aliases} } }`),
      [graphqlOperationLimitsRule],
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extensions: { code: 'QUERY_ALIAS_LIMIT_EXCEEDED' },
        }),
      ]),
    );
  });

  it('rejects multiple expensive service interval queries', () => {
    const errors = validate(
      schema,
      parse(`
        query Intervals {
          first: busServiceIntervals(routeCodes: ["875A-10"]) { status }
          second: busServiceIntervals(routeCodes: ["875A-10"]) { status }
        }
      `),
      [graphqlOperationLimitsRule],
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extensions: {
            code: 'EXPENSIVE_BUS_QUERY_LIMIT_EXCEEDED',
          },
        }),
      ]),
    );
  });

  it('rejects aliases and combinations of expensive bus queries', () => {
    const errors = validate(
      schema,
      parse(`
        query BusInformation {
          first: busRouteItinerary(routeId: "477A-10", serviceDate: "2026-09-08") { status }
          second: busPublishedRouteInformation(routeId: "477A-10") { status }
        }
      `),
      [graphqlOperationLimitsRule],
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extensions: { code: 'EXPENSIVE_BUS_QUERY_LIMIT_EXCEEDED' },
        }),
      ]),
    );
  });

  it('accepts one service interval query', () => {
    const errors = validate(
      schema,
      parse(`
        query Intervals {
          busServiceIntervals(routeCodes: ["875A-10"]) { status }
        }
      `),
      [graphqlOperationLimitsRule],
    );

    expect(errors).toEqual([]);
  });

  it('rejects list-amplified geometry aliases that fit the syntax limits', () => {
    const codes = Array.from({ length: 500 }, (_, index) =>
      JSON.stringify(`direction-${index}`),
    ).join(', ');
    const geometryAliases = Array.from(
      { length: 50 },
      (_, index) => `geometry${index}: geometry { type }`,
    ).join('\n');
    const errors = validate(
      schema,
      parse(`query Amplification {
        favoriteBusDirections(codes: [${codes}]) { ${geometryAliases} }
      }`),
      [graphqlOperationLimitsRule],
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extensions: {
            code: 'BUS_DIRECTION_GEOMETRY_COST_LIMIT_EXCEEDED',
          },
        }),
      ]),
    );
  });

  it('uses literal list cardinality when estimating geometry work', () => {
    const geometryAliases = Array.from(
      { length: 50 },
      (_, index) => `geometry${index}: geometry { type }`,
    ).join('\n');
    const errors = validate(
      schema,
      parse(`query SmallBatch {
        favoriteBusDirections(codes: ["first", "second"]) { ${geometryAliases} }
      }`),
      [graphqlOperationLimitsRule],
    );

    expect(errors).toEqual([]);
  });

  it('assumes variable lists can reach the resolver batch limit', () => {
    const errors = validate(
      schema,
      parse(`query VariableBatch($codes: [String!]!) {
        favoriteBusDirections(codes: $codes) {
          first: geometry { type }
          second: geometry { type }
          third: geometry { type }
        }
      }`),
      [graphqlOperationLimitsRule],
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extensions: {
            code: 'BUS_DIRECTION_GEOMETRY_COST_LIMIT_EXCEEDED',
          },
        }),
      ]),
    );
  });

  it('applies geometry cost to route and stop direction queries', () => {
    const errors = validate(
      schema,
      parse(`query StopDirections {
        busStopDirections(stopId: "stop-1") {
          first: geometry { type }
          second: geometry { type }
          third: geometry { type }
        }
      }`),
      [graphqlOperationLimitsRule],
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extensions: {
            code: 'BUS_DIRECTION_GEOMETRY_COST_LIMIT_EXCEEDED',
          },
        }),
      ]),
    );
  });
});
