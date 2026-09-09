import type { Namespace, Socket } from 'socket.io';
import type {
  NotificationConfiguration,
  NotificationConfigurationRealtimeEvent,
} from '@metro/shared/notification-contracts';
import { AuthService } from '../user/auth.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationRealtimeService } from './notification-realtime.service';
import { NotificationsGateway } from './notifications.gateway';

/** Gateway boundary integration with deterministic auth and socket adapters. */
describe('notification gateway account isolation', () => {
  const now = new Date('2026-09-08T12:00:00Z');
  const configuration: NotificationConfiguration = {
    revision: 1,
    available: true,
    publicKey: 'public',
    triggers: [],
    devices: [],
  };
  const token = `header.${Buffer.from(JSON.stringify({ exp: now.getTime() / 1_000 + 60 })).toString('base64url')}.signature`;
  let gateway: NotificationsGateway;
  let verifyToken: jest.Mock;
  let getConfiguration: jest.Mock;
  let onEvent: (
    userId: string,
    event: NotificationConfigurationRealtimeEvent,
  ) => void;
  let onReset: () => void;
  let to: jest.Mock;
  let emit: jest.Mock;
  let socket: Socket;
  let removeEvent: jest.Mock;
  let removeReset: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    verifyToken = jest.fn().mockResolvedValue('verified-user');
    getConfiguration = jest.fn().mockResolvedValue(configuration);
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    removeEvent = jest.fn();
    removeReset = jest.fn();
    gateway = new NotificationsGateway(
      { verifyToken } as unknown as AuthService,
      { getConfiguration } as unknown as NotificationSettingsService,
      {
        onEvent: (callback: typeof onEvent) => {
          onEvent = callback;
          return removeEvent;
        },
        onTransportReset: (callback: typeof onReset) => {
          onReset = callback;
          return removeReset;
        },
      } as unknown as NotificationRealtimeService,
    );
    socket = {
      id: 'socket-one',
      connected: true,
      data: {},
      handshake: { auth: { token, userId: 'untrusted-user' }, headers: {} },
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket;
    gateway.server = {
      to,
      sockets: new Map([[socket.id, socket]]),
    } as unknown as Namespace;
  });

  afterEach(() => {
    gateway.handleDisconnect(socket);
    gateway.onModuleDestroy();
    jest.useRealTimers();
  });

  it('derives the private room from the verified token, ignoring claimed account IDs', async () => {
    await gateway.handleConnection(socket);
    expect(verifyToken).toHaveBeenCalledWith(token);
    expect(socket.join).toHaveBeenCalledWith(
      'notification-account:verified-user',
    );
    expect(getConfiguration).toHaveBeenCalledWith('verified-user');
    expect(socket.emit).toHaveBeenCalledWith(
      'notification_configuration_snapshot',
      { type: 'snapshot', configuration },
    );
    expect(to).not.toHaveBeenCalled();
  });

  it.each([false, new Error('Invalid token')])(
    'rejects failed token verification before subscribing: %s',
    async (result) => {
      if (result instanceof Error) verifyToken.mockRejectedValue(result);
      else verifyToken.mockResolvedValue(result);
      await gateway.handleConnection(socket);
      expect(socket.disconnect).toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
      expect(getConfiguration).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing token without reading account data', async () => {
    socket.handshake.auth = {};
    await gateway.handleConnection(socket);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(getConfiguration).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('sends deltas only to the owning account room', () => {
    const event: NotificationConfigurationRealtimeEvent = {
      type: 'delta',
      delta: { revision: 2, type: 'device_remove', deviceId: 'device-one' },
    };
    onEvent('other-user', event);
    expect(to).toHaveBeenCalledWith('notification-account:other-user');
    expect(emit).toHaveBeenCalledWith(
      'notification_configuration_delta',
      event,
    );
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('does not emit a snapshot after the requesting socket disconnects', async () => {
    let resolveSnapshot!: (value: NotificationConfiguration) => void;
    getConfiguration.mockReturnValue(
      new Promise<NotificationConfiguration>((resolve) => {
        resolveSnapshot = resolve;
      }),
    );
    const connection = gateway.handleConnection(socket);
    await Promise.resolve();
    await Promise.resolve();
    socket.connected = false;
    gateway.handleDisconnect(socket);
    resolveSnapshot(configuration);
    await connection;
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('closes the authenticated namespace when its verified token expires', async () => {
    await gateway.handleConnection(socket);
    jest.advanceTimersByTime(61_001);
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalledWith(true);
  });

  it('refreshes connected accounts after transport recovery', async () => {
    await gateway.handleConnection(socket);
    getConfiguration.mockClear();
    onReset();
    await Promise.resolve();
    expect(getConfiguration).toHaveBeenCalledWith('verified-user');
  });
});
