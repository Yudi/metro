import type { NotificationConfiguration } from '@metro/shared/notification-contracts';
import {
  NOTIFICATION_CONFIGURATION_DELTA_EVENT,
  NOTIFICATION_CONFIGURATION_SNAPSHOT_EVENT,
} from '@metro/shared/notification-contracts';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationRealtimeService } from './notification-realtime.service';
import { NotificationSettingsService } from './notification-settings.service';
import { AuthService } from '../user/auth.service';

const configuration: NotificationConfiguration = {
  revision: 2,
  available: true,
  publicKey: null,
  triggers: [],
  devices: [],
};

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let auth: { verifyToken: jest.Mock };
  let settings: { getConfiguration: jest.Mock };
  let realtime: {
    onEvent: jest.Mock;
    onTransportReset: jest.Mock;
  };
  let onEvent: ((userId: string, event: unknown) => void) | undefined;
  let onTransportReset: (() => void) | undefined;
  let room: { emit: jest.Mock };

  beforeEach(() => {
    auth = { verifyToken: jest.fn().mockResolvedValue('account-a') };
    settings = { getConfiguration: jest.fn().mockResolvedValue(configuration) };
    onEvent = undefined;
    onTransportReset = undefined;
    realtime = {
      onEvent: jest.fn((listener) => {
        onEvent = listener;
        return jest.fn();
      }),
      onTransportReset: jest.fn((listener) => {
        onTransportReset = listener;
        return jest.fn();
      }),
    };
    gateway = new NotificationsGateway(
      auth as unknown as AuthService,
      settings as unknown as NotificationSettingsService,
      realtime as unknown as NotificationRealtimeService,
    );
    room = { emit: jest.fn() };
    gateway.server = {
      to: jest.fn().mockReturnValue(room),
      sockets: new Map(),
    } as never;
  });

  function client(token?: string): {
    connected: boolean;
    data: Record<string, unknown>;
    handshake: {
      auth: Record<string, unknown>;
      headers: Record<string, string>;
    };
    join: jest.Mock;
    emit: jest.Mock;
    disconnect: jest.Mock;
  } {
    return {
      connected: true,
      data: {},
      handshake: { auth: token ? { token } : {}, headers: {} },
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
  }

  it('rejects a socket without a Firebase token before reading account data', async () => {
    const socket = client();
    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(auth.verifyToken).not.toHaveBeenCalled();
    expect(settings.getConfiguration).not.toHaveBeenCalled();
  });

  it('verifies the handshake, joins only the account room, and emits an initial snapshot', async () => {
    const socket = client('signed-token');
    await gateway.handleConnection(socket as never);

    expect(auth.verifyToken).toHaveBeenCalledWith('signed-token');
    expect(socket.join).toHaveBeenCalledWith('notification-account:account-a');
    expect(socket.emit).toHaveBeenCalledWith(
      NOTIFICATION_CONFIGURATION_SNAPSHOT_EVENT,
      { type: 'snapshot', configuration },
    );
  });

  it('broadcasts a delta only to the verified account room and omits account identity from payload', () => {
    onEvent?.('account-a', {
      type: 'delta',
      delta: { type: 'device_remove', deviceId: 'device-a', revision: 3 },
    });

    expect(gateway.server.to).toHaveBeenCalledWith(
      'notification-account:account-a',
    );
    expect(room.emit).toHaveBeenCalledWith(
      NOTIFICATION_CONFIGURATION_DELTA_EVENT,
      expect.objectContaining({ type: 'delta' }),
    );
    expect(JSON.stringify(room.emit.mock.calls[0])).not.toContain('account-a');
  });

  it('serves an authenticated resync snapshot without trusting request body data', async () => {
    const socket = client('signed-token');
    await gateway.handleConnection(socket as never);
    socket.emit.mockClear();
    settings.getConfiguration.mockResolvedValueOnce({
      ...configuration,
      revision: 4,
    });

    await gateway.handleResync(socket as never, { userId: 'other-account' });

    expect(settings.getConfiguration).toHaveBeenCalledWith('account-a');
    expect(socket.emit).toHaveBeenCalledWith(
      NOTIFICATION_CONFIGURATION_SNAPSHOT_EVENT,
      { type: 'snapshot', configuration: { ...configuration, revision: 4 } },
    );
  });

  it('resynchronizes connected clients after Redis subscriber recovery', async () => {
    const first = client('signed-token');
    const second = client('signed-token');
    (gateway.server.sockets as unknown as Map<string, unknown>).set(
      'one',
      first,
    );
    (gateway.server.sockets as unknown as Map<string, unknown>).set(
      'two',
      second,
    );
    await gateway.handleConnection(first as never);
    await gateway.handleConnection(second as never);
    first.emit.mockClear();
    second.emit.mockClear();
    settings.getConfiguration.mockResolvedValue({
      ...configuration,
      revision: 5,
    });

    onTransportReset?.();
    await new Promise((resolve) => setImmediate(resolve));

    expect(first.emit).toHaveBeenCalledWith(
      NOTIFICATION_CONFIGURATION_SNAPSHOT_EVENT,
      { type: 'snapshot', configuration: { ...configuration, revision: 5 } },
    );
    expect(second.emit).toHaveBeenCalledWith(
      NOTIFICATION_CONFIGURATION_SNAPSHOT_EVENT,
      { type: 'snapshot', configuration: { ...configuration, revision: 5 } },
    );
  });

  it('disconnects only this namespace on token expiry or snapshot failure', async () => {
    jest.useFakeTimers();
    const exp = Math.floor(Date.now() / 1000) + 1;
    const payload = Buffer.from(JSON.stringify({ exp }), 'utf8').toString(
      'base64url',
    );
    const socket = client(`header.${payload}.signature`);
    await gateway.handleConnection(socket as never);
    jest.advanceTimersByTime(2_000);
    expect(socket.disconnect).toHaveBeenCalledWith();
    jest.useRealTimers();
  });
});
