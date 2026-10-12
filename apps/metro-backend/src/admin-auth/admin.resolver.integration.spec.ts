import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GraphQLModule } from '@nestjs/graphql';
import { YogaDriver, type YogaDriverConfig } from '@graphql-yoga/nestjs';
import { auth } from 'firebase-admin';
import type { UserRecord } from 'firebase-admin/auth';
import type { Server } from 'node:http';
import {
  ADMIN_ACCOUNT_FIXTURE,
  REGULAR_ACCOUNT_FIXTURE,
} from '@metro/shared/admin-contracts';
import { createGraphQLYogaConfig } from '../common/graphql/graphql-yoga.config';
import { LoadersService } from '../common/graphql/loaders.service';
import { AdminAuthModule } from './admin-auth.module';

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

type GraphQLPayload = {
  data?: Record<string, unknown> | null;
  errors?: { message: string; extensions?: Record<string, unknown> }[];
};

const firebaseAuth = jest.mocked(auth)() as unknown as FirebaseAuthMock;
const originalBootstrapUid = process.env['ADMIN_BOOTSTRAP_UID'];

@Module({
  imports: [
    GraphQLModule.forRoot<YogaDriverConfig>({
      driver: YogaDriver,
      ...createGraphQLYogaConfig(
        { createLoaders: () => ({}) } as unknown as LoadersService,
        true,
      ),
      autoSchemaFile: true,
      graphiql: false,
    }),
    AdminAuthModule,
  ],
})
class AdminGraphQLIntegrationModule {}

