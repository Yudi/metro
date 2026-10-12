import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request, Response } from 'express';
import { AdminAccessService } from './admin-access.service';

type AuthenticatedRequest = Request & { userId?: string };

type GraphQLContext = {
  req: AuthenticatedRequest;
  res?: Response;
  userId?: string;
};

type GuardContext = {
  request: AuthenticatedRequest;
  response?: Response;
  graphQLContext?: GraphQLContext;
};

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly adminAccessService: AdminAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const guardContext = this.getGuardContext(context);
    guardContext.response?.setHeader('Cache-Control', 'no-store');
    guardContext.response?.setHeader('Pragma', 'no-cache');

    const token = getBearerToken(guardContext.request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('A Firebase bearer token is required');
    }

    const decoded = await this.adminAccessService.verifyIdToken(token);
    const bootstrapUid = this.adminAccessService.configuredBootstrapUid;
    if (decoded.uid === bootstrapUid) {
      await this.adminAccessService.synchronizeBootstrapAdmin(decoded.uid);
    }

    const user = await this.adminAccessService.getUser(decoded.uid);
    if (!user) {
      throw new UnauthorizedException('A valid Firebase user is required');
    }
    if (user.disabled) {
      throw new ForbiddenException('This account is disabled');
    }
    if (
      decoded['admin'] !== true ||
      user.customClaims?.['admin'] !== true
    ) {
      throw new ForbiddenException('Administrator access is required');
    }

    guardContext.request.userId = decoded.uid;
    if (guardContext.graphQLContext) {
      guardContext.graphQLContext.userId = decoded.uid;
    }
    return true;
  }

  private getGuardContext(context: ExecutionContext): GuardContext {
    if (context.getType<'http' | 'graphql'>() === 'graphql') {
      const graphQLContext = GqlExecutionContext.create(context).getContext<
        GraphQLContext
      >();
      return {
        request: graphQLContext.req,
        response: graphQLContext.res,
        graphQLContext,
      };
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return { request, response: request.res };
  }
}

function getBearerToken(
  authorization: string | string[] | undefined,
): string | null {
  if (typeof authorization !== 'string') {
    return null;
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  return match?.[1] ?? null;
}
