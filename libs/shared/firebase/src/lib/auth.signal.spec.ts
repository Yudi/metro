import { User } from 'firebase/auth';
import { isAuthenticatedSnapshotReady } from './auth.signal';

describe('isAuthenticatedSnapshotReady', () => {
  it('does not treat a user without an ID token as authenticated', () => {
    const user = { uid: 'user-a' } as User;

    expect(isAuthenticatedSnapshotReady(user, null)).toBe(false);
    expect(isAuthenticatedSnapshotReady(user, '')).toBe(false);
  });

  it('accepts only a user and a non-empty token together', () => {
    const user = { uid: 'user-a' } as User;

    expect(isAuthenticatedSnapshotReady(null, 'token-a')).toBe(false);
    expect(isAuthenticatedSnapshotReady(user, 'token-a')).toBe(true);
  });
});
