import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { AuthService } from '../../user/auth.service';

type AuthenticatedRequest = Request & { userId?: string };

type AuthGraphQLContext = {
  req: AuthenticatedRequest;
  res: Response;
  userId?: string;
};

/**
 * Guard that protects routes/resolvers by requiring a valid Firebase auth token.
 *
 * For GraphQL requests it reads `Authorization` from the HTTP headers and
 * attaches `userId` to the GraphQL context so resolvers can access it.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const contextType = context.getType<'http' | 'ws' | 'graphql'>();
    const { token, ctx } = this.extractToken(context, contextType);

    if (!token) {
      throw new UnauthorizedException();
    }

    const userId = await this.authService.verifyToken(token);

    if (!userId) {
      throw new UnauthorizedException();
    }

    // Store the userId (token in our current design) on the request/context
    // so resolvers/controllers can easily access it.
    if (ctx) {
      if ('req' in ctx && ctx.req) {
        ctx.req.userId = userId;
        ctx.userId = userId;
      } else {
        ctx.userId = userId;
      }
    }

    return true;
  }

  private extractToken(
    context: ExecutionContext,
    contextType: string,
  ): { token?: string; ctx?: AuthGraphQLContext | AuthenticatedRequest } {
    if (contextType === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const ctx = gqlCtx.getContext() as AuthGraphQLContext;
      const authHeader = ctx.req?.headers?.authorization as string | undefined;
      const token = authHeader?.replace('Bearer ', '');
      return { token, ctx };
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = req?.headers?.authorization as string | undefined;
    const token = authHeader?.replace('Bearer ', '');
    return { token, ctx: req };
  }
}
