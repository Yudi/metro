const getAuth = jest.fn();
const signInWithPopup = jest.fn();
const signInWithRedirect = jest.fn();
const signOut = jest.fn();

jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: jest.fn(),
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  signOut,
}));

import { AuthOperationResult, AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    service = Object.create(AuthService.prototype) as AuthService;
    (service as unknown as { platformId: string }).platformId = 'browser';
    getAuth.mockReturnValue({ emulatorConfig: {} });
    signInWithPopup.mockReset();
    signInWithRedirect.mockReset();
    signOut.mockReset();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('owns popup failures and returns a typed result', async () => {
    const error = new Error('popup closed');
    signInWithPopup.mockRejectedValue(error);

    const result: AuthOperationResult = await service.loginGoogle();

    expect(result).toEqual({ success: false, reason: 'failed', error });
    expect(signInWithRedirect).not.toHaveBeenCalled();
  });

  it('owns redirect and logout failures', async () => {
    getAuth.mockReturnValue({ emulatorConfig: undefined });
    signInWithRedirect.mockResolvedValue(undefined);
    signOut.mockRejectedValue(new Error('logout failed'));

    await expect(service.loginGoogle()).resolves.toEqual({ success: true });
    await expect(service.logout()).resolves.toMatchObject({
      success: false,
      reason: 'failed',
    });
  });
});