describe('Admin GraphQL integration', () => {
  let app: Awaited<ReturnType<typeof createAdminGraphQLApp>>;
  let endpoint: string;
  let users: Map<string, UserRecord>;

  beforeAll(async () => {
    process.env['ADMIN_BOOTSTRAP_UID'] = ADMIN_ACCOUNT_FIXTURE.uid;
    users = new Map([
      [
        ADMIN_ACCOUNT_FIXTURE.uid,
        firebaseUser(ADMIN_ACCOUNT_FIXTURE, { admin: true, region: 'central' }),
      ],
      [
        REGULAR_ACCOUNT_FIXTURE.uid,
        firebaseUser(REGULAR_ACCOUNT_FIXTURE, { department: 'support' }, []),
      ],
    ]);

    firebaseAuth.verifyIdToken.mockImplementation(async (token: string) => {
      if (token === 'admin-token') {
        return { uid: ADMIN_ACCOUNT_FIXTURE.uid, admin: true };
      }
      if (token === 'regular-token') {
        return { uid: REGULAR_ACCOUNT_FIXTURE.uid, admin: false };
      }
      if (token === 'stale-token') {
        return { uid: REGULAR_ACCOUNT_FIXTURE.uid, admin: true };
      }
      if (token === 'disabled-token') {
        return { uid: REGULAR_ACCOUNT_FIXTURE.uid, admin: true };
      }
      if (token === 'revoked-token') {
        throw { code: 'auth/id-token-revoked' };
      }
      throw { code: 'auth/id-token-expired' };
    });
    firebaseAuth.getUser.mockImplementation(async (uid: string) => {
      const user = users.get(uid);
      if (!user) {
        throw { code: 'auth/user-not-found' };
      }
      return user;
    });
    firebaseAuth.getUserByEmail.mockImplementation(async (email: string) => {
      const user = [...users.values()].find(
        (candidate) => candidate.email === email,
      );
      if (!user) {
        throw { code: 'auth/user-not-found' };
      }
      return user;
    });
    firebaseAuth.listUsers.mockImplementation(async () => ({
      users: [...users.values()],
    }));
    firebaseAuth.setCustomUserClaims.mockImplementation(
      async (uid: string, customClaims: Record<string, unknown>) => {
        const user = users.get(uid);
        if (!user) {
          throw { code: 'auth/user-not-found' };
        }
        users.set(uid, { ...user, customClaims } as UserRecord);
      },
    );

    app = await createAdminGraphQLApp();
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as Server).address();
    if (!address || typeof address === 'string') {
      throw new Error('GraphQL test server did not bind an ephemeral port');
    }
    endpoint = `http://127.0.0.1:${address.port}/api/graphql`;
  });

  afterAll(async () => {
    await app?.close();
    if (originalBootstrapUid === undefined) {
      delete process.env['ADMIN_BOOTSTRAP_UID'];
    } else {
      process.env['ADMIN_BOOTSTRAP_UID'] = originalBootstrapUid;
    }
  });

  it('authorizes requests and completes administrator management operations', async () => {
    const query = `query AdminAccounts {
      adminAccounts { uid email displayName bootstrap }
    }`;
    const missingToken = await execute(query);
    expect(missingToken.body.errors?.[0]?.extensions?.['code']).toBe(
      'UNAUTHENTICATED',
    );
    expect(missingToken.response.headers.get('cache-control')).toBe('no-store');

    const regularToken = await execute(query, 'regular-token');
    expect(regularToken.body.errors?.[0]?.extensions?.['code']).toBe('FORBIDDEN');

    const revokedToken = await execute(query, 'revoked-token');
    expect(revokedToken.body.errors?.[0]?.extensions?.['code']).toBe(
      'UNAUTHENTICATED',
    );

    const expiredToken = await execute(query, 'expired-token');
    expect(expiredToken.body.errors?.[0]?.extensions?.['code']).toBe(
      'UNAUTHENTICATED',
    );

    const staleToken = await execute(query, 'stale-token');
    expect(staleToken.body.errors?.[0]?.extensions?.['code']).toBe('FORBIDDEN');

    users.set(
      REGULAR_ACCOUNT_FIXTURE.uid,
      firebaseUser(REGULAR_ACCOUNT_FIXTURE, {}, [], true),
    );
    const disabledToken = await execute(query, 'disabled-token');
    expect(disabledToken.body.errors?.[0]?.extensions?.['code']).toBe('FORBIDDEN');
    users.set(
      REGULAR_ACCOUNT_FIXTURE.uid,
      firebaseUser(REGULAR_ACCOUNT_FIXTURE, { department: 'support' }, []),
    );

    const listed = await execute(query, 'admin-token');
    expect(listed.body.data).toEqual({ adminAccounts: [ADMIN_ACCOUNT_FIXTURE] });
    expect(listed.response.headers.get('cache-control')).toBe('no-store');

    const malformedEmail = await execute(
      'mutation { grantAdmin(email: "not-an-email") { uid } }',
      'admin-token',
    );
    expect(malformedEmail.body.errors?.[0]?.extensions?.['code']).toBe(
      'BAD_REQUEST',
    );

    const malformedUid = await execute(
      'mutation { revokeAdmin(uid: "") }',
      'admin-token',
    );
    expect(malformedUid.body.errors?.[0]?.extensions?.['code']).toBe(
      'BAD_REQUEST',
    );

    const grant = await execute(
      `mutation GrantAdmin($email: String!) {
        grantAdmin(email: $email) { uid email displayName bootstrap }
      }`,
      'admin-token',
      { email: REGULAR_ACCOUNT_FIXTURE.email },
    );
    expect(grant.body.data).toEqual({
      grantAdmin: REGULAR_ACCOUNT_FIXTURE,
    });
    expect(users.get(REGULAR_ACCOUNT_FIXTURE.uid)?.customClaims).toEqual({
      department: 'support',
      admin: true,
    });

    const revoke = await execute(
      `mutation RevokeAdmin($uid: String!) { revokeAdmin(uid: $uid) }`,
      'admin-token',
      { uid: REGULAR_ACCOUNT_FIXTURE.uid },
    );
    expect(revoke.body.data).toEqual({ revokeAdmin: true });
    expect(users.get(REGULAR_ACCOUNT_FIXTURE.uid)?.customClaims).toEqual({
      department: 'support',
    });
  });

  it('preserves valid custom Firebase UIDs containing punctuation', async () => {
    const uid = 'editor/fixture';
    users.set(uid, firebaseUser({ ...REGULAR_ACCOUNT_FIXTURE, uid }, { admin: true, department: 'support' }));
    const revoked = await execute(
      'mutation RevokeAdmin($uid: String!) { revokeAdmin(uid: $uid) }',
      'admin-token',
      { uid },
    );
    expect(revoked.body.data).toEqual({ revokeAdmin: true });
    expect(users.get(uid)?.customClaims).toEqual({ department: 'support' });
  });

  async function execute(
    query: string,
    token?: string,
    variables?: Record<string, unknown>,
  ): Promise<{ response: Response; body: GraphQLPayload }> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/graphql-response+json, application/json',
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    return {
      response,
      body: (await response.json()) as GraphQLPayload,
    };
  }
});

async function createAdminGraphQLApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AdminGraphQLIntegrationModule],
  }).compile();
  return moduleRef.createNestApplication();
}

function firebaseUser(
  account: { uid: string; email: string | null; displayName: string | null },
  customClaims: Record<string, unknown>,
  providerData: UserRecord['providerData'] = [],
  disabled = false,
): UserRecord {
  return {
    uid: account.uid,
    email: account.email,
    displayName: account.displayName,
    disabled,
    providerData,
    customClaims,
  } as unknown as UserRecord;
}
