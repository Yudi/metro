import { computed, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanMatchFn, Router } from '@angular/router';
import {
  authReady,
  firebaseIdToken,
  firebaseIsAdmin,
  firebaseUser,
} from '@metro/shared/firebase';
import { catchError, filter, map, of, take, timeout } from 'rxjs';

/** Runs before importing admin routes or components. */
export const adminAccessGuard: CanMatchFn = () => {
  const router = inject(Router);
  const denied = () => router.createUrlTree(['/sp/menu']);
  const ready = computed(() =>
    authReady() && (!firebaseUser() || firebaseIdToken() !== null),
  );

  if (ready()) return firebaseIsAdmin() || denied();

  return toObservable(ready).pipe(
    filter(Boolean),
    take(1),
    timeout(10_000),
    map(() => firebaseIsAdmin() || denied()),
    catchError(() => of(denied())),
  );
};
