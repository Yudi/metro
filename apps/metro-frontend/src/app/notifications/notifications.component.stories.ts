import { signal } from '@angular/core';
import { applicationConfig, Meta, StoryObj } from '@storybook/angular';
import { of, throwError } from 'rxjs';
import { AuthService, authReady, firebaseIdToken, firebaseUser } from '@metro/shared/firebase';
import { NotificationApiService } from '@metro/shared/api';
import type {
  NotificationConfiguration,
  NotificationTriggerInput,
  NotificationTrigger,
} from '@metro/shared/notification-contracts';
import {
  NotificationPermissionState,
  NotificationPushService,
} from './notification-push.service';
import { NotificationsComponent } from './notifications.component';

const storyTrigger: NotificationTrigger & { arrivalLeadMinutes: number } = {
  id: 'story-trigger',
  revision: 3,
  name: 'Minha ida para a faculdade',
  enabled: true,
  days: [1, 2, 3, 4, 5],
  windows: [{ start: '06:30', end: '09:00' }],
  timezone: 'America/Sao_Paulo',
  smart: true,
  leadMinutes: 15,
  arrivalLeadMinutes: 5,
  intervalMinutes: 15,
  kind: 'rail_status',
  targetIds: ['line-opaque'],
  statusMode: 'abnormal',
  targets: [
    {
      id: 'line-opaque',
      kind: 'rail_line',
      label: 'Linha 9 - Esmeralda',
      available: true,
    },
  ],
};

const baseConfiguration: NotificationConfiguration = {
  available: true,
  publicKey: 'story-public-key',
  triggers: [storyTrigger],
  devices: [],
};

const meta: Meta<NotificationsComponent> = {
  title: 'Pages/Notifications',
  component: NotificationsComponent,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<NotificationsComponent>;

function storyProviders(
  configuration: NotificationConfiguration | null,
  options: {
    authenticated?: boolean;
    permission?: NotificationPermissionState;
    supported?: boolean;
    error?: boolean;
  } = {},
) {
  let state: NotificationConfiguration | null = configuration
    ? {
        ...configuration,
        triggers: [...configuration.triggers],
        devices: [...configuration.devices],
      }
    : null;
  const permission = signal<NotificationPermissionState>(
    options.permission ?? 'default',
  );
  const supported = signal(options.supported ?? true);
  const api = {
    getConfiguration: () =>
      options.error
        ? throwError(() => new Error('Serviço indisponível'))
        : of(state),
    saveTrigger: (
      input: NotificationTriggerInput,
      id?: string,
    ) => {
      if (!state) {
        return of(input);
      }

      const current = id
        ? state.triggers.find((trigger) => trigger.id === id)
        : undefined;
      const saved = {
        ...input,
        id: id ?? `story-trigger-${state.triggers.length + 1}`,
        revision: (current?.revision ?? 0) + 1,
        targets: input.targetIds
          .map((targetId) =>
            storyTrigger.targets.find((target) => target.id === targetId),
          )
          .filter((target): target is NotificationTrigger['targets'][number] => !!target),
      } as unknown as NotificationTrigger;
      state = {
        ...state,
        triggers: current
          ? state.triggers.map((trigger) =>
              trigger.id === saved.id ? saved : trigger,
            )
          : [...state.triggers, saved],
      };
      return of(saved);
    },
    getTargets: () => of(storyTrigger.targets),
    deleteTrigger: (id: string) => {
      if (state) {
        state = {
          ...state,
          triggers: state.triggers.filter((trigger) => trigger.id !== id),
        };
      }
      return of(true);
    },
    registerDevice: () => {
      const id = 'story-device';
      if (state && !state.devices.some((device) => device.id === id)) {
        state = {
          ...state,
          devices: [
            ...state.devices,
            {
              id,
              label: 'Este dispositivo',
              createdAt: '2026-09-08T10:00:00.000Z',
            },
          ],
        };
      }
      return of(id);
    },
    removeDevice: (id: string) => {
      if (state) {
        state = {
          ...state,
          devices: state.devices.filter((device) => device.id !== id),
        };
      }
      return of(true);
    },
  };

  return [
    applicationConfig({
      providers: [
        { provide: NotificationApiService, useValue: api },
        {
          provide: NotificationPushService,
          useValue: {
            permission: permission.asReadonly(),
            supported: supported.asReadonly(),
            requestSubscription: () =>
              Promise.resolve({
                endpoint: 'https://push.example/story',
                keys: { p256dh: 'key', auth: 'auth' },
              }),
            unsubscribe: () => Promise.resolve(),
            refreshPermission: () => undefined,
          },
        },
        { provide: AuthService, useValue: { loginGoogle: () => undefined } },
      ],
    }),
  ];
}

function storyRender(authenticated = true, deviceId?: string) {
  return () => {
    // Keep auth signals deterministic for each story render.
    authReady.set(true);
    firebaseUser.set(authenticated ? ({ uid: 'story-user' } as never) : null);
    firebaseIdToken.set(authenticated ? 'story-token' : null);
    if (deviceId) {
      window.localStorage.setItem(
        'metro.notifications.device.story-user',
        deviceId,
      );
    } else {
      window.localStorage.removeItem(
        'metro.notifications.device.story-user',
      );
    }
    return { props: {} };
  };
}

export const AvisoConfigurado: Story = {
  decorators: storyProviders(baseConfiguration),
  render: storyRender(),
};

export const PushAtivo: Story = {
  decorators: storyProviders({
    ...baseConfiguration,
    devices: [
      {
        id: 'story-device',
        label: 'Chrome neste computador',
        createdAt: '2026-09-08T10:00:00.000Z',
      },
    ],
  }, { permission: 'granted' }),
  render: storyRender(true, 'story-device'),
};

export const EntregaIndisponivel: Story = {
  decorators: storyProviders({
    ...baseConfiguration,
    available: false,
    publicKey: null,
  }),
  render: storyRender(),
};

export const NavegadorIncompativel: Story = {
  decorators: storyProviders(baseConfiguration, { supported: false }),
  render: storyRender(),
};

export const PermissaoBloqueada: Story = {
  decorators: storyProviders(baseConfiguration, { permission: 'denied' }),
  render: storyRender(),
};

export const SemLogin: Story = {
  decorators: storyProviders(null, { authenticated: false }),
  render: storyRender(false),
};

export const ErroAoCarregar: Story = {
  decorators: storyProviders(null, { error: true }),
  render: storyRender(),
};
