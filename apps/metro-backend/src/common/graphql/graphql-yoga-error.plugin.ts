import { HttpException } from '@nestjs/common';
import { GraphQLError, type ExecutionResult } from 'graphql';
import { maskError, type Plugin } from 'graphql-yoga';

type IncrementalPayload = {
  errors?: readonly unknown[];
  [key: string]: unknown;
};

type IncrementalExecutionResult = ExecutionResult & {
  incremental?: readonly IncrementalPayload[];
  stringify?: (result: ExecutionResult) => string;
};

type SanitizedExecutionResult = ExecutionResult & {
  incremental?: readonly (Omit<IncrementalPayload, 'errors'> & {
    errors?: readonly GraphQLError[];
  })[];
  stringify?: (result: ExecutionResult) => string;
};

const NEST_HTTP_ERROR_CODES = new Map<number, string>([
  [400, 'BAD_REQUEST'],
  [422, 'BAD_USER_INPUT'],
  [401, 'UNAUTHENTICATED'],
  [403, 'FORBIDDEN'],
]);

/**
 * Keep Nest's intentional client errors compatible with the former Apollo
 * driver while masking unexpected resolver failures in every incremental part.
 */
export function maskGraphQLError(
  error: unknown,
  message = 'Unexpected error.',
): GraphQLError {
  const graphQLError = error instanceof GraphQLError ? error : undefined;
  const originalError = graphQLError?.originalError ?? error;

  if (originalError instanceof HttpException) {
    const status = originalError.getStatus();
    if (status >= 400 && status < 500) {
      const code = NEST_HTTP_ERROR_CODES.get(status);
      return new GraphQLError(originalError.message, {
        nodes: graphQLError?.nodes,
        source: graphQLError?.source,
        positions: graphQLError?.positions,
        path: graphQLError?.path,
        extensions: code ? { code } : { code: 'INTERNAL_SERVER_ERROR', status },
      });
    }
  }

  // Do not include original resolver errors in development extensions; backend
  // provider failures can contain private request and response details.
  const maskedError = maskError(error, message, false);
  return maskedError instanceof GraphQLError
    ? maskedError
    : new GraphQLError(maskedError.message);
}

function hasAsyncIterator(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  );
}

function sanitizeResult(result: ExecutionResult): SanitizedExecutionResult {
  const incrementalResult = result as IncrementalExecutionResult;
  const { errors, incremental, ...resultFields } = incrementalResult;
  const sanitized: SanitizedExecutionResult = { ...resultFields };

  if (errors?.length) {
    sanitized.errors = errors.map((error) => maskGraphQLError(error));
  }

  if (incremental?.length) {
    sanitized.incremental = incremental.map((part) => {
      const { errors: partErrors, ...partFields } = part;
      return {
        ...partFields,
        ...(partErrors?.length
          ? { errors: partErrors.map((error) => maskGraphQLError(error)) }
          : {}),
      };
    });
  }

  return sanitized;
}

async function* sanitizeResultStream(
  results: AsyncIterable<ExecutionResult>,
): AsyncIterable<ExecutionResult> {
  for await (const result of results) {
    yield sanitizeResult(result);
  }
}

export function createGraphQLYogaErrorPlugin(): Plugin {
  return {
    onExecutionResult({ result, setResult }) {
      if (!result) {
        return;
      }

      if (hasAsyncIterator(result)) {
        setResult(
          sanitizeResultStream(result as AsyncIterable<ExecutionResult>),
        );
        return;
      }

      setResult(sanitizeResult(result));
    },
  };
}
