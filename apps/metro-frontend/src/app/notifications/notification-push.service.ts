import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  PLATFORM_ID,
  Service,
  inject,
  signal,
} from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, take } from 'rxjs';
import type { NotificationPushInput } from '@metro/shared/notification-contracts';
import { notificationDeviceLabel } from './notification-device-label';

export type NotificationPermissionState =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied';

/**
 * Browser-only seam for Web Push. Reading permission is safe during startup;
 * requesting permission is deliberately exposed only as an explicit method.
 */
@Service()
export class NotificationPushService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly swPush = inject(SwPush, { optional: true });

  private readonly _permission = signal<NotificationPermissionState>(
    this.readPermission(),
  );

  readonly permission = this._permission.asReadonly();
  readonly supported = computed(() => this.permission() !== 'unsupported');

  refreshPermission(): void {
    this._permission.set(this.readPermission());
  }

  async requestSubscription(
    publicKey: string,
  ): Promise<NotificationPushInput> {
    if (!this.supported() || !this.swPush) {
      throw new Error('Este navegador não oferece notificações push.');
    }

    const subscription = await this.swPush.requestSubscription({
      serverPublicKey: publicKey,
    });
    this.refreshPermission();
    return this.subscriptionInput(subscription);
  }

  /** Read an existing authorization without prompting or creating a subscription. */
  async existingSubscription(): Promise<NotificationPushInput | null> {
    if (!isPlatformBrowser(this.platformId) || !this.swPush?.isEnabled) {
      return null;
    }
    const subscription = await firstValueFrom(this.swPush.subscription.pipe(take(1)));
    return subscription ? this.subscriptionInput(subscription) : null;
  }

  private subscriptionInput(subscription: PushSubscription): NotificationPushInput {
    const p256dh = subscription.getKey('p256dh');
    const auth = subscription.getKey('auth');

    if (!p256dh || !auth) {
      throw new Error('O navegador não forneceu as chaves da assinatura.');
    }

    return {
      endpoint: subscription.endpoint,
      label: notificationDeviceLabel(navigator.userAgent, navigator.maxTouchPoints),
      keys: {
        p256dh: encodeBase64Url(p256dh),
        auth: encodeBase64Url(auth),
      },
    };
  }

  async unsubscribe(): Promise<void> {
    if (!this.swPush?.isEnabled) {
      return;
    }

    const subscription = await firstValueFrom(
      this.swPush.subscription.pipe(take(1)),
    );

    if (subscription) {
      await this.swPush.unsubscribe();
    }

    this.refreshPermission();
  }

  private readPermission(): NotificationPermissionState {
    if (
      !isPlatformBrowser(this.platformId) ||
      !this.swPush?.isEnabled ||
      typeof window === 'undefined' ||
      typeof window.Notification === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      return 'unsupported';
    }

    switch (window.Notification.permission) {
      case 'granted':
        return 'granted';
      case 'denied':
        return 'denied';
      default:
        return 'default';
    }
  }
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}
