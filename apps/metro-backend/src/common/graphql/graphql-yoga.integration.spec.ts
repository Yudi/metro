import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Module,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Context,
  Field,
  GqlExecutionContext,
  GraphQLModule,
  Int,
  ObjectType,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { YogaDriver, type YogaDriverConfig } from '@graphql-yoga/nestjs';
import type { Server } from 'node:http';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createGraphQLYogaConfig } from './graphql-yoga.config';
import { LoadersService } from './loaders.service';

type FixtureGraphQLContext = {
  req: { headers: Record<string, string | string[] | undefined> };
  request: Request;
  requestId?: string | string[];
  loaders: { instanceId: number };
};

@ObjectType()
class FixtureRoute {
  @Field(() => Int)
  id!: number;

  @Field(() => String)
  name!: string;
}

@ObjectType()
class FixtureStop {
  @Field(() => String)
  name!: string;

  @Field(() => [FixtureRoute])
  routes!: FixtureRoute[];

  @Field(() => String, { nullable: true })
  details?: string;
}

@Injectable()
class FixtureAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const gqlContext = GqlExecutionContext.create(context).getContext<
      FixtureGraphQLContext
    >();
    if (gqlContext.req.headers.authorization !== 'Bearer integration-token') {
      throw new UnauthorizedException('Authentication required');
    }
    return true;
  }
}

@Injectable()
class FixtureForbiddenGuard implements CanActivate {
  canActivate(): boolean {
    throw new ForbiddenException('Permission denied');
  }
}

let holdRouteResolver = false;
let deferredRouteResolverStarted = false;
let deferredRouteResolverFinished = false;
let requestSignalAborted = false;
let routeResolverGate = Promise.resolve();
let releaseRouteResolver!: () => void;
let loaderInstanceId = 0;

function resetRouteResolver(hold: boolean): void {
  holdRouteResolver = hold;
  deferredRouteResolverStarted = false;
  deferredRouteResolverFinished = false;
  requestSignalAborted = false;
  routeResolverGate = Promise.resolve();
  releaseRouteResolver = () => undefined;

  if (hold) {
    routeResolverGate = new Promise<void>((resolve) => {
      releaseRouteResolver = resolve;
    });
  }
}

@Resolver(() => FixtureStop)
class FixtureResolver {
  @Query(() => String)
  ping(): string {
    return 'pong';
  }

  @Query(() => Int)
  loaderInstanceIdForRequest(@Context() context: FixtureGraphQLContext): number {
    return context.loaders.instanceId;
  }

  @Query(() => FixtureStop)
  stop(): FixtureStop {
    return { name: 'Central' } as FixtureStop;
  }

  @Query(() => [FixtureRoute])
  routeList(): FixtureRoute[] {
    return [1, 2, 3].map((id) => ({ id, name: '' }));
  }

  @Query(() => [String])
  async routeLabels(): Promise<string[]> {
    await Promise.resolve();
    return ['Linha 1', 'Linha 2', 'Linha 3'];
  }

  @Query(() => String)
  @UseGuards(FixtureAuthGuard)
  currentUser(@Context() context: FixtureGraphQLContext): string {
    return `${context.req.headers.authorization}:${context.requestId}`;
  }

  @Query(() => String)
  @UseGuards(FixtureForbiddenGuard)
  forbidden(): string {
    return 'unreachable';
  }

  @ResolveField(() => [FixtureRoute])
  async routes(
    @Context() context: FixtureGraphQLContext,
  ): Promise<FixtureRoute[]> {
    deferredRouteResolverStarted = true;
    context.request.signal.addEventListener(
      'abort',
      () => {
        requestSignalAborted = true;
      },
      { once: true },
    );
    if (holdRouteResolver) {
      await routeResolverGate;
    }
    deferredRouteResolverFinished = true;
    return [1, 3].map((id) => ({ id, name: '' }));
  }

  @ResolveField(() => String, { nullable: true })
  async details(): Promise<string> {
    await Promise.resolve();
    throw new Error('private provider response token=fixture-secret');
  }
}

@Resolver(() => FixtureRoute)
class FixtureRouteResolver {
  @ResolveField(() => String)
  async name(@Parent() route: FixtureRoute): Promise<string> {
    await Promise.resolve();
    if (route.id === 2) {
      throw new Error('private route provider response token=fixture-secret');
    }
    return `Linha ${route.id}`;
  }
}

@Module({
  imports: [
    GraphQLModule.forRoot<YogaDriverConfig>({
      driver: YogaDriver,
      ...createGraphQLYogaConfig(
        {
          createLoaders: () => ({ instanceId: ++loaderInstanceId }),
        } as unknown as LoadersService,
        true,
      ),
      autoSchemaFile: true,
      graphiql: false,
    }),
  ],
  providers: [
    FixtureResolver,
    FixtureRouteResolver,
    FixtureAuthGuard,
    FixtureForbiddenGuard,
  ],
})
class YogaIntegrationModule {}

