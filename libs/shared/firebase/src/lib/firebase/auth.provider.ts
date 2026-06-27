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
} from 'firebase/auth';
import { firebaseUser, firebaseIdToken } from './auth.signal';
import { AuthBackendSyncService } from './auth-backend-sync.service';
import { authReady } from './auth.signal';

type FirebaseAuthProviderConfig = {
  useEmulators?: boolean;
  authEmulatorUrl?: string;
};

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

    // register listeners up‑front
    onAuthStateChanged(auth, (user) => {
      firebaseUser.set(user);
      authReady.set(true);
    });

    onIdTokenChanged(auth, async (user) => {
      firebaseUser.set(user);

      if (!user) {
        firebaseIdToken.set(null);
        return;
      }

      const token = await user.getIdToken();
      firebaseIdToken.set(token);
    });

    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        firebaseUser.set(result.user);
        authReady.set(true);
        return;
      }
    });
  });
}
