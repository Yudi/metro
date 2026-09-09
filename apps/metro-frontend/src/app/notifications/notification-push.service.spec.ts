import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { of } from 'rxjs';
import { NotificationPushService } from './notification-push.service';
import { notificationDeviceLabel } from './notification-device-label';

describe('NotificationPushService', () => {
  const requestSubscription = jest.fn();
  const unsubscribe = jest.fn();
  const subscription = {
    endpoint: 'https://push.example/subscription',
    getKey: jest.fn((name: string) =>
      name === 'p256dh'
        ? Uint8Array.from([1, 2, 3]).buffer
        : Uint8Array.from([4, 5, 6]).buffer,
    ),
  };

  beforeEach(() => {
    requestSubscription.mockReset();
    unsubscribe.mockReset();
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'default' },
    });
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        NotificationPushService,
        {
          provide: SwPush,
          useValue: {
            isEnabled: true,
            requestSubscription,
            unsubscribe,
            subscription: of(null),
          },
        },
      ],
    });
  });

  it('does not request permission while the service is constructed', () => {
    const service = TestBed.inject(NotificationPushService);

    expect(service.permission()).toBe('default');
    expect(requestSubscription).not.toHaveBeenCalled();
  });

  it('converts an explicit subscription request into the server payload', async () => {
    requestSubscription.mockResolvedValue(subscription);
    const service = TestBed.inject(NotificationPushService);

    await expect(service.requestSubscription('public-key')).resolves.toEqual({
      endpoint: 'https://push.example/subscription',
      label: notificationDeviceLabel(navigator.userAgent, navigator.maxTouchPoints),
      keys: { p256dh: 'AQID', auth: 'BAUG' },
    });
    expect(requestSubscription).toHaveBeenCalledWith({
      serverPublicKey: 'public-key',
    });
  });

  it('unsubscribes only when the browser currently has a subscription', async () => {
    const service = TestBed.inject(NotificationPushService);

    await service.unsubscribe();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('does not create an authorization when reading an absent subscription', async () => {
    const service = TestBed.inject(NotificationPushService);
    await expect(service.existingSubscription()).resolves.toBeNull();
    expect(requestSubscription).not.toHaveBeenCalled();
  });

  it('summarizes an existing subscription without requesting permission', async () => {
    TestBed.overrideProvider(SwPush, {
      useValue: { isEnabled: true, requestSubscription, subscription: of(subscription) },
    });
    const service = TestBed.inject(NotificationPushService);
    await expect(service.existingSubscription()).resolves.toEqual({
      endpoint: subscription.endpoint,
      label: notificationDeviceLabel(navigator.userAgent, navigator.maxTouchPoints),
      keys: { p256dh: 'AQID', auth: 'BAUG' },
    });
    expect(requestSubscription).not.toHaveBeenCalled();
  });
});
