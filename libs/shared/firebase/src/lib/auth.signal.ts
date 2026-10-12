import { computed, signal } from '@angular/core';
import { User } from 'firebase/auth';

export const authReady = signal(false);
export const firebaseUser = signal<User | null>(null);
export const firebaseIdToken = signal<string | null>(null);

/** A UI hint only; privileged APIs independently verify current Firebase claims. */
export const firebaseIsAdmin = computed(() =>
  isAuthenticatedSnapshotReady(firebaseUser(), firebaseIdToken()) &&
  hasFirebaseAdminClaim(firebaseIdToken()),
);

export function hasFirebaseAdminClaim(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(base64));
    return typeof claims === 'object' && claims !== null &&
      'admin' in claims && claims.admin === true;
  } catch {
    return false;
  }
}

export function isAuthenticatedSnapshotReady(
  user: User | null,
  token: string | null,
): user is User {
  return user !== null && token !== null && token.length > 0;
}
