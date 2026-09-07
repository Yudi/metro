import { provideAppInitializer, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  onIdTokenChanged,
  setPersistence,
  useDeviceLanguage,
  User,
} from 'firebase/auth';
import { firebaseUser, firebaseIdToken } from './auth.signal';
import { AuthBackendSyncService } from './auth-backend-sync.service';
import { authReady } from './auth.signal';

type FirebaseAuthProviderConfig = {
  useEmulators?: boolean;
  authEmulatorUrl?: string;
};

export class FirebaseAuthStateCoordinator {
  private currentUid: string | null = null;
  private tokenRequestGeneration = 0;

  constructor(
    private readonly setUser: (user: User | null) => void,
    private readonly setToken: (token: string | null) => void,
  ) {}

  handleAuthStateChanged(user: User | null): void {
    const uid = user?.uid ?? null;
    if (uid !== this.currentUid) {
      this.currentUid = uid;
      this.setToken(null);
    }

    this.setUser(user);
  }

  handleIdTokenChanged(user: User | null): void {
    this.handleAuthStateChanged(user);

    if (!user) {
      this.setToken(null);
      return;
    }

    // A token refresh for the same UID also invalidates the previous token
    // while the fresh value is being resolved.
    this.setToken(null);
    const uid = user.uid;
    const generation = ++this.tokenRequestGeneration;
    let tokenPromise: Promise<string>;
    try {
      tokenPromise = user.getIdToken();
    } catch (error: unknown) {
      this.setToken(null);
      console.error('Failed to obtain Firebase ID token', error);
      return;
    }

    void tokenPromise
      .then((token) => {
        if (
          generation === this.tokenRequestGeneration &&
          this.currentUid === uid
        ) {
          this.setToken(token);
        }
      })
      .catch((error: unknown) => {
        if (
          generation === this.tokenRequestGeneration &&
          this.currentUid === uid
        ) {
          this.setToken(null);
        }
        console.error('Failed to obtain Firebase ID token', error);
      });
  }
}

export function provideAuth(config?: FirebaseAuthProviderConfig) {
  return provideAppInitializer(() => {
    const platformId = inject(PLATFORM_ID);
    if (!isPlatformBrowser(platformId)) return;

    inject(AuthBackendSyncService);

    const auth = getAuth();

    // Firebase requires emulator connection immediately after obtaining auth.
    if (config?.useEmulators && !auth.emulatorConfig) {
      connectAuthEmulator(
        auth,
        config.authEmulatorUrl ?? 'http://127.0.0.1:9099',
        {
          disableWarnings: true,
        },
      );
    }

    useDeviceLanguage(auth);
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.error('Failed to set auth persistence', err);
    });

    const authState = new FirebaseAuthStateCoordinator(
      (user) => firebaseUser.set(user),
      (token) => firebaseIdToken.set(token),
    );

    // Register listeners up-front. The user and token signals are deliberately
    // cleared on account changes so consumers cannot send an old account's
    // token while Firebase is publishing the new user.
    onAuthStateChanged(auth, (user) => {
      authState.handleAuthStateChanged(user);
      authReady.set(true);
    });

    onIdTokenChanged(auth, (user) => {
      authState.handleIdTokenChanged(user);
    });

    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          authState.handleIdTokenChanged(result.user);
          authReady.set(true);
          return;
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to resolve Firebase redirect result', error);
        authReady.set(true);
      });
  });
}
