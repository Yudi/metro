import { InjectionToken, makeEnvironmentProviders } from '@angular/core';
import {
  FirebaseApp,
  FirebaseOptions,
  getApp,
  getApps,
  initializeApp,
} from 'firebase/app';

const FIREBASE_APP = new InjectionToken<FirebaseApp>('FirebaseApp');

export function provideFirebase(config: FirebaseOptions) {
  const normalizedConfig: FirebaseOptions = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    measurementId: config.measurementId,
    databaseURL: config.databaseURL,
  };

  const app = getApps().length > 0 ? getApp() : initializeApp(normalizedConfig);

  return makeEnvironmentProviders([{ provide: FIREBASE_APP, useValue: app }]);
}
