import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import {
  ADMIN_ACCOUNT_FIXTURE,
  REGULAR_ACCOUNT_FIXTURE,
} from '@metro/shared/admin-contracts';
import type { AdminAccessService } from './admin-access.service';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  const verifyIdToken = jest.fn();
  const getUser = jest.fn();
  const synchronizeBootstrapAdmin = jest.fn();
  const setHeader = jest.fn();
  let guard: AdminGuard;
  let request: { headers: Record<string, string | undefined>; userId?: string };

  beforeEach(() => {
    jest.clearAllMocks();
    request = { headers: { authorization: 'Bearer valid-token' } };
    const service = {
      verifyIdToken,
      getUser,
      synchronizeBootstrapAdmin,
      configuredBootstrapUid: null,
    } as unknown as AdminAccessService;
    guard = new AdminGuard(service);
    verifyIdToken.mockResolvedValue({
      uid: ADMIN_ACCOUNT_FIXTURE.uid,
      admin: true,
    });
    getUser.mockResolvedValue({
      uid: ADMIN_ACCOUNT_FIXTURE.uid,
      disabled: false,
      customClaims: { admin: true },
    });
  });

  it('requires a bearer token and disables caching before authentication', async () => {
    request.headers.authorization = undefined;
    const context = httpContext(request, setHeader);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects a valid token without the administrator claim', async () => {
    verifyIdToken.mockResolvedValue({
      uid: REGULAR_ACCOUNT_FIXTURE.uid,
      admin: false,
    });
    getUser.mockResolvedValue({
      uid: REGULAR_ACCOUNT_FIXTURE.uid,
      disabled: false,
      customClaims: {},
    });

    await expect(
      guard.canActivate(httpContext(request, setHeader)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an administrator token after the server-side claim was removed', async () => {
    getUser.mockResolvedValue({
      uid: ADMIN_ACCOUNT_FIXTURE.uid,
      disabled: false,
      customClaims: { department: 'operations' },
    });

    await expect(
      guard.canActivate(httpContext(request, setHeader)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects disabled users even when both administrator claims are present', async () => {
    getUser.mockResolvedValue({
      uid: ADMIN_ACCOUNT_FIXTURE.uid,
      disabled: true,
      customClaims: { admin: true },
    });

    await expect(
      guard.canActivate(httpContext(request, setHeader)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('checks revoked tokens and attaches the verified Firebase UID', async () => {
    const context = httpContext(request, setHeader);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyIdToken).toHaveBeenCalledWith('valid-token');
    expect(request.userId).toBe(ADMIN_ACCOUNT_FIXTURE.uid);
  });

  it('retries bootstrap synchronization only for a verified configured UID', async () => {
    const bootstrapService = {
      verifyIdToken,
      getUser,
      synchronizeBootstrapAdmin,
      configuredBootstrapUid: ADMIN_ACCOUNT_FIXTURE.uid,
    } as unknown as AdminAccessService;
    guard = new AdminGuard(bootstrapService);

    await expect(
      guard.canActivate(httpContext(request, setHeader)),
    ).resolves.toBe(true);
    expect(synchronizeBootstrapAdmin).toHaveBeenCalledWith(
      ADMIN_ACCOUNT_FIXTURE.uid,
    );
  });

  it('still requires the verified token to contain admin=true after bootstrap sync', async () => {
    const bootstrapService = {
      verifyIdToken: jest.fn().mockResolvedValue({
        uid: ADMIN_ACCOUNT_FIXTURE.uid,
        admin: false,
      }),
      getUser,
      synchronizeBootstrapAdmin,
      configuredBootstrapUid: ADMIN_ACCOUNT_FIXTURE.uid,
    } as unknown as AdminAccessService;
    guard = new AdminGuard(bootstrapService);

    await expect(
      guard.canActivate(httpContext(request, setHeader)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(synchronizeBootstrapAdmin).toHaveBeenCalledWith(
      ADMIN_ACCOUNT_FIXTURE.uid,
    );
  });
});

function httpContext(
  request: { headers: Record<string, string | undefined>; userId?: string },
  setHeader: jest.Mock,
): ExecutionContext {
  const authenticatedRequest = Object.assign(request, { res: { setHeader } });
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => authenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}
