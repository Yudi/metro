import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import {
  AuthService,
  authReady,
  firebaseIdToken,
  firebaseUser,
} from '@metro/shared/firebase';
import { NotificationApiService } from '@metro/shared/api';
import type {
  NotificationConfiguration,
  NotificationConfigurationDelta,
  NotificationConfigurationRealtimeEvent,
  NotificationTrigger,
} from '@metro/shared/notification-contracts';
import { NotificationPushService } from './notification-push.service';
import { NotificationWebsocketService } from './notification-websocket.service';
import { NotificationsComponent } from './notifications.component';

describe('notification page realtime consistency', () => {
  let fixture: ComponentFixture<NotificationsComponent>;
  let page: NotificationsComponent;
  let events: Subject<NotificationConfigurationRealtimeEvent>;
  let api: {
    getConfiguration: jest.Mock;
    saveTrigger: jest.Mock;
    registerDevice: jest.Mock;
  };
  let socket: {
    events$: Subject<NotificationConfigurationRealtimeEvent>;
    connect: jest.Mock;
    disconnect: jest.Mock;
    requestResync: jest.Mock;
    connected: ReturnType<typeof signal<boolean>>;
  };
  const storageKey = 'metro.notifications.device.realtime-user';
  const trigger: NotificationTrigger = {
    id: 'trigger-one',
    revision: 2,
    name: 'Ida',
    enabled: true,
    days: [1],
    windows: [{ start: '07:00', end: '09:00' }],
    timezone: 'America/Sao_Paulo',
    smart: false,
    leadMinutes: 0,
    intervalMinutes: 15,
    kind: 'rail_status',
    targetIds: ['line-one'],
    statusMode: 'all',
    targets: [
      {
        id: 'line-one',
        kind: 'rail_line',
        label: 'Linha 1',
        available: true,
        railLineCode: 1,
      },
    ],
  };
  const configuration: NotificationConfiguration = {
    revision: 10,
    available: true,
    publicKey: 'key',
    triggers: [trigger],
    devices: [
      {
        id: 'device-one',
        label: 'Chrome · Windows',
        createdAt: '2026-09-08T12:00:00Z',
      },
    ],
  };

  beforeEach(async () => {
    authReady.set(true);
    firebaseUser.set({ uid: 'realtime-user' } as never);
    firebaseIdToken.set('first-token');
    window.localStorage.setItem(storageKey, 'device-one');
    events = new Subject<NotificationConfigurationRealtimeEvent>();
    socket = {
      events$: events,
      connect: jest.fn(),
      disconnect: jest.fn(),
      requestResync: jest.fn(),
      connected: signal(true),
    };
    api = {
      getConfiguration: jest.fn().mockReturnValue(of(configuration)),
      saveTrigger: jest.fn(),
      registerDevice: jest.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        { provide: NotificationApiService, useValue: api },
        { provide: NotificationWebsocketService, useValue: socket },
        { provide: AuthService, useValue: { loginGoogle: jest.fn() } },
        {
          provide: NotificationPushService,
          useValue: {
            permission: signal('granted'),
            supported: signal(true),
            refreshPermission: jest.fn(),
            existingSubscription: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    })
      .overrideComponent(NotificationsComponent, { set: { template: '' } })
      .compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    events.complete();
    authReady.set(false);
    firebaseUser.set(null);
    firebaseIdToken.set(null);
    window.localStorage.removeItem(storageKey);
  });

  function delta(change: NotificationConfigurationDelta): void {
    events.next({ type: 'delta', delta: change });
  }

  it('applies another device change without another HTTP configuration request', () => {
    delta({
      type: 'trigger_upsert',
      revision: 11,
      trigger: { ...trigger, revision: 3, name: 'Volta' },
    });
    expect(page.triggers()[0].name).toBe('Volta');
    expect(api.getConfiguration).toHaveBeenCalledTimes(1);
  });

  it('resynchronizes a missing delta instead of applying an incomplete sequence', () => {
    delta({
      type: 'trigger_upsert',
      revision: 12,
      trigger: { ...trigger, revision: 4, name: 'Volta' },
    });
    expect(socket.requestResync).toHaveBeenCalledTimes(1);
    expect(page.triggers()[0].name).toBe('Ida');
    events.next({
      type: 'snapshot',
      configuration: { ...configuration, revision: 12, triggers: [] },
    });
    expect(page.triggers()).toEqual([]);
    expect(page.configuration()?.revision).toBe(12);
  });

  it('retries synchronization if its snapshot is older than an already observed delta', () => {
    delta({
      type: 'trigger_upsert',
      revision: 13,
      trigger: { ...trigger, revision: 5, name: 'Volta' },
    });
    events.next({
      type: 'snapshot',
      configuration: { ...configuration, revision: 12 },
    });
    expect(socket.requestResync).toHaveBeenCalledTimes(2);
    events.next({
      type: 'snapshot',
      configuration: {
        ...configuration,
        revision: 13,
        triggers: [{ ...trigger, revision: 5, name: 'Volta' }],
      },
    });
    expect(page.triggers()[0].name).toBe('Volta');
  });

  it('keeps the editor open when the same account refreshes its token', async () => {
    page.editTrigger(trigger);
    firebaseIdToken.set('refreshed-token');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(page.editingTriggerId()).toBe(trigger.id);
    expect(socket.connect).toHaveBeenLastCalledWith(
      'realtime-user',
      'refreshed-token',
    );
    expect(api.getConfiguration).toHaveBeenCalledTimes(1);
  });

  it('does not restore a remotely deleted trigger from a late mutation response', () => {
    const response = new Subject<NotificationTrigger>();
    api.saveTrigger.mockReturnValue(response);
    page.saveTrigger({
      id: trigger.id,
      expectedRevision: trigger.revision,
      input: trigger,
    });
    delta({
      type: 'trigger_remove',
      revision: 11,
      triggerId: trigger.id,
      triggerRevision: 3,
    });
    response.next({ ...trigger, revision: 3 });
    response.complete();
    expect(page.triggers()).toEqual([]);
  });

  it('does not restore a deleted trigger when an earlier commit publishes late', () => {
    delta({
      type: 'trigger_remove',
      revision: 11,
      triggerId: trigger.id,
      triggerRevision: 3,
    });
    delta({
      type: 'trigger_upsert',
      revision: 12,
      trigger: { ...trigger, revision: 3 },
    });
    expect(page.triggers()).toEqual([]);
    expect(page.configuration()?.revision).toBe(12);
  });

  it('clears a removed current device and ignores a late upsert for its deleted ID', () => {
    delta({ type: 'device_remove', revision: 11, deviceId: 'device-one' });
    expect(page.deviceId()).toBeNull();
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    delta({
      type: 'device_upsert',
      revision: 12,
      device: configuration.devices[0],
    });
    expect(page.devices()).toEqual([]);
  });

  it('does not close the editor when a stale HTTP snapshot finishes after a delta', () => {
    const response = new Subject<NotificationConfiguration>();
    api.getConfiguration.mockReturnValue(response);
    page.editTrigger(trigger);
    page.refreshConfiguration();
    delta({
      type: 'trigger_upsert',
      revision: 11,
      trigger: { ...trigger, revision: 3 },
    });
    response.next({ ...configuration, triggers: [], devices: [] });
    response.complete();
    expect(page.triggers()).toHaveLength(1);
    expect(page.editingTriggerId()).toBe(trigger.id);
    expect(page.deviceId()).toBe('device-one');
  });

  it('accepts a reconnect snapshot after a locally saved trigger was deleted elsewhere', () => {
    const saved = { ...trigger, revision: 3 };
    api.saveTrigger.mockReturnValue(of(saved));
    page.saveTrigger({
      id: trigger.id,
      expectedRevision: trigger.revision,
      input: trigger,
    });
    delta({ type: 'trigger_upsert', revision: 11, trigger: saved });
    events.next({
      type: 'snapshot',
      configuration: { ...configuration, revision: 12, triggers: [] },
    });
    expect(page.triggers()).toEqual([]);
  });

  it('keeps a successful socket snapshot visible if an older HTTP request fails', () => {
    const response = new Subject<NotificationConfiguration>();
    api.getConfiguration.mockReturnValue(response);
    page.refreshConfiguration();
    events.next({
      type: 'snapshot',
      configuration: { ...configuration, revision: 11 },
    });
    response.error(new Error('Old HTTP request failed'));
    expect(page.pageState()).toBe('ready');
    expect(page.errorMessage()).toBeNull();
  });

  it('disconnects the account stream when the page is destroyed', () => {
    socket.disconnect.mockClear();
    fixture.destroy();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('upgrades the current generic device label once without requesting permission', async () => {
    const existing = jest.mocked(
      TestBed.inject(NotificationPushService).existingSubscription,
    );
    existing.mockResolvedValue({
      endpoint: 'https://push.example/device',
      label: 'Safari · iOS',
      keys: { p256dh: 'key', auth: 'key' },
    });
    api.registerDevice.mockReturnValue(of('device-one'));
    const genericConfiguration = {
      ...configuration,
      revision: 11,
      devices: [{ ...configuration.devices[0], label: 'Dispositivo' }],
    };
    events.next({ type: 'snapshot', configuration: genericConfiguration });
    await fixture.whenStable();
    await Promise.resolve();
    expect(existing).toHaveBeenCalledTimes(1);
    expect(api.registerDevice).toHaveBeenCalledTimes(1);
    expect(page.currentDevice()?.label).toBe('Safari · iOS');
    events.next({ type: 'snapshot', configuration: genericConfiguration });
    await fixture.whenStable();
    expect(api.registerDevice).toHaveBeenCalledTimes(1);
  });
});
