import { Service, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';

@Service()
export class AuthService {
  private platformId = inject(PLATFORM_ID);

  loginGoogle() {
    if (!isPlatformBrowser(this.platformId)) return;

    const auth = getAuth();
    const provider = new GoogleAuthProvider();

    if (auth.emulatorConfig) {
      signInWithPopup(auth, provider);
      return;
    }

    signInWithRedirect(auth, provider);
  }

  logout() {
    if (!isPlatformBrowser(this.platformId)) return;

    signOut(getAuth());
  }
}
