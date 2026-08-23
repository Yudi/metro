const getApps = jest.fn();
const initializeApp = jest.fn();
const cert = jest.fn((serviceAccount: unknown) => ({ serviceAccount }));
const applicationDefault = jest.fn(() => ({ applicationDefault: true }));

jest.mock('firebase-admin/app', () => ({
  getApps,
  initializeApp,
}));

jest.mock('firebase-admin', () => ({
  credential: {
    cert,
    applicationDefault,
  },
}));

import { initializeFirebase } from './firebase';

describe('initializeFirebase', () => {
  const originalCredentials = process.env.FIREBASE_ADMIN_CREDENTIALS;
  const originalNodeEnvironment = process.env.NODE_ENV;
  const originalEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FIREBASE_ADMIN_CREDENTIALS;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    process.env.NODE_ENV = 'test';
    getApps.mockReturnValue([]);
  });

  afterAll(() => {
    if (originalCredentials === undefined) {
      delete process.env.FIREBASE_ADMIN_CREDENTIALS;
    } else {
      process.env.FIREBASE_ADMIN_CREDENTIALS = originalCredentials;
    }
    if (originalNodeEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnvironment;
    }
    if (originalEmulatorHost === undefined) {
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    } else {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = originalEmulatorHost;
    }
  });

  it('initializes the emulator app once and is idempotent', () => {
    initializeFirebase();
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(applicationDefault).toHaveBeenCalledTimes(1);

    getApps.mockReturnValue([{}]);
    initializeFirebase();
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });

  it('fails before startup when admin credentials are malformed', () => {
    process.env.FIREBASE_ADMIN_CREDENTIALS = '{malformed';

    expect(() => initializeFirebase()).toThrow(
      'FIREBASE_ADMIN_CREDENTIALS must be valid JSON',
    );
    expect(initializeApp).not.toHaveBeenCalled();
  });

  it('does not silently enable the emulator in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => initializeFirebase()).toThrow(
      'FIREBASE_ADMIN_CREDENTIALS is required outside the Firebase Auth emulator',
    );
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeUndefined();
    expect(initializeApp).not.toHaveBeenCalled();
  });
});
