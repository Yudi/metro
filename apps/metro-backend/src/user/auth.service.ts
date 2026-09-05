import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { auth } from 'firebase-admin';

@Injectable()
export class AuthService {
  async verifyToken(token: string): Promise<false | string> {
    try {
      const user = await auth().verifyIdToken(token);
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
