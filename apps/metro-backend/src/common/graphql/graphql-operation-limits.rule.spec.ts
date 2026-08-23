import { buildSchema, parse, validate } from 'graphql';
import { graphqlOperationLimitsRule } from './graphql-operation-limits.rule';

const schema = buildSchema(`
  type Query { node: Node! }
  type Node { value: String, child: Node! }
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
});
