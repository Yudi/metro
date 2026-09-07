import { User } from 'firebase/auth';

jest.mock('firebase/auth', () => ({
  browserLocalPersistence: {},
  connectAuthEmulator: jest.fn(),
  getAuth: jest.fn(),
  getRedirectResult: jest.fn(),
  onAuthStateChanged: jest.fn(),
  onIdTokenChanged: jest.fn(),
  setPersistence: jest.fn(),
  useDeviceLanguage: jest.fn(),
}));

import { FirebaseAuthStateCoordinator } from './auth.provider';

describe('FirebaseAuthStateCoordinator', () => {
  it('ignores a delayed token from a previous account', async () => {
    let resolveA: (token: string) => void = () => undefined;
    const tokenA = new Promise<string>((resolve) => {
      resolveA = resolve;
    });
    const userA = {
      uid: 'user-a',
      getIdToken: jest.fn(() => tokenA),
    } as unknown as User;
    const userB = {
      uid: 'user-b',
      getIdToken: jest.fn().mockResolvedValue('token-b'),
    } as unknown as User;
    let currentUser: User | null = null;
    let currentToken: string | null = null;
    const coordinator = new FirebaseAuthStateCoordinator(
      (user) => {
        currentUser = user;
      },
      (token) => {
        currentToken = token;
      },
    );

    coordinator.handleIdTokenChanged(userA);
    coordinator.handleAuthStateChanged(userB);
    coordinator.handleIdTokenChanged(userB);
    resolveA('token-a');
    await Promise.resolve();
    await Promise.resolve();

    expect(currentUser?.uid).toBe('user-b');
    expect(currentToken).toBe('token-b');
  });

  it('clears the token while waiting for the first token callback', async () => {
    let resolveToken: (token: string) => void = () => undefined;
    const token = new Promise<string>((resolve) => {
      resolveToken = resolve;
    });
    const user = {
      uid: 'user-a',
      getIdToken: jest.fn(() => token),
    } as unknown as User;
    let currentToken: string | null = 'stale-token';
    const coordinator = new FirebaseAuthStateCoordinator(
      () => undefined,
      (nextToken) => {
        currentToken = nextToken;
      },
    );

    coordinator.handleAuthStateChanged(user);
    expect(currentToken).toBeNull();

    coordinator.handleIdTokenChanged(user);
    expect(currentToken).toBeNull();
    resolveToken('fresh-token');
    await Promise.resolve();
    expect(currentToken).toBe('fresh-token');
  });

  it('owns a synchronous token acquisition failure', () => {
    const user = {
      uid: 'user-a',
      getIdToken: jest.fn(() => {
        throw new Error('token unavailable');
      }),
    } as unknown as User;
    let currentToken: string | null = 'stale-token';
    const coordinator = new FirebaseAuthStateCoordinator(
      () => undefined,
      (token) => {
        currentToken = token;
      },
    );

    expect(() => coordinator.handleIdTokenChanged(user)).not.toThrow();
    expect(currentToken).toBeNull();
  });
});
