import { GraphQLError, parse, type ExecutionResult } from 'graphql';
import { createGraphQLTimingPlugin } from './graphql-timing.plugin';

describe('GraphQL timing plugin', () => {
  it('waits for the response stream to finish before logging', async () => {
    const logger = { warn: jest.fn() };
    let nowValue = 0;
    const plugin = createGraphQLTimingPlugin({
      logger,
      thresholdMs: 10,
      now: () => nowValue,
    });
    const request = new Request('http://localhost/api/graphql', {
      method: 'POST',
      headers: { 'x-request-id': 'request-1234' },
    });
    const requestHook = plugin.onRequest;
    const paramsHook = plugin.onParams;
    const executeHook = plugin.onExecute;
    const resultHook = plugin.onExecutionResult;
    const responseHook = plugin.onResponse;
    if (
      !requestHook ||
      !paramsHook ||
      !executeHook ||
      !resultHook ||
      !responseHook
    ) {
      throw new Error('GraphQL timing plugin did not register all hooks');
    }

    await requestHook({ request } as Parameters<typeof requestHook>[0]);
    await paramsHook({
      request,
      params: { operationName: undefined },
    } as Parameters<typeof paramsHook>[0]);
    await executeHook({
      args: {
        document: parse('query Search { ping }'),
        operationName: undefined,
        contextValue: { request },
      },
    } as unknown as Parameters<typeof executeHook>[0]);
    await resultHook({
      request,
      result: { data: { search: [] } },
      setResult: jest.fn(),
      context: { request, params: {} },
    } as unknown as Parameters<typeof resultHook>[0]);

    let releaseResponse!: () => void;
    const responseBody = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('{"data":{'));
          void responseBody.then(() => {
            controller.enqueue(encoder.encode('"search":[]}}'));
            controller.close();
          });
        },
      }),
      { status: 200 },
    );
    let monitoredResponse = response;
    await responseHook({
      request,
      response,
      setResponse: (newResponse) => {
        monitoredResponse = newResponse;
      },
      fetchAPI: { ReadableStream, Response } as Parameters<
        typeof responseHook
      >[0]['fetchAPI'],
    } as Parameters<typeof responseHook>[0]);

    nowValue = 20;
    const body = monitoredResponse.text();
    await Promise.resolve();
    expect(logger.warn).not.toHaveBeenCalled();

    releaseResponse();
    expect(await body).toBe('{"data":{"search":[]}}');

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

  it('logs errors from later incremental results at stream completion', async () => {
    const logger = { warn: jest.fn() };
    let nowValue = 0;
    const plugin = createGraphQLTimingPlugin({
      logger,
      thresholdMs: 0,
      now: () => nowValue,
    });
    const request = new Request('http://localhost/api/graphql', {
      method: 'POST',
      headers: { 'x-request-id': 'request-5678' },
    });
    const requestHook = plugin.onRequest;
    const paramsHook = plugin.onParams;
    const resultHook = plugin.onExecutionResult;
    const responseHook = plugin.onResponse;
    if (!requestHook || !paramsHook || !resultHook || !responseHook) {
      throw new Error('GraphQL timing plugin did not register all hooks');
    }

    await requestHook({ request } as Parameters<typeof requestHook>[0]);
    await paramsHook({
      request,
      params: { operationName: 'DeferredStop' },
    } as Parameters<typeof paramsHook>[0]);

    async function* results(): AsyncIterable<ExecutionResult> {
      yield { data: { stop: { name: 'Central' } } };
      nowValue = 25;
      yield {
        incremental: [
          {
            errors: [new GraphQLError('Forbidden')],
          },
        ],
        hasNext: false,
      } as unknown as ExecutionResult;
    }

    let trackedResult: unknown;
    await resultHook({
      request,
      result: results(),
      setResult: (result: unknown) => {
        trackedResult = result;
      },
      context: { request, params: {} },
    } as unknown as Parameters<typeof resultHook>[0]);

    const response = new Response('incremental response', { status: 200 });
    let monitoredResponse = response;
    await responseHook({
      request,
      response,
      setResponse: (newResponse) => {
        monitoredResponse = newResponse;
      },
      fetchAPI: { ReadableStream, Response } as Parameters<
        typeof responseHook
      >[0]['fetchAPI'],
    } as Parameters<typeof responseHook>[0]);

    if (
      !trackedResult ||
      typeof trackedResult !== 'object' ||
      !(Symbol.asyncIterator in trackedResult)
    ) {
      throw new Error('Incremental result was not preserved as a stream');
    }
    let resultCount = 0;
    for await (const result of trackedResult as AsyncIterable<ExecutionResult>) {
      expect(result).toBeDefined();
      resultCount += 1;
    }
    expect(resultCount).toBe(2);
    await monitoredResponse.text();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const record = JSON.parse(logger.warn.mock.calls[0][0]) as Record<
      string,
      unknown
    >;
    expect(record).toMatchObject({
      event: 'slow_graphql_operation',
      operationName: 'DeferredStop',
      status: 200,
      outcome: 'error',
      requestId: 'request-5678',
      durationMs: 25,
    });
  });
});
