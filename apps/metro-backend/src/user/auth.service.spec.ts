import { ServiceUnavailableException } from '@nestjs/common';
import { auth } from 'firebase-admin';
import { AuthService } from './auth.service';

jest.mock('firebase-admin', () => ({
  auth: jest.fn(),
}));

describe('AuthService', () => {
  const verifyIdToken = jest.fn();
  const service = new AuthService();

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(auth).mockReturnValue({ verifyIdToken } as never);
  });

  it('returns the uid for a valid token', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'user-id' });

    await expect(service.verifyToken('token')).resolves.toBe('user-id');
  });

  it('returns false for an invalid or expired credential', async () => {
    verifyIdToken.mockRejectedValue({ code: 'auth/id-token-expired' });

    await expect(service.verifyToken('token')).resolves.toBe(false);
  });

  it('surfaces verifier infrastructure failures', async () => {
    verifyIdToken.mockRejectedValue({ code: 'auth/internal-error' });

    await expect(service.verifyToken('token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