type GraphQLPayload = {
  data?: Record<string, unknown> | null;
  errors?: { message: string; extensions?: Record<string, unknown> }[];
  incremental?: {
    data?: unknown;
    items?: unknown[] | null;
    path?: unknown[];
    errors?: { message: string; extensions?: Record<string, unknown> }[];
  }[];
  hasNext?: boolean;
};

const textEncoder = new TextEncoder();

function concatenate(
  left: Uint8Array<ArrayBufferLike>,
  right: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left);
  combined.set(right, left.length);
  return combined;
}

function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((byte, index) => haystack[start + index] === byte)) {
      return start;
    }
  }
  return -1;
}

class MultipartJsonReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array();
  private ended = false;

  constructor(response: Response) {
    if (!response.body) {
      throw new Error('Expected a multipart response body');
    }
    this.reader = response.body.getReader();
  }

  async readPart(): Promise<GraphQLPayload | null> {
    if (this.ended) {
      return null;
    }

    const delimiter = textEncoder.encode('\r\n---');
    await this.ensureLength(delimiter.length);
    if (findBytes(this.buffer, delimiter) !== 0) {
      throw new Error('Expected a Yoga multipart boundary');
    }
    this.buffer = this.buffer.slice(delimiter.length);
    await this.ensureLength(2);

    if (this.buffer[0] === 45 && this.buffer[1] === 45) {
      this.ended = true;
      return null;
    }
    if (this.buffer[0] === 13 && this.buffer[1] === 10) {
      this.buffer = this.buffer.slice(2);
    }

    const headerTerminator = textEncoder.encode('\r\n\r\n');
    let headerEnd = findBytes(this.buffer, headerTerminator);
    while (headerEnd === -1) {
      await this.readMore();
      headerEnd = findBytes(this.buffer, headerTerminator);
    }

    const headers = new TextDecoder().decode(this.buffer.slice(0, headerEnd));
    const contentLength = Number(/content-length:\s*(\d+)/i.exec(headers)?.[1]);
    if (!Number.isInteger(contentLength) || contentLength < 0) {
      throw new Error('Yoga multipart part omitted its Content-Length');
    }

    const bodyStart = headerEnd + headerTerminator.length;
    this.buffer = this.buffer.slice(bodyStart);
    await this.ensureLength(contentLength);
    const body = this.buffer.slice(0, contentLength);
    this.buffer = this.buffer.slice(contentLength);
    return JSON.parse(new TextDecoder().decode(body)) as GraphQLPayload;
  }

  async readAll(): Promise<GraphQLPayload[]> {
    const parts: GraphQLPayload[] = [];
    let part = await this.readPart();
    while (part) {
      parts.push(part);
      part = await this.readPart();
    }
    return parts;
  }

  private async ensureLength(length: number): Promise<void> {
    while (this.buffer.length < length) {
      await this.readMore();
    }
  }

  private async readMore(): Promise<void> {
    const chunk = await this.reader.read();
    if (chunk.done) {
      throw new Error('Multipart response ended before the next part');
    }
    this.buffer = concatenate(this.buffer, chunk.value);
  }
}

