import { Injectable, CanActivate, ForbiddenException } from '@nestjs/common';

@Injectable()
export class DevelopmentOnlyGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'This endpoint is only available in development mode'
      );
    }

    return true;
  }
}
