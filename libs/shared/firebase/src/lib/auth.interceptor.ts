import { HttpInterceptorFn } from '@angular/common/http';
import { firebaseIdToken } from './auth.signal';

export const firebaseAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const token = firebaseIdToken();

  if (!token || !req.url.startsWith('/api')) {
    return next(req);
  }

  const authReq = req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });

  return next(authReq);
};
