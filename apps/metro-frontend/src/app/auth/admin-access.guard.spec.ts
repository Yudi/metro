import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import type { Route, UrlSegment } from '@angular/router';
import type { User } from 'firebase/auth';
import { isObservable, firstValueFrom } from 'rxjs';
import { authReady, firebaseIdToken, firebaseUser } from '@metro/shared/firebase';
import { ADMIN_ACCOUNT_FIXTURE } from '@metro/shared/admin-contracts';
import { adminAccessGuard } from './admin-access.guard';

const token = (admin: boolean) => `header.${btoa(JSON.stringify({ admin }))}.signature`;
const invoke = () => TestBed.runInInjectionContext(() => adminAccessGuard({} as Route, [] as UrlSegment[]));

describe('adminAccessGuard', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));
  afterEach(() => {
    authReady.set(false);
    firebaseUser.set(null);
    firebaseIdToken.set(null);
  });

  it('allows admins and redirects regular users without importing admin routes', () => {
    authReady.set(true);
    firebaseUser.set({ uid: ADMIN_ACCOUNT_FIXTURE.uid } as User);
    firebaseIdToken.set(token(true));
    expect(invoke()).toBe(true);
    firebaseIdToken.set(token(false));
    expect(TestBed.inject(Router).serializeUrl(invoke() as UrlTree)).toBe('/sp/menu');
  });

  it('redirects signed-out users', () => {
    authReady.set(true);
    expect(TestBed.inject(Router).serializeUrl(invoke() as UrlTree)).toBe('/sp/menu');
  });

  it('waits for the restored token instead of rejecting a valid admin too early', async () => {
    authReady.set(true);
    firebaseUser.set({ uid: ADMIN_ACCOUNT_FIXTURE.uid } as User);
    const result = invoke();
    if (!isObservable(result)) throw new Error('Expected pending authentication');
    const pending = firstValueFrom(result);
    firebaseIdToken.set(token(true));
    TestBed.tick();
    expect(await pending).toBe(true);
  });
});
