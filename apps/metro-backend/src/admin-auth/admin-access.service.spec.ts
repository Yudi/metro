import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { auth } from 'firebase-admin';
import type { UserRecord } from 'firebase-admin/auth';
import {
  ADMIN_ACCOUNT_FIXTURE,
  REGULAR_ACCOUNT_FIXTURE,
} from '@metro/shared/admin-contracts';
import { AdminAccessService } from './admin-access.service';

jest.mock('firebase-admin', () => {
  const firebaseAuth = {
    verifyIdToken: jest.fn(),
    getUser: jest.fn(),
    getUserByEmail: jest.fn(),
    listUsers: jest.fn(),
    setCustomUserClaims: jest.fn(),
  };
  return { auth: jest.fn(() => firebaseAuth) };
});

type FirebaseAuthMock = {
  verifyIdToken: jest.Mock;
  getUser: jest.Mock;
  getUserByEmail: jest.Mock;
  listUsers: jest.Mock;
  setCustomUserClaims: jest.Mock;
};

const firebaseAuth = jest.mocked(auth)() as unknown as FirebaseAuthMock;
const originalBootstrapUid = process.env['ADMIN_BOOTSTRAP_UID'];

describe('AdminAccessService', () => {
  let service: AdminAccessService;
  let users: Record<string, UserRecord>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['ADMIN_BOOTSTRAP_UID'];
    users = {};
    service = new AdminAccessService();

    firebaseAuth.getUser.mockImplementation(async (uid: string) => {
      const user = users[uid];
      if (!user) {
        throw { code: 'auth/user-not-found' };
      }
      return user;
    });
    firebaseAuth.getUserByEmail.mockImplementation(async (email: string) => {
      const user = Object.values(users).find((candidate) => candidate.email === email);
      if (!user) {
        throw { code: 'auth/user-not-found' };
      }
      return user;
    });
    firebaseAuth.listUsers.mockImplementation(async () => ({
      users: Object.values(users),
    }));
    firebaseAuth.setCustomUserClaims.mockImplementation(
      async (uid: string, customClaims: Record<string, unknown>) => {
        const user = users[uid];
        if (!user) {
          throw { code: 'auth/user-not-found' };
        }
        users[uid] = { ...user, customClaims } as UserRecord;
      },
    );
  });

  it.each([
    ['expired', 'auth/id-token-expired'],
    ['revoked', 'auth/id-token-revoked'],
    ['malformed', 'auth/invalid-id-token'],
  ])('rejects a %s token after checking revocation', async (_label, code) => {
    firebaseAuth.verifyIdToken.mockRejectedValue({ code });

    await expect(service.verifyIdToken('invalid-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(firebaseAuth.verifyIdToken).toHaveBeenCalledWith(
      'invalid-token',
      true,
    );
  });

  it('rejects a disabled Firebase user during token verification', async () => {
    firebaseAuth.verifyIdToken.mockRejectedValue({
      code: 'auth/user-disabled',
    });

    await expect(service.verifyIdToken('disabled-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(firebaseAuth.verifyIdToken).toHaveBeenCalledWith(
      'disabled-token',
      true,
    );
  });

  afterEach(() => {
    if (originalBootstrapUid === undefined) {
      delete process.env['ADMIN_BOOTSTRAP_UID'];
    } else {
      process.env['ADMIN_BOOTSTRAP_UID'] = originalBootstrapUid;
    }
  });

  it('lists administrator accounts from every Firebase page', async () => {
    const administrator = firebaseUser(ADMIN_ACCOUNT_FIXTURE, {
      admin: true,
      color: 'blue',
    });
    const regular = firebaseUser(REGULAR_ACCOUNT_FIXTURE);
    firebaseAuth.listUsers
      .mockResolvedValueOnce({ users: [regular], pageToken: 'next-page' })
      .mockResolvedValueOnce({ users: [administrator] });
    process.env['ADMIN_BOOTSTRAP_UID'] = ADMIN_ACCOUNT_FIXTURE.uid;

    await expect(service.listAdministratorAccounts()).resolves.toEqual([
      ADMIN_ACCOUNT_FIXTURE,
    ]);
    expect(firebaseAuth.listUsers).toHaveBeenNthCalledWith(1, 1000, undefined);
    expect(firebaseAuth.listUsers).toHaveBeenNthCalledWith(2, 1000, 'next-page');
  });

  it('sets admin=true while preserving unrelated custom claims', async () => {
    users[REGULAR_ACCOUNT_FIXTURE.uid] = firebaseUser(
      REGULAR_ACCOUNT_FIXTURE,
      { theme: 'dark', permissions: ['images:write'] },
    );

    await expect(
      service.addAdministrator(REGULAR_ACCOUNT_FIXTURE.email ?? ''),
    ).resolves.toEqual(REGULAR_ACCOUNT_FIXTURE);
    expect(firebaseAuth.setCustomUserClaims).toHaveBeenCalledWith(
      REGULAR_ACCOUNT_FIXTURE.uid,
      { theme: 'dark', permissions: ['images:write'], admin: true },
    );
  });

  it('does not rewrite claims for an account that is already an administrator', async () => {
    users[ADMIN_ACCOUNT_FIXTURE.uid] = firebaseUser(ADMIN_ACCOUNT_FIXTURE, {
      admin: true,
      department: 'operations',
    });

    await service.addAdministrator(ADMIN_ACCOUNT_FIXTURE.email ?? '');

    expect(firebaseAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('rejects an unknown email without changing claims', async () => {
    await expect(
      service.addAdministrator('missing@example.test'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(firebaseAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it.each([
    ['disabled', { disabled: true }],
    ['anonymous', { disabled: false, email: undefined, providerData: [] }],
  ])('rejects a %s account', async (label, overrides) => {
    users[REGULAR_ACCOUNT_FIXTURE.uid] = firebaseUser(
      REGULAR_ACCOUNT_FIXTURE,
      {},
      overrides,
    );

    await expect(
      service.addAdministrator(REGULAR_ACCOUNT_FIXTURE.email ?? ''),
    ).rejects.toBeInstanceOf(label === 'anonymous' ? NotFoundException : ForbiddenException);
    expect(firebaseAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('allows an existing email account before it has linked a sign-in provider', async () => {
    users[REGULAR_ACCOUNT_FIXTURE.uid] = firebaseUser(REGULAR_ACCOUNT_FIXTURE, {}, { providerData: [] });
    const result = await service.addAdministrator(REGULAR_ACCOUNT_FIXTURE.email ?? '');
    expect(result.uid).toBe(REGULAR_ACCOUNT_FIXTURE.uid);
    expect(firebaseAuth.setCustomUserClaims).toHaveBeenCalledWith(REGULAR_ACCOUNT_FIXTURE.uid, { admin: true });
  });

  it('synchronizes the configured bootstrap account and preserves its claims', async () => {
    process.env['ADMIN_BOOTSTRAP_UID'] = ADMIN_ACCOUNT_FIXTURE.uid;
    users[ADMIN_ACCOUNT_FIXTURE.uid] = firebaseUser(ADMIN_ACCOUNT_FIXTURE, {
      department: 'operations',
    });

    await service.onApplicationBootstrap();

    expect(firebaseAuth.setCustomUserClaims).toHaveBeenCalledWith(
      ADMIN_ACCOUNT_FIXTURE.uid,
      { department: 'operations', admin: true },
    );
    await expect(service.listAdministratorAccounts()).resolves.toEqual([
      ADMIN_ACCOUNT_FIXTURE,
    ]);
  });

  it('removes only the admin claim and preserves the remaining claims', async () => {
    users[ADMIN_ACCOUNT_FIXTURE.uid] = firebaseUser(ADMIN_ACCOUNT_FIXTURE, {
      admin: true,
    });
    users[REGULAR_ACCOUNT_FIXTURE.uid] = firebaseUser(
      REGULAR_ACCOUNT_FIXTURE,
      { admin: true, department: 'support', permissions: ['read'] },
    );

    await service.removeAdministrator(
      REGULAR_ACCOUNT_FIXTURE.uid,
      ADMIN_ACCOUNT_FIXTURE.uid,
    );

    expect(firebaseAuth.setCustomUserClaims).toHaveBeenCalledWith(
      REGULAR_ACCOUNT_FIXTURE.uid,
      { department: 'support', permissions: ['read'] },
    );
  });

  it('prevents an administrator from removing their own access', async () => {
    users[ADMIN_ACCOUNT_FIXTURE.uid] = firebaseUser(ADMIN_ACCOUNT_FIXTURE, {
      admin: true,
    });

    await expect(
      service.removeAdministrator(
        ADMIN_ACCOUNT_FIXTURE.uid,
        ADMIN_ACCOUNT_FIXTURE.uid,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(firebaseAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('prevents removal of the configured bootstrap account', async () => {
    process.env['ADMIN_BOOTSTRAP_UID'] = REGULAR_ACCOUNT_FIXTURE.uid;
    users[ADMIN_ACCOUNT_FIXTURE.uid] = firebaseUser(ADMIN_ACCOUNT_FIXTURE, {
      admin: true,
    });
    users[REGULAR_ACCOUNT_FIXTURE.uid] = firebaseUser(
      REGULAR_ACCOUNT_FIXTURE,
      { admin: true },
    );

    await expect(
      service.removeAdministrator(
        REGULAR_ACCOUNT_FIXTURE.uid,
        ADMIN_ACCOUNT_FIXTURE.uid,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(firebaseAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('prevents removal of the last active administrator', async () => {
    users[ADMIN_ACCOUNT_FIXTURE.uid] = firebaseUser(ADMIN_ACCOUNT_FIXTURE, {
      admin: true,
    });

    await expect(
      service.removeAdministrator(
        ADMIN_ACCOUNT_FIXTURE.uid,
        REGULAR_ACCOUNT_FIXTURE.uid,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(firebaseAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });
});

function firebaseUser(
  account: { uid: string; email: string | null; displayName: string | null },
  customClaims: Record<string, unknown> = {},
  overrides: Partial<UserRecord> = {},
): UserRecord {
  return {
    uid: account.uid,
    email: account.email,
    displayName: account.displayName,
    disabled: false,
    providerData: [{ providerId: 'password' }],
    customClaims,
    ...overrides,
  } as unknown as UserRecord;
}
