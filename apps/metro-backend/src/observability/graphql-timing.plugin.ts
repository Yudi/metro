import { getOperationAST, type ExecutionResult } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import {
  createTimingLogger,
  elapsedMilliseconds,
  getSlowRequestThresholdMs,
  safeOperationName,
  safeRequestId,
  TimingOptions,
} from './timing.util';

type IncrementalResult = ExecutionResult & {
  incremental?: readonly { errors?: readonly unknown[] }[];
};

type GraphQLTimingState = {
  startedAt: number;
  operationName: string;
  requestId: string;
  hasErrors: boolean;
  logged: boolean;
};

function isAsyncIterable(
  value: unknown,
): value is AsyncIterable<ExecutionResult> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  );
}

function resultHasErrors(result: ExecutionResult): boolean {
  const incrementalResult = result as IncrementalResult;
  return (
    (result.errors?.length ?? 0) > 0 ||
    (incrementalResult.incremental?.some(
      (part) => (part.errors?.length ?? 0) > 0,
    ) ??
      false)
  );
}

async function* trackIncrementalResults(
  results: AsyncIterable<ExecutionResult>,
  state: GraphQLTimingState,
): AsyncIterable<ExecutionResult> {
  try {
    for await (const result of results) {
      state.hasErrors ||= resultHasErrors(result);
      yield result;
    }
  } catch (error) {
    state.hasErrors = true;
    throw error;
  }
}

/**
 * Logs slow operations after their response body has finished, including every
 * incremental payload. Wrapping the body also forwards cancellation to Yoga's
 * underlying result stream when the HTTP client disconnects.
 */
export function createGraphQLTimingPlugin(options: TimingOptions = {}): Plugin {
  const logger = options.logger ?? createTimingLogger('GraphQLTiming');
  const thresholdMs = options.thresholdMs ?? getSlowRequestThresholdMs();
  const now =
    options.now ??
    (() => {
      const [seconds, nanoseconds] = process.hrtime();
      return seconds * 1_000 + nanoseconds / 1_000_000;
    });
  const requests = new WeakMap<Request, GraphQLTimingState>();

  function finish(
    state: GraphQLTimingState,
    status: number,
    outcome?: 'cancelled',
  ): void {
    if (state.logged) {
      return;
    }
    state.logged = true;

    const durationMs = elapsedMilliseconds(state.startedAt, now);
    if (durationMs < thresholdMs) {
      return;
    }

    logger.warn(
      JSON.stringify({
        event: 'slow_graphql_operation',
        operationName: safeOperationName(state.operationName, 'unknown'),
        status,
        outcome: outcome ?? (state.hasErrors ? 'error' : 'ok'),
        requestId: state.requestId,
        durationMs: Math.round(durationMs * 100) / 100,
      }),
    );
  }

  return {
    onRequest({ request }) {
      requests.set(request, {
        startedAt: now(),
        operationName: 'unknown',
        requestId: safeRequestId(request.headers.get('x-request-id')),
        hasErrors: false,
        logged: false,
      });
    },
    onParams({ request, params }) {
      const state = requests.get(request);
      if (state) {
        state.operationName = params.operationName ?? 'unknown';
      }
    },
    onExecute({ args }) {
      const context = args.contextValue as { request?: Request };
      const state = context.request ? requests.get(context.request) : undefined;
      if (state) {
        state.operationName =
          getOperationAST(args.document, args.operationName)?.name?.value ??
          state.operationName;
      }
    },
    onExecutionResult({ request, result, setResult }) {
      const state = requests.get(request);
      if (!state || !result) {
        return;
      }

      if (isAsyncIterable(result)) {
        setResult(trackIncrementalResults(result, state));
        return;
      }

      state.hasErrors ||= resultHasErrors(result as ExecutionResult);
    },
    onResponse({ request, response, setResponse, fetchAPI }) {
      const state = requests.get(request);
      if (!state) {
        return;
      }

      if (response.status >= 400) {
        state.hasErrors = true;
      }
      if (!response.body) {
        finish(state, response.status);
        return;
      }

      const reader = response.body.getReader();
      const monitoredBody = new fetchAPI.ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const chunk = await reader.read();
            if (chunk.done) {
              finish(state, response.status);
              controller.close();
              return;
            }
            controller.enqueue(chunk.value);
          } catch (error) {
            state.hasErrors = true;
            finish(state, response.status);
            controller.error(error);
          }
        },
        async cancel(reason) {
          try {
            await reader.cancel(reason);
          } finally {
            finish(state, response.status, 'cancelled');
          }
        },
      });

      setResponse(
        new fetchAPI.Response(monitoredBody, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        }),
      );
    },
  };
}
