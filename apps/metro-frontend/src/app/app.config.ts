import {
  ApplicationConfig,
  provideAppInitializer,
  provideZonelessChangeDetection,
  inject,
  isDevMode,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { DashboardRouteReuseStrategy } from './insights-dashboard/dashboard-route-reuse.strategy';

import { AnonymousFavoritesImportPromptService } from './favorites/anonymous-favorites-import-prompt.service';

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

import { MatIconRegistry } from '@angular/material/icon';
import { provideServiceWorker } from '@angular/service-worker';
import {
  createFirebaseAuthInterceptor,
  provideAuth,
  provideFirebase,
} from '@metro/shared/firebase';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideAppInitializer(() => {
      inject(AnonymousFavoritesImportPromptService);
    }),
    provideBrowserGlobalErrorListeners(),
    ErrorTrackingService,
    { provide: ErrorHandler, useClass: TelemetryErrorHandler },
    provideFirebase(environment.firebase),
    provideRouter(routes),
    { provide: RouteReuseStrategy, useClass: DashboardRouteReuseStrategy },
    provideClientHydration(withEventReplay()),
    provideHttpClient(
      withFetch(),
      withInterceptors([
        createFirebaseAuthInterceptor(environment.apiUrl),
        graphqlQueryTimeoutInterceptor,
      ]),
    ),
    { provide: API_BASE_URL, useValue: environment.apiUrl },
    {
      provide: 'ICON_FONT_SETUP',
      useFactory: () => {
        const registry = inject(MatIconRegistry);
        registry.setDefaultFontSetClass('material-symbols-outlined');
        return true;
      },
    },
    provideServiceWorker('notification-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
      type: 'classic',
    }),
    provideAuth(environment.firebase),
  ],
};