function incrementalErrors(
  payloads: GraphQLPayload[],
): { message: string; extensions?: Record<string, unknown> }[] {
  return payloads.flatMap((payload) => [
    ...(payload.errors ?? []),
    ...(payload.incremental ?? []).flatMap((part) => part.errors ?? []),
  ]);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Initial GraphQL payload timed out')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

describe('GraphQL Yoga NestJS integration', () => {
  let app: NestExpressApplication;
  let endpoint: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [YogaIntegrationModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as Server).address();
    if (!address || typeof address === 'string') {
      throw new Error('GraphQL test server did not bind an ephemeral port');
    }
    endpoint = `http://127.0.0.1:${address.port}/api/graphql`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => resetRouteResolver(false));

  async function executeJson(
    query: string,
    headers: Record<string, string> = {},
  ): Promise<{ response: Response; body: GraphQLPayload }> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/graphql-response+json, application/json',
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ query }),
    });
    return {
      response,
      body: (await response.json()) as GraphQLPayload,
    };
  }

  async function executeMultipart(
    query: string,
    signal?: AbortSignal,
  ): Promise<{ response: Response; parts: MultipartJsonReader }> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'multipart/mixed, application/graphql-response+json, application/json',
        'content-type': 'application/json',
        'x-request-id': 'yoga-integration-0001',
      },
      body: JSON.stringify({ query }),
      signal,
    });
    return { response, parts: new MultipartJsonReader(response) };
  }

  it('serves ordinary GraphQL requests as a single JSON response', async () => {
    const { response, body } = await executeJson('query Ping { ping }');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain(
      'application/graphql-response+json',
    );
    expect(body).toMatchObject({ data: { ping: 'pong' } });
  });

  it('creates a fresh dataloader context for each request', async () => {
    const first = await executeJson('query { loaderInstanceIdForRequest }');
    const second = await executeJson('query { loaderInstanceIdForRequest }');
    const firstId = first.body.data?.['loaderInstanceIdForRequest'];
    const secondId = second.body.data?.['loaderInstanceIdForRequest'];
    expect(typeof firstId).toBe('number');
    expect(secondId).toBe((firstId as number) + 1);
  });

  it('enforces production introspection and alias limits', async () => {
    const introspection = await executeJson(
      'query InspectSchema { __schema { queryType { name } } }',
    );
    expect(introspection.body.errors?.[0]?.message).toContain(
      'introspection',
    );

    const aliases = Array.from(
      { length: 51 },
      (_, index) => `result${index}: ping`,
    ).join('\n');
    const limitedOperation = await executeJson(
      `query TooManyAliases { ${aliases} }`,
    );
    expect(limitedOperation.body.errors?.[0]?.message).toContain(
      'maximum aliases 50',
    );
  });

  it('sends the fast stop fields before a deferred resolver finishes', async () => {
    resetRouteResolver(true);
    const { response, parts } = await executeMultipart(
      'query StopOverview { stop { name ... @defer(label: "routes") { routes { id name } } } }',
    );
    expect(response.headers.get('content-type')).toContain('multipart/mixed');

    let firstPayload: GraphQLPayload | null = null;
    try {
      firstPayload = await withTimeout(parts.readPart(), 1_000);
      expect(firstPayload?.data).toMatchObject({
        stop: { name: 'Central' },
      });
      expect(deferredRouteResolverStarted).toBe(true);
      expect(deferredRouteResolverFinished).toBe(false);

      releaseRouteResolver();
      const laterPayloads = await parts.readAll();
      expect(laterPayloads.some((payload) => payload.incremental?.length)).toBe(
        true,
      );
      expect(deferredRouteResolverFinished).toBe(true);
    } finally {
      releaseRouteResolver();
    }
  });

  it('streams a successful list through multipart JSON patches', async () => {
    const { response, parts } = await executeMultipart(
      'query StreamLabels { routeLabels @stream(initialCount: 1) }',
    );
    expect(response.headers.get('content-type')).toContain('multipart/mixed');
    const payloads = await parts.readAll();
    expect(payloads[0]?.data).toMatchObject({ routeLabels: ['Linha 1'] });
    expect(
      payloads.some((payload) =>
        payload.incremental?.some((part) => part.items?.length),
      ),
    ).toBe(true);
    expect(incrementalErrors(payloads)).toEqual([]);
  });

  it('masks a private error in a deferred async resolver', async () => {
    const { response, parts } = await executeMultipart(
      'query StopDetails { stop { name ... @defer(label: "details") { details } } }',
    );
    expect(response.headers.get('content-type')).toContain('multipart/mixed');
    const payloads = await parts.readAll();
    const errors = incrementalErrors(payloads);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe('Unexpected error.');
    expect(errors[0]?.extensions?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(payloads)).not.toContain('fixture-secret');
  });

  it('masks errors inside a streamed non-null list item', async () => {
    const { response, parts } = await executeMultipart(
      'query StreamRoutes { routeList @stream(initialCount: 1) { id name } }',
    );
    expect(response.headers.get('content-type')).toContain('multipart/mixed');
    const payloads = await parts.readAll();
    const patches = payloads.flatMap((payload) => payload.incremental ?? []);
    expect(patches.some((part) => part.items === null)).toBe(true);
    expect(incrementalErrors(payloads).some(
      (error) => error.message === 'Unexpected error.',
    )).toBe(true);
    expect(JSON.stringify(payloads)).not.toContain('fixture-secret');
  });

  it('preserves Nest authorization errors and request context', async () => {
    const unauthorized = await executeJson('query { currentUser }');
    expect(unauthorized.body.errors?.[0]).toMatchObject({
      message: 'Authentication required',
      extensions: { code: 'UNAUTHENTICATED' },
    });

    const forbidden = await executeJson('query { forbidden }');
    expect(forbidden.body.errors?.[0]).toMatchObject({
      message: 'Permission denied',
      extensions: { code: 'FORBIDDEN' },
    });

    const authenticated = await executeJson('query { currentUser }', {
      authorization: 'Bearer integration-token',
      'x-request-id': 'context-check-001',
    });
    expect(authenticated.body).toMatchObject({
      data: { currentUser: 'Bearer integration-token:context-check-001' },
    });
  });

  it('propagates client cancellation to the GraphQL request signal', async () => {
    resetRouteResolver(true);
    const controller = new AbortController();
    try {
      const { response, parts } = await executeMultipart(
        'query StopOverview { stop { name ... @defer(label: "routes") { routes { id name } } } }',
        controller.signal,
      );
      expect(response.headers.get('content-type')).toContain('multipart/mixed');
      await parts.readPart();
      controller.abort();

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(requestSignalAborted).toBe(true);
    } finally {
      releaseRouteResolver();
    }
  });
});
