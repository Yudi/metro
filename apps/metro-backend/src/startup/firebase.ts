import { credential, ServiceAccount } from 'firebase-admin';
import { getApps, initializeApp } from 'firebase-admin/app';
import { sharedEnvironment } from '@metro/shared/environment';

export function initializeFirebase(): void {
  if (getApps().length > 0) {
    return;
  }

  const creds = process.env.FIREBASE_ADMIN_CREDENTIALS;
  const configuredEmulatorHost =
    process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim();
  const useEmulator =
    Boolean(configuredEmulatorHost) || process.env.NODE_ENV !== 'production';

  if (useEmulator && !configuredEmulatorHost) {
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] = 'localhost:9099';
  }

  if (!creds && !useEmulator) {
    throw new Error(
      'FIREBASE_ADMIN_CREDENTIALS is required outside the Firebase Auth emulator',
    );
  }

  let serviceAccount: ServiceAccount | undefined;
  if (creds) {
    try {
      serviceAccount = JSON.parse(creds) as ServiceAccount;
    } catch (error) {
      const configurationError = new Error(
        'FIREBASE_ADMIN_CREDENTIALS must be valid JSON',
      );
      (configurationError as Error & { cause?: unknown }).cause = error;
      throw configurationError;
    }
  }

  initializeApp({
    projectId: sharedEnvironment.firebase.projectId,
    credential: serviceAccount
      ? credential.cert(serviceAccount)
      : credential.applicationDefault(),
  });
}
