import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { auth } from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyToken(token: string): Promise<false | string> {
    try {
      const user = await auth().verifyIdToken(token);
      await this.prisma.user.upsert({
        where: { id: user.uid },
        create: { id: user.uid },
        update: { last_login: new Date() },
      });
      return user.uid;
    } catch (error) {
      if (isInvalidCredentialError(error)) {
        return false;
      }

      throw new ServiceUnavailableException(
        'Authentication service is temporarily unavailable',
        { cause: error },
      );
    }
  }
}

const INVALID_CREDENTIAL_CODES = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled',
  'auth/user-not-found',
]);

function isInvalidCredentialError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }

  return INVALID_CREDENTIAL_CODES.has(String(error.code));
}
