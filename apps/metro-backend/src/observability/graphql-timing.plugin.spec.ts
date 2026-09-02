import type {
  GraphQLRequestContext,
  GraphQLRequestContextWillSendResponse,
} from '@apollo/server';
import { createGraphQLTimingPlugin } from './graphql-timing.plugin';

describe('GraphQL timing plugin', () => {
  it('logs a slow operation without query or variable data', async () => {
    const logger = { warn: jest.fn() };
    let nowValue = 0;
    const plugin = createGraphQLTimingPlugin({
      logger,
      thresholdMs: 10,
      now: () => nowValue,
    });
    const requestContext = {
      contextValue: { requestId: 'request-1234' },
      request: { http: { headers: new Map([['x-request-id', 'request-1234']]) } },
    } as unknown as GraphQLRequestContext<Record<string, unknown>>;
    if (!plugin.requestDidStart) {
      throw new Error('GraphQL timing plugin did not register');
    }
    const listener = await plugin.requestDidStart(requestContext);
    nowValue = 20;
    await listener?.willSendResponse?.({
      operationName: 'Search',
      response: {
        http: { status: 200, headers: new Map() },
        body: { kind: 'single', singleResult: { data: {} } },
      },
    } as unknown as GraphQLRequestContextWillSendResponse<
      Record<string, unknown>
    >);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const record = JSON.parse(logger.warn.mock.calls[0][0]) as Record<
      string,
      unknown
    >;
    expect(record).toMatchObject({
      event: 'slow_graphql_operation',
      operationName: 'Search',
      status: 200,
      outcome: 'ok',
      requestId: 'request-1234',
    });
    expect(record.durationMs).toBe(20);
    expect(logger.warn.mock.calls[0][0]).not.toContain('query');
    expect(logger.warn.mock.calls[0][0]).not.toContain('variables');
  });

  it('redacts an unsafe operation name and records GraphQL errors', async () => {
    const logger = { warn: jest.fn() };
    let nowValue = 0;
    const plugin = createGraphQLTimingPlugin({
      logger,
      thresholdMs: 0,
      now: () => nowValue,
    });
    const requestContext = {
      contextValue: {},
      request: { http: { headers: new Map() } },
    } as unknown as GraphQLRequestContext<Record<string, unknown>>;
    if (!plugin.requestDidStart) {
      throw new Error('GraphQL timing plugin did not register');
    }
    const listener = await plugin.requestDidStart(requestContext);
    nowValue = 1;
    await listener?.willSendResponse?.({
      operationName: 'contains user@example.com',
      response: {
        http: { status: 200, headers: new Map() },
        body: {
          kind: 'single',
          singleResult: { errors: [{ message: 'failed' }], data: null },
        },
      },
    } as unknown as GraphQLRequestContextWillSendResponse<
      Record<string, unknown>
    >);

    const record = JSON.parse(logger.warn.mock.calls[0][0]) as Record<
      string,
      unknown
    >;
    expect(record).toMatchObject({
      operationName: 'invalid',
      outcome: 'error',
      requestId: 'unknown',
    });
    expect(logger.warn.mock.calls[0][0]).not.toContain('user@example.com');
  });
});
