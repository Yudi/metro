import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Request } from 'express';

type AuthenticatedRequest = Request & { userId?: string };

type AuthGraphQLContext = {
  req: AuthenticatedRequest;
  userId?: string;
};

/**
 * Returns the authenticated user id (token) that was attached by AuthGuard.
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null => {
    const contextType = context.getType<'http' | 'ws' | 'graphql'>();

    if (contextType === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const ctx = gqlCtx.getContext() as AuthGraphQLContext;
      return ctx.userId ?? ctx.req.userId ?? null;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.userId ?? null;
  },
);
