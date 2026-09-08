import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AuthService, authReady, firebaseIdToken, firebaseUser } from '@metro/shared/firebase';
import { NotificationApiError, NotificationApiService } from '@metro/shared/api';
import type {
  NotificationConfiguration,
  NotificationTrigger,
  NotificationTriggerInput,
} from '@metro/shared/notification-contracts';
import { NotificationPermissionState, NotificationPushService } from './notification-push.service';
import { NotificationsComponent } from './notifications.component';

describe('NotificationsComponent', () => {
  let fixture: ComponentFixture<NotificationsComponent>;
  let component: NotificationsComponent;
  let api: {
    getConfiguration: jest.Mock;
    saveTrigger: jest.Mock;
    deleteTrigger: jest.Mock;
    registerDevice: jest.Mock;
    removeDevice: jest.Mock;
  };
  let requestSubscription: jest.Mock;

  const triggerInput: NotificationTriggerInput = {
    name: 'Ida para a faculdade',
    enabled: true,
    days: [1, 2, 3, 4, 5],
    windows: [{ start: '07:00', end: '09:00' }],
    timezone: 'America/Sao_Paulo',
    smart: true,
    leadMinutes: 15,
    intervalMinutes: 15,
    kind: 'rail_status',
    targetIds: ['line-opaque'],
    statusMode: 'abnormal',
  };

  const trigger: NotificationTrigger = {
    ...triggerInput,
    id: 'trigger-1',
    revision: 2,
    targets: [
      {
        id: 'line-opaque',
        kind: 'rail_line',
        label: 'Linha 9 - Esmeralda',
        available: true,
      },
    ],
  };

  const configuration: NotificationConfiguration = {
    available: true,
    publicKey: 'public-key',
    triggers: [trigger],
    devices: [],
  };

  beforeEach(async () => {
    authReady.set(true);
    firebaseUser.set({ uid: 'user-a' } as never);
    firebaseIdToken.set('token-a');

    api = {
      getConfiguration: jest.fn().mockReturnValue(of(configuration)),
      saveTrigger: jest.fn(),
      deleteTrigger: jest.fn(),
      registerDevice: jest.fn(),
      removeDevice: jest.fn(),
    };
    requestSubscription = jest.fn();
    const permission = signal<NotificationPermissionState>('default');
    const supported = signal(true);

    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        { provide: NotificationApiService, useValue: api },
        {
          provide: NotificationPushService,
          useValue: {
            permission: permission.asReadonly(),
            supported: supported.asReadonly(),
            requestSubscription,
            unsubscribe: jest.fn().mockResolvedValue(undefined),
            refreshPermission: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: { loginGoogle: jest.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    authReady.set(false);
    firebaseUser.set(null);
    firebaseIdToken.set(null);
  });

  it('loads cloud triggers without requesting browser permission on init', () => {
    expect(api.getConfiguration).toHaveBeenCalledTimes(1);
    expect(component.triggers()).toEqual([trigger]);
    expect(requestSubscription).not.toHaveBeenCalled();
  });
  it('keeps a pending deletion subscribed when another trigger is toggled or saved', () => {
    const deletion = new Subject<boolean>();
    api.deleteTrigger.mockReturnValue(deletion);
    component.deleteTrigger(trigger);
    component.toggleTrigger({ ...trigger, id: 'other' }, false);
    component.saveTrigger({ input: triggerInput });
    expect(api.saveTrigger).not.toHaveBeenCalled();
    deletion.next(true);
    deletion.complete();
    expect(component.deletingTriggerId()).toBeNull();
    expect(component.triggers()).toEqual([]);
  });
  it('releases an old-account browser subscription without silently transferring it', async () => {
    requestSubscription.mockResolvedValue({ endpoint: 'https://push.example/test', keys: { p256dh: 'key', auth: 'auth' } });
    api.registerDevice.mockReturnValue(throwError(() => new NotificationApiError('Este navegador já está vinculado a outra conta.')));
    await component.enableNotifications();
    expect(TestBed.inject(NotificationPushService).unsubscribe).toHaveBeenCalledTimes(1);
    expect(component.pushError()).toContain('Ativar notificações novamente');
    expect(api.registerDevice).toHaveBeenCalledTimes(1);
  });

  it('saves a trigger through the API and updates the list', async () => {
    const savedTrigger = { ...trigger, name: 'Novo nome', revision: 3 };
    api.saveTrigger.mockReturnValue(of(savedTrigger));

    component.saveTrigger({
      input: { ...triggerInput, name: 'Novo nome' },
      id: trigger.id,
      expectedRevision: trigger.revision,
    });
    await fixture.whenStable();

    expect(api.saveTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Novo nome' }),
      'trigger-1',
      2,
    );
    expect(component.triggers()[0].name).toBe('Novo nome');
  });

  it('clears the previous account while Firebase publishes a new account', async () => {
    firebaseIdToken.set(null);
    firebaseUser.set({ uid: 'user-b' } as never);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.configuration()).toBeNull();
    expect(component.editingTriggerId()).toBeNull();
  });

  it('refreshes after a revision conflict and explains the recovery', async () => {
    api.saveTrigger.mockReturnValue(
      throwError(() => new NotificationApiError('revision mismatch')),
    );

    component.saveTrigger({
      input: triggerInput,
      id: trigger.id,
      expectedRevision: trigger.revision,
    });
    await fixture.whenStable();

    expect(component.operationError()).toContain('alterado em outro dispositivo');
    expect(api.getConfiguration).toHaveBeenCalledTimes(2);
  });
});
