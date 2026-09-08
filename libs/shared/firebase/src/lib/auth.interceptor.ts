import { HttpInterceptorFn } from '@angular/common/http';
import { firebaseIdToken } from './auth.signal';

export function createFirebaseAuthInterceptor(
  apiBaseUrl: string,
): HttpInterceptorFn {
  const baseUrls = [apiBaseUrl.replace(/\/+$/, ''), '/api'];

  return (req, next) => {
    const token = firebaseIdToken();

    const requestUrl = req.url.split(/[?#]/, 1)[0];
    const isApiRequest = baseUrls.some(
      (baseUrl) => requestUrl === baseUrl || requestUrl.startsWith(`${baseUrl}/`),
    );

    if (!token || !isApiRequest) {
      return next(req);
    }

    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });

    return next(authReq);
  };
}

export const firebaseAuthInterceptor = createFirebaseAuthInterceptor('/api');
