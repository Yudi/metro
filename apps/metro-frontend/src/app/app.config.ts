import {
  ApplicationConfig,
  provideZonelessChangeDetection,
  inject,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { provideApollo } from 'apollo-angular';
import { ApolloLink, InMemoryCache } from '@apollo/client/core';
import { HttpLink } from 'apollo-angular/http';
import { API_BASE_URL } from '@metro/shared/api';
import { environment } from '../environments/environment';

import { MatIconRegistry } from '@angular/material/icon';
import { provideServiceWorker } from '@angular/service-worker';
import {
  firebaseAuthInterceptor,
  provideAuth,
  provideFirebase,
} from '@metro/shared/firebase';
import { SetContextLink } from '@apollo/client/link/context';
import { firebaseIdToken } from '@metro/shared/firebase';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideFirebase(environment.firebase),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch(), withInterceptors([firebaseAuthInterceptor])),
    provideApollo(() => {
      const httpLink = inject(HttpLink);

      const basic = new SetContextLink(() => ({
        headers: {
          Accept: 'charset=utf-8',
        },
      }));

      const auth = new SetContextLink(() => {
        const token = firebaseIdToken();
        if (!token) return {};

        return {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        };
      });

      const uri = `${environment.apiUrl}/graphql`;
      const link = httpLink.create({ uri }) as unknown as ApolloLink;

      return {
        link: ApolloLink.from([basic, auth, link]),
        cache: new InMemoryCache(),
        defaultOptions: {
          query: {
            errorPolicy: 'all',
          },
        },
      };
    }),
    { provide: API_BASE_URL, useValue: environment.apiUrl },
    {
      provide: 'ICON_FONT_SETUP',
      useFactory: () => {
        const registry = inject(MatIconRegistry);
        registry.setDefaultFontSetClass('material-symbols-outlined');
        return true;
      },
    },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
      type: 'module',
    }),
    provideAuth(environment.firebase),
  ],
};
