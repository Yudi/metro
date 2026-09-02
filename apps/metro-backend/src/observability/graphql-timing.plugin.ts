import type {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestContextWillSendResponse,
} from '@apollo/server';
import {
  createTimingLogger,
  elapsedMilliseconds,
  getSlowRequestThresholdMs,
  safeOperationName,
  safeRequestId,
  TimingOptions,
} from './timing.util';

type GraphQLTimingContext = Record<string, unknown>;

export function createGraphQLTimingPlugin(
  options: TimingOptions = {},
): ApolloServerPlugin<GraphQLTimingContext> {
  const logger = options.logger ?? createTimingLogger('GraphQLTiming');
  const thresholdMs = options.thresholdMs ?? getSlowRequestThresholdMs();
  const now = options.now ?? (() => {
    const [seconds, nanoseconds] = process.hrtime();
    return seconds * 1_000 + nanoseconds / 1_000_000;
  });

  return {
    async requestDidStart(
      requestContext: GraphQLRequestContext<GraphQLTimingContext>,
    ) {
      const startedAt = now();
      const contextRequestId = safeRequestId(
        requestContext.contextValue.requestId,
      );
      const requestHeaderId = safeRequestId(
        requestContext.request.http?.headers.get('x-request-id'),
      );
      const requestId =
        contextRequestId === 'unknown' ? requestHeaderId : contextRequestId;

      return {
        async willSendResponse(
          responseContext: GraphQLRequestContextWillSendResponse<GraphQLTimingContext>,
        ): Promise<void> {
          const durationMs = elapsedMilliseconds(startedAt, now);
          if (durationMs < thresholdMs) {
            return;
          }

          const hasErrors =
            responseContext.errors !== undefined &&
            responseContext.errors.length > 0;
          const body = responseContext.response.body;
          const hasSingleResultErrors =
            body.kind === 'single' &&
            body.singleResult.errors !== undefined &&
            body.singleResult.errors.length > 0;

          logger.warn(
            JSON.stringify({
              event: 'slow_graphql_operation',
              operationName: safeOperationName(
                responseContext.operationName,
                'unknown',
              ),
              status: responseContext.response.http.status ?? 200,
              outcome: hasErrors || hasSingleResultErrors ? 'error' : 'ok',
              requestId,
              durationMs: Math.round(durationMs * 100) / 100,
            }),
          );
        },
      };
    },
  };
}
