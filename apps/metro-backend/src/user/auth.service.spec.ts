import { ServiceUnavailableException } from '@nestjs/common';
import { auth } from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('firebase-admin', () => ({
  auth: jest.fn(),
}));

describe('AuthService', () => {
  const verifyIdToken = jest.fn();
  const upsert = jest.fn();
  const service = new AuthService({ user: { upsert } } as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(auth).mockReturnValue({ verifyIdToken } as never);
  });

  it('returns the uid for a valid token', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'user-id' });

    await expect(service.verifyToken('token')).resolves.toBe('user-id');
    expect(upsert).toHaveBeenCalledWith({ where: { id: 'user-id' }, create: { id: 'user-id' }, update: { last_login: expect.any(Date) } });
  });

  it('returns false for an invalid or expired credential', async () => {
    verifyIdToken.mockRejectedValue({ code: 'auth/id-token-expired' });

    await expect(service.verifyToken('token')).resolves.toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('surfaces verifier infrastructure failures', async () => {
    verifyIdToken.mockRejectedValue({ code: 'auth/internal-error' });

    await expect(service.verifyToken('token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
