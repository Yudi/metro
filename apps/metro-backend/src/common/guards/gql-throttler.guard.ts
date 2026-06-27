import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GqlExecutionContext } from '@nestjs/graphql';

/**
 * Custom ThrottlerGuard that works with both REST and GraphQL contexts.
 * For GraphQL requests, it extracts req/res from the GQL context.
 * For REST requests, it falls back to the default behavior.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    const contextType = context.getType<'http' | 'ws' | 'graphql'>();

    if (contextType === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const ctx = gqlCtx.getContext();
      return { req: ctx.req, res: ctx.res };
    }

    // For HTTP context, use default behavior
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}
