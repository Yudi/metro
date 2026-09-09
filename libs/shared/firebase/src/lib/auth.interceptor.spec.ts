import { HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { EMPTY } from 'rxjs';
import { createFirebaseAuthInterceptor } from './auth.interceptor';
import { firebaseIdToken } from './auth.signal';

describe('Firebase HTTP authentication', () => {
  beforeEach(() => firebaseIdToken.set('account-token'));
  afterEach(() => firebaseIdToken.set(null));

  function authorization(apiBaseUrl: string, url: string): string | null {
    let header: string | null = null;
    const next: HttpHandlerFn = (request) => {
      header = request.headers.get('Authorization');
      return EMPTY;
    };
    createFirebaseAuthInterceptor(apiBaseUrl)(
      new HttpRequest('POST', url, {
        query: 'query NotificationConfiguration { notificationConfiguration }',
      }),
      next,
    );
    return header;
  }

  it.each([
    'https://metro.yudi.com.br/api',
    'http://localhost:3000/api',
    '/api',
  ])('authenticates notification GraphQL requests at %s', (baseUrl) => {
    expect(authorization(`${baseUrl}/`, `${baseUrl}/graphql`)).toBe(
      'Bearer account-token',
    );
  });

  it.each([
    'https://untrusted.example/api/graphql',
    'https://metro.yudi.com.br.evil.example/api/graphql',
    'https://metro.yudi.com.br/api-other/graphql',
    'https://metro.yudi.com.br/apigraphql',
    'http://metro.yudi.com.br/api/graphql',
  ])('does not send the account token to %s', (url) => {
    expect(authorization('https://metro.yudi.com.br/api', url)).toBeNull();
  });

  it('preserves authentication for same-origin relative API requests', () => {
    expect(authorization('https://metro.yudi.com.br/api', '/api/graphql')).toBe(
      'Bearer account-token',
    );
  });

  it('reads the current token for every request and omits it after logout', () => {
    const url = 'https://metro.yudi.com.br/api/graphql';
    for (const token of ['refreshed-token', null]) {
      firebaseIdToken.set(token);
      expect(authorization('https://metro.yudi.com.br/api', url)).toBe(
        token ? `Bearer ${token}` : null,
      );
    }
  });
});
