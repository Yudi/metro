import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  GRAPHQL_QUERY_TIMEOUT_MS,
  graphqlQueryTimeoutInterceptor,
} from './graphql-query-timeout.interceptor';

describe('graphqlQueryTimeoutInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([graphqlQueryTimeoutInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: GRAPHQL_QUERY_TIMEOUT_MS, useValue: 12_345 },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('sets a backend deadline for named and shorthand GraphQL queries', () => {
    http
      .post('/api/graphql', { query: 'query Probe { __typename }' })
      .subscribe();
    const named = httpTesting.expectOne('/api/graphql');
    expect(named.request.timeout).toBe(12_345);
    named.flush({ data: { __typename: 'Query' } });

    http
      .post('https://metro.example/api/graphql?source=test', {
        query: '{ __typename }',
      })
      .subscribe();
    const shorthand = httpTesting.expectOne(
      'https://metro.example/api/graphql?source=test',
    );
    expect(shorthand.request.timeout).toBe(12_345);
    shorthand.flush({ data: { __typename: 'Query' } });
  });

  it('does not apply the query deadline to mutations or subscriptions', () => {
    http
      .post('/api/graphql', {
        query: '# write\nmutation UpdateFavorite { updateFavorite }',
      })
      .subscribe();
    const mutation = httpTesting.expectOne('/api/graphql');
    expect(mutation.request.timeout).toBeUndefined();
    mutation.flush({ data: { updateFavorite: true } });

    http
      .post('/api/graphql', {
        query: 'subscription StatusChanged { statusChanged }',
      })
      .subscribe();
    const subscription = httpTesting.expectOne('/api/graphql');
    expect(subscription.request.timeout).toBeUndefined();
    subscription.flush({ data: { statusChanged: true } });
  });

  it('preserves an explicit timeout and ignores non-GraphQL requests', () => {
    http
      .post(
        '/api/graphql',
        { query: 'query LongReport { longReport }' },
        { timeout: 90_000 },
      )
      .subscribe();
    const overridden = httpTesting.expectOne('/api/graphql');
    expect(overridden.request.timeout).toBe(90_000);
    overridden.flush({ data: { longReport: null } });

    http.get('/api/health/ready').subscribe();
    const health = httpTesting.expectOne('/api/health/ready');
    expect(health.request.timeout).toBeUndefined();
    health.flush({ status: 'ok' });
  });

  it('conservatively skips batched and mixed-operation documents', () => {
    http
      .post('/api/graphql', [
        { query: 'query First { first }' },
        { query: 'query Second { second }' },
      ])
      .subscribe();
    const batched = httpTesting.expectOne('/api/graphql');
    expect(batched.request.timeout).toBeUndefined();
    batched.flush([{ data: { first: true } }, { data: { second: true } }]);

    http
      .post('/api/graphql', {
        query:
          'query Read { read } mutation Write { write }',
        operationName: 'Read',
      })
      .subscribe();
    const mixed = httpTesting.expectOne('/api/graphql');
    expect(mixed.request.timeout).toBeUndefined();
    mixed.flush({ data: { read: true } });
  });
});

describe('graphqlQueryTimeoutInterceptor with FetchBackend', () => {
  it('aborts the underlying fetch when the query deadline expires', async () => {
    jest.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;

        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener('abort', () => {
            reject(requestSignal?.reason);
          });
        });
      },
    );
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    try {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(
            withFetch(),
            withInterceptors([graphqlQueryTimeoutInterceptor]),
          ),
          { provide: GRAPHQL_QUERY_TIMEOUT_MS, useValue: 25 },
        ],
      });
      const http = TestBed.inject(HttpClient);
      const errors: unknown[] = [];

      http
        .post('/api/graphql', { query: 'query Probe { __typename }' })
        .subscribe({ error: (error: unknown) => errors.push(error) });

      expect(requestSignal?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(25);

      expect(requestSignal?.aborted).toBe(true);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(HttpErrorResponse);
    } finally {
      if (originalFetch) {
        Object.defineProperty(globalThis, 'fetch', {
          configurable: true,
          writable: true,
          value: originalFetch,
        });
      } else {
        Reflect.deleteProperty(globalThis, 'fetch');
      }
      jest.useRealTimers();
    }
  });
});

describe('graphqlQueryTimeoutInterceptor configuration', () => {
  it('ignores a fractional timeout that Angular would reject', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([graphqlQueryTimeoutInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: GRAPHQL_QUERY_TIMEOUT_MS, useValue: 12.5 },
      ],
    });
    const http = TestBed.inject(HttpClient);
    const httpTesting = TestBed.inject(HttpTestingController);

    http
      .post('/api/graphql', { query: 'query Probe { __typename }' })
      .subscribe();
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.timeout).toBeUndefined();
    request.flush({ data: { __typename: 'Query' } });
    httpTesting.verify();
  });
});
