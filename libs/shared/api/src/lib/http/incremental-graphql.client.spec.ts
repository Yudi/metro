import {
  HttpEventType,
  HttpHeaderResponse,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { IncrementalGraphqlClient } from './incremental-graphql.client';
import { IncrementalGraphqlResult } from './graphql-incremental-response';
import { API_BASE_URL } from './api.tokens';
import { graphqlQueryTimeoutInterceptor } from './graphql-query-timeout.interceptor';
import { TextDecoder, TextEncoder } from 'node:util';

const boundary = 'graphql-test';
const part = (value: unknown) =>
  `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${JSON.stringify(value)}\r\n`;
const closing = `--${boundary}--\r\n`;
type StopData = {
  stopFullData: { stop: { name: string }; routes?: { id: string }[] };
};

describe('IncrementalGraphqlClient', () => {
  let client: IncrementalGraphqlClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([graphqlQueryTimeoutInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    client = TestBed.inject(IncrementalGraphqlClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('emits the stop before the next MIME boundary, then immutably merges deferred routes', () => {
    const snapshots: IncrementalGraphqlResult<StopData>[] = [];
    const completed = jest.fn();
    client
      .query<StopData>(
        'query Stop { stopFullData { stop { name } ... @defer { routes { id } } } }',
      )
      .subscribe({
        next: (result) => snapshots.push(result),
        complete: completed,
      });
    const request = http.expectOne('/api/graphql');
    expect(request.request.timeout).toBe(30_000);
    expect(request.request.responseType).toBe('text');
    expect(request.request.reportProgress).toBe(true);
    expect(request.request.transferCache).toBe(false);
    request.event(
      new HttpHeaderResponse({
        headers: request.request.headers.set(
          'Content-Type',
          `multipart/mixed; boundary="${boundary}"`,
        ),
      }),
    );
    const initial = part({
      data: { stopFullData: { stop: { name: 'Sé' } } },
      hasNext: true,
    });
    request.event({
      type: HttpEventType.DownloadProgress,
      loaded: initial.length,
      partialText: initial,
    });
    expect(snapshots).toEqual([
      { data: { stopFullData: { stop: { name: 'Sé' } } }, hasNext: true },
    ]);
    expect(completed).not.toHaveBeenCalled();

    const body =
      initial +
      part({
        incremental: [
          { path: ['stopFullData'], data: { routes: [{ id: '1' }] } },
        ],
        hasNext: false,
      }) +
      closing;
    request.event({
      type: HttpEventType.DownloadProgress,
      loaded: body.length,
      partialText: body,
    });
    request.flush(body, {
      headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` },
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].data?.stopFullData.routes).toBeUndefined();
    expect(snapshots[1].data?.stopFullData.routes).toEqual([{ id: '1' }]);
    expect(snapshots[1].hasNext).toBe(false);
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('handles normal JSON and preserves GraphQL error results', () => {
    const next = jest.fn();
    client.query('query Test { stop }').subscribe(next);
    http
      .expectOne('/api/graphql')
      .flush(
        JSON.stringify({
          data: { stop: null },
          errors: [{ message: 'Unavailable' }],
        }),
        {
          headers: { 'Content-Type': 'application/graphql-response+json' },
        },
      );
    expect(next).toHaveBeenCalledWith({
      data: { stop: null },
      errors: [{ message: 'Unavailable' }],
      hasNext: false,
    });
  });

  it('uses isolated parser state for each subscription and cancels the HTTP request', () => {
    const query = client.query('query Test { stop }');
    const first = query.subscribe();
    const second = query.subscribe();
    const requests = http.match('/api/graphql');
    expect(requests).toHaveLength(2);
    first.unsubscribe();
    expect(requests[0].cancelled).toBe(true);
    expect(requests[1].cancelled).toBe(false);
    second.unsubscribe();
    expect(requests[1].cancelled).toBe(true);
  });

  it('rejects a truncated stream after preserving its initial emission', () => {
    const next = jest.fn();
    const error = jest.fn();
    client.query('query Test { stop }').subscribe({ next, error });
    const body = part({ data: { stop: 'Sé' }, hasNext: true });
    http
      .expectOne('/api/graphql')
      .flush(body, {
        headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` },
      });
    expect(next).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Incomplete GraphQL multipart response',
      }),
    );
  });

  it('rejects a MIME-complete response whose GraphQL operation never completed', () => {
    const error = jest.fn();
    client.query('query Test { stop }').subscribe({ error });
    http
      .expectOne('/api/graphql')
      .flush(part({ data: { stop: 'Sé' }, hasNext: true }) + closing, {
        headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` },
      });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Incomplete GraphQL response' }),
    );
  });

  it('aborts an in-flight request when an invalid patch arrives', () => {
    const error = jest.fn();
    client.query('query Test { stop }').subscribe({ error });
    const request = http.expectOne('/api/graphql');
    request.event(
      new HttpHeaderResponse({
        headers: request.request.headers.set(
          'Content-Type',
          `multipart/mixed; boundary=${boundary}`,
        ),
      }),
    );
    const body =
      part({ data: { stop: {} }, hasNext: true }) +
      part({
        incremental: [{ path: ['missing'], data: {} }],
        hasNext: false,
      });
    request.event({
      type: HttpEventType.DownloadProgress,
      loaded: body.length,
      partialText: body,
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(request.cancelled).toBe(true);
  });
});

describe('IncrementalGraphqlClient with Yoga and Angular FetchBackend', () => {
  it.each(['defer', 'stream'] as const)(
    'delivers an initial @%s result while later work is blocked',
    async (directive) => {
      const originals = {
        fetch: globalThis.fetch,
        Headers: globalThis.Headers,
        TextDecoder: globalThis.TextDecoder,
        TextEncoder: globalThis.TextEncoder,
      };
      Object.assign(globalThis, { TextDecoder, TextEncoder });
      const { createSchema, createYoga } = await import('graphql-yoga');
      const { useDeferStream } = await import(
        '@graphql-yoga/plugin-defer-stream'
      );
      let releaseRoutes!: (value: string[]) => void;
      const routes = new Promise<string[]>((resolve) => {
        releaseRoutes = resolve;
      });
      const yoga = createYoga({
        logging: false,
        plugins: [useDeferStream()],
        schema: createSchema({
          typeDefs:
            'type Query { stop: Stop! } type Stop { name: String! routes: [String!]! }',
          resolvers: {
            Query: { stop: () => ({ name: 'Sé' }) },
            Stop: {
              routes:
                directive === 'defer'
                  ? () => routes
                  : async function* () {
                      yield 'Linha 1';
                      await routes;
                      yield 'Linha 2';
                    },
            },
          },
        }),
      });
      Object.assign(globalThis, { Headers: yoga.fetchAPI.Headers });
      const signals: AbortSignal[] = [];
      const fetch = jest.fn(async (url: string, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        return yoga.fetch(new yoga.fetchAPI.Request(url, init));
      });
      Object.assign(globalThis, { fetch });
      try {
        TestBed.configureTestingModule({
          providers: [
            provideHttpClient(withFetch()),
            { provide: API_BASE_URL, useValue: 'http://localhost' },
          ],
        });
        const client = TestBed.inject(IncrementalGraphqlClient);
        const snapshots: IncrementalGraphqlResult<{
          stop: { name: string; routes?: string[] };
        }>[] = [];
        let resolveInitial!: () => void;
        const initial = new Promise<void>((resolve) => {
          resolveInitial = resolve;
        });
        const completion = new Promise<void>((resolve, reject) => {
          const query =
            directive === 'defer'
              ? 'query { stop { name ... @defer { routes } } }'
              : 'query { stop { name routes @stream(initialCount: 1) } }';
          client
            .query<{ stop: { name: string; routes?: string[] } }>(query)
            .subscribe({
              next: (result) => {
                snapshots.push(result);
                resolveInitial();
              },
              error: reject,
              complete: resolve,
            });
        });
        await Promise.race([initial, completion]);
        expect(snapshots).toEqual([
          {
            data: {
              stop: {
                name: 'Sé',
                ...(directive === 'stream' ? { routes: ['Linha 1'] } : {}),
              },
            },
            hasNext: true,
          },
        ]);
        releaseRoutes(['Linha 1', 'Linha 2']);
        await completion;
        expect(snapshots[snapshots.length - 1]).toEqual({
          data: { stop: { name: 'Sé', routes: ['Linha 1', 'Linha 2'] } },
          hasNext: false,
        });
        expect(signals).toHaveLength(1);
        expect(signals[0].aborted).toBe(false);
      } finally {
        releaseRoutes([]);
        Object.assign(globalThis, originals);
      }
    },
  );
});
