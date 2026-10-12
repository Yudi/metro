import { User } from 'firebase/auth';
import {
  firebaseIdToken,
  firebaseIsAdmin,
  firebaseUser,
  hasFirebaseAdminClaim,
} from './auth.signal';
import { ADMIN_ACCOUNT_FIXTURE } from '@metro/shared/admin-contracts';

const token = (admin: unknown) => `header.${btoa(JSON.stringify({ admin }))}.signature`;

describe('Firebase admin UI claim', () => {
  afterEach(() => {
    firebaseUser.set(null);
    firebaseIdToken.set(null);
  });

  it('requires the boolean admin claim and handles malformed tokens', () => {
    expect(hasFirebaseAdminClaim(token(true))).toBe(true);
    for (const value of [false, 'true', 1, null]) {
      expect(hasFirebaseAdminClaim(token(value))).toBe(false);
    }
    expect(hasFirebaseAdminClaim(null)).toBe(false);
    expect(hasFirebaseAdminClaim('invalid')).toBe(false);
    expect(hasFirebaseAdminClaim('header.%%%bad.signature')).toBe(false);
  });

  it('removes the admin menu hint as soon as the token or account clears', () => {
    firebaseUser.set({ uid: ADMIN_ACCOUNT_FIXTURE.uid } as User);
    firebaseIdToken.set(token(true));
    expect(firebaseIsAdmin()).toBe(true);
    firebaseIdToken.set(null);
    expect(firebaseIsAdmin()).toBe(false);
    firebaseIdToken.set(token(true));
    firebaseUser.set(null);
    expect(firebaseIsAdmin()).toBe(false);
  });
});
