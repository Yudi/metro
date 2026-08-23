import { signal } from '@angular/core';
import { User } from 'firebase/auth';

export const authReady = signal(false);
export const firebaseUser = signal<User | null>(null);
export const firebaseIdToken = signal<string | null>(null);

export function isAuthenticatedSnapshotReady(
  user: User | null,
  token: string | null,
): user is User {
  return user !== null && token !== null && token.length > 0;
}
