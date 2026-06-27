import { initializeApp, credential, ServiceAccount } from 'firebase-admin';
import { sharedEnvironment } from '@metro/shared/environment';

export function initializeFirebase() {
  const creds = process.env.FIREBASE_ADMIN_CREDENTIALS;

  if (sharedEnvironment.firebase.useEmulators) {
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] = 'localhost:9099';
  }

  initializeApp({
    projectId: sharedEnvironment.firebase.projectId,
    credential: creds
      ? credential.cert(JSON.parse(creds) as ServiceAccount)
      : credential.applicationDefault(),
  });
}
