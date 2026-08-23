import { signal } from '@angular/core';
import { GeolocationService } from './geolocation.service';

jest.mock('@metro/shared/api', () => ({
  LoggerService: class LoggerServiceMock {},
}));

describe('GeolocationService', () => {
  let permissionChangeHandler: (() => void) | undefined;
  let permissionStatus: PermissionStatus;
  let getCurrentPosition: jest.Mock;

  beforeEach(() => {
    permissionStatus = {
      state: 'prompt',
      addEventListener: jest.fn((_event, handler) => {
        permissionChangeHandler = handler as () => void;
      }),
      removeEventListener: jest.fn(),
    } as unknown as PermissionStatus;
    getCurrentPosition = jest.fn();

    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: jest.fn().mockResolvedValue(permissionStatus),
      },
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition,
        watchPosition: jest.fn(),
        clearWatch: jest.fn(),
      },
    });
  });

  it('shares one browser lookup between concurrent callers', async () => {
    let resolvePosition: ((position: GeolocationPosition) => void) | undefined;
    getCurrentPosition.mockImplementation((resolve) => {
      resolvePosition = resolve;
    });
    const service = createService();
    const first = service.requestLocation();
    const second = service.requestLocation();

    expect(second).toBe(first);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    const position = {
      coords: {
        latitude: -23.55,
        longitude: -46.63,
        accuracy: 10,
      },
      timestamp: 123,
    } as GeolocationPosition;
    resolvePosition?.(position);

    await expect(first).resolves.toEqual({
      latitude: -23.55,
      longitude: -46.63,
      accuracy: 10,
      timestamp: 123,
    });
    await expect(second).resolves.toEqual(await first);
    expect(service.isRequesting()).toBe(false);
  });

  it('removes the permission listener on destroy', async () => {
    const service = createService();
    await (
      service as unknown as { initializePermissionState(): Promise<void> }
    ).initializePermissionState();

    expect(permissionChangeHandler).toBeDefined();
    service.ngOnDestroy();

    expect(permissionStatus.removeEventListener).toHaveBeenCalledWith(
      'change',
      permissionChangeHandler,
    );
  });
});

function createService(): GeolocationService {
  const service = Object.create(
    GeolocationService.prototype,
  ) as GeolocationService;
  Object.assign(service, {
    platformId: 'browser',
    ngZone: { run: (callback: () => void) => callback() },
    logger: { warn: jest.fn(), error: jest.fn() },
    watchId: null,
    orientationHandler: null,
    permissionStatus: null,
    permissionChangeHandler: null,
    locationRequest: null,
    destroyed: false,
    permission: signal('prompt'),
    location: signal(null),
    orientation: signal(null),
    isRequesting: signal(false),
    isTracking: signal(false),
    isTrackingOrientation: signal(false),
    isSupported: () => true,
    isOrientationSupported: () => false,
  });
  return service;
}
