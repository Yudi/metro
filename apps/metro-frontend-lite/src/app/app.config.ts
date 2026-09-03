import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  isDevMode,
  ErrorHandler,
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
import {
  API_BASE_URL,
  ErrorTrackingService,
  graphqlQueryTimeoutInterceptor,
  TelemetryErrorHandler,
} from '@metro/shared/api';
import { environment } from '../environments/environment';
import { provideServiceWorker } from '@angular/service-worker';
import {
  firebaseAuthInterceptor,
  provideAuth,
  provideFirebase,
} from '@metro/shared/firebase';

export const appConfig: ApplicationConfig = {
  providers: [
    provideClientHydration(withEventReplay()),
    provideBrowserGlobalErrorListeners(),
    ErrorTrackingService,
    { provide: ErrorHandler, useClass: TelemetryErrorHandler },
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideFirebase(environment.firebase),
    provideHttpClient(
      withFetch(),
      withInterceptors([
        firebaseAuthInterceptor,
        graphqlQueryTimeoutInterceptor,
      ]),
    ),
    { provide: API_BASE_URL, useValue: environment.apiUrl },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
      type: 'module',
    }),
    provideAuth(environment.firebase),
  ],
};
