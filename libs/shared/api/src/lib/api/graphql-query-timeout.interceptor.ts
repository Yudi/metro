import {
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';

export const DEFAULT_GRAPHQL_QUERY_TIMEOUT_MS = 30_000;

export const GRAPHQL_QUERY_TIMEOUT_MS = new InjectionToken<number>(
  'GRAPHQL_QUERY_TIMEOUT_MS',
  {
    providedIn: 'root',
    factory: () => DEFAULT_GRAPHQL_QUERY_TIMEOUT_MS,
  },
);

interface GraphqlRequestBody {
  query?: unknown;
}

/**
 * Bounds read-only GraphQL requests at Angular's HTTP backend.
 *
 * Angular's fetch backend aborts its AbortController when this deadline expires.
 * Mutations and subscriptions are intentionally excluded because aborting their
 * response does not prove that the server-side operation was rolled back.
 */
export const graphqlQueryTimeoutInterceptor: HttpInterceptorFn = (
  request,
  next,
) => {
  const timeoutMs = inject(GRAPHQL_QUERY_TIMEOUT_MS);

  if (
    request.timeout !== undefined ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    !isGraphqlQueryRequest(request)
  ) {
    return next(request);
  }

  return next(request.clone({ timeout: timeoutMs }));
};

function isGraphqlQueryRequest(request: HttpRequest<unknown>): boolean {
  if (request.method !== 'POST' || !isGraphqlEndpoint(request.url)) {
    return false;
  }

  if (
    request.body === null ||
    typeof request.body !== 'object' ||
    Array.isArray(request.body)
  ) {
    return false;
  }

  const query = (request.body as GraphqlRequestBody).query;
  if (typeof query !== 'string' || query.trim().length === 0) {
    return false;
  }

  // Conservatively skip any document containing a mutation/subscription token,
  // including multi-operation documents. False negatives are safer than applying
  // a read deadline to a write whose result could become ambiguous.
  return !/\b(?:mutation|subscription)\b/i.test(query);
}

function isGraphqlEndpoint(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0].replace(/\/+$/, '');
  return path.endsWith('/graphql');
}
