import { Service, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';

export type AuthOperationResult =
  | { success: true }
  | { success: false; reason: 'server' | 'failed'; error?: unknown };

@Service()
export class AuthService {
  private platformId = inject(PLATFORM_ID);

  async loginGoogle(): Promise<AuthOperationResult> {
    if (!isPlatformBrowser(this.platformId)) {
      return { success: false, reason: 'server' };
    }

    const auth = getAuth();
    const provider = new GoogleAuthProvider();

    try {
      if (auth.emulatorConfig) {
        await signInWithPopup(auth, provider);
      } else {
        await signInWithRedirect(auth, provider);
      }

      return { success: true };
    } catch (error: unknown) {
      console.error('Firebase Google sign-in failed', error);
      return { success: false, reason: 'failed', error };
    }
  }

  async logout(): Promise<AuthOperationResult> {
    if (!isPlatformBrowser(this.platformId)) {
      return { success: false, reason: 'server' };
    }

    try {
      await signOut(getAuth());
      return { success: true };
    } catch (error: unknown) {
      console.error('Firebase logout failed', error);
      return { success: false, reason: 'failed', error };
    }
  }
}
