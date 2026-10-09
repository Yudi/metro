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
      address: string;
      auth: Record<string, unknown>;
      headers: Record<string, string>;
    };
    conn: { remoteAddress: string };
    join: jest.Mock;
    emit: jest.Mock;
    disconnect: jest.Mock;
  } {
    return {
      connected: true,
      data: {},
      handshake: {
        address: '192.0.2.1',
        auth: token ? { token } : {},
        headers: {},
      },
      conn: { remoteAddress: '192.0.2.1' },
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

  it('limits concurrent sockets for one account even across different IPs', async () => {
    const sockets = Array.from({ length: 6 }, (_, index) => {
      const socket = client('signed-token');
      socket.handshake.address = `192.0.2.${index + 1}`;
      return socket;
    });
    await Promise.all(
      sockets.map((socket) => gateway.handleConnection(socket as never)),
    );

    expect(settings.getConfiguration).toHaveBeenCalledTimes(5);
    expect(sockets[5].disconnect).toHaveBeenCalledTimes(1);
  });

  it('limits concurrent connections by IP before authentication completes', async () => {
    let resolveAuth!: (userId: string) => void;
    auth.verifyToken.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveAuth = resolve;
      }),
    );
    const sockets = Array.from({ length: 11 }, () => client('signed-token'));
    const connections = sockets.map((socket) =>
      gateway.handleConnection(socket as never),
    );

    expect(auth.verifyToken).toHaveBeenCalledTimes(10);
    expect(sockets[10].disconnect).toHaveBeenCalledTimes(1);
    resolveAuth('account-a');
    await Promise.all(connections);
    expect(settings.getConfiguration).toHaveBeenCalledTimes(5);
  });

  it('keeps pending authentication reserved after a client disconnects', async () => {
    let resolveAuth!: (userId: string) => void;
    auth.verifyToken.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveAuth = resolve;
      }),
    );
    const sockets = Array.from({ length: 10 }, () => client('signed-token'));
    const connections = sockets.map((socket) =>
      gateway.handleConnection(socket as never),
    );
    for (const socket of sockets) {
      socket.connected = false;
      gateway.handleDisconnect(socket as never);
    }
    const blocked = client('signed-token');
    await gateway.handleConnection(blocked as never);
    expect(auth.verifyToken).toHaveBeenCalledTimes(10);
    expect(blocked.disconnect).toHaveBeenCalledTimes(1);

    resolveAuth('account-a');
    await Promise.all(connections);
    auth.verifyToken.mockResolvedValue('account-a');
    await gateway.handleConnection(client('signed-token') as never);
    expect(settings.getConfiguration).toHaveBeenCalledTimes(1);
  });

  it('throttles connection attempts before token verification and resets the window', async () => {
    jest.useFakeTimers();
    try {
      for (let index = 0; index < 30; index += 1) {
        const socket = client('signed-token');
        await gateway.handleConnection(socket as never);
        gateway.handleDisconnect(socket as never);
      }
      const blocked = client('signed-token');
      await gateway.handleConnection(blocked as never);
      expect(auth.verifyToken).toHaveBeenCalledTimes(30);
      expect(blocked.disconnect).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(60_000);
      await gateway.handleConnection(client('signed-token') as never);
      expect(auth.verifyToken).toHaveBeenCalledTimes(31);
    } finally {
      jest.useRealTimers();
    }
  });

  it('releases account reservations exactly once on disconnect', async () => {
    const sockets = Array.from({ length: 5 }, () => client('signed-token'));
    await Promise.all(
      sockets.map((socket) => gateway.handleConnection(socket as never)),
    );
    gateway.handleDisconnect(sockets[0] as never);
    gateway.handleDisconnect(sockets[0] as never);
    const replacement = client('signed-token');
    await gateway.handleConnection(replacement as never);
    const blocked = client('signed-token');
    await gateway.handleConnection(blocked as never);
    expect(replacement.disconnect).not.toHaveBeenCalled();
    expect(blocked.disconnect).toHaveBeenCalledTimes(1);
  });

  it.each(['auth', 'join', 'snapshot'])(
    'releases reservations after a %s failure',
    async (stage) => {
      if (stage === 'auth') {
        auth.verifyToken.mockRejectedValueOnce(new Error('Invalid token'));
      }
      if (stage === 'snapshot') {
        settings.getConfiguration.mockRejectedValueOnce(new Error('Unavailable'));
      }
      const failed = client('signed-token');
      if (stage === 'join') {
        failed.join.mockRejectedValueOnce(new Error('Unable to join'));
      }
      await gateway.handleConnection(failed as never);
      expect(failed.disconnect).toHaveBeenCalledTimes(1);
      expect(failed.data).toEqual({});

      const sockets = Array.from({ length: 5 }, () => client('signed-token'));
      await Promise.all(
        sockets.map((socket) => gateway.handleConnection(socket as never)),
      );
      expect(
        sockets.every((socket) => socket.disconnect.mock.calls.length === 0),
      ).toBe(true);
    },
  );

  it('keeps account reservations until pending snapshots finish', async () => {
    let resolveSnapshot!: (value: NotificationConfiguration) => void;
    settings.getConfiguration.mockReturnValue(
      new Promise<NotificationConfiguration>((resolve) => {
        resolveSnapshot = resolve;
      }),
    );
    const sockets = Array.from({ length: 5 }, () => client('signed-token'));
    const connections = sockets.map((socket) =>
      gateway.handleConnection(socket as never),
    );
    await new Promise((resolve) => setImmediate(resolve));
    for (const socket of sockets) {
      socket.connected = false;
      gateway.handleDisconnect(socket as never);
    }
    const blocked = client('signed-token');
    await gateway.handleConnection(blocked as never);
    expect(blocked.disconnect).toHaveBeenCalledTimes(1);
    expect(settings.getConfiguration).toHaveBeenCalledTimes(5);

    resolveSnapshot(configuration);
    await Promise.all(connections);
    await gateway.handleConnection(client('signed-token') as never);
    expect(settings.getConfiguration).toHaveBeenCalledTimes(6);
  });

  it('bounds tracked IPs and recovers capacity after the attempt window expires', async () => {
    jest.useFakeTimers();
    try {
      for (let index = 0; index < 10_000; index += 1) {
        const socket = client();
        socket.handshake.address = `address-${index}`;
        await gateway.handleConnection(socket as never);
      }
      const socket = client('signed-token');
      await gateway.handleConnection(socket as never);
      expect(socket.disconnect).toHaveBeenCalledTimes(1);
      expect(auth.verifyToken).not.toHaveBeenCalled();

      jest.advanceTimersByTime(60_000);
      await gateway.handleConnection(client('signed-token') as never);
      expect(auth.verifyToken).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not use client-supplied forwarding headers to bypass the IP limit', async () => {
    auth.verifyToken.mockImplementation(async () =>
      `account-${auth.verifyToken.mock.calls.length}`,
    );
    const sockets = Array.from({ length: 11 }, (_, index) => {
      const socket = client('signed-token');
      socket.handshake.headers['x-forwarded-for'] = `192.0.2.${index + 1}`;
      return socket;
    });
    for (const socket of sockets) {
      await gateway.handleConnection(socket as never);
    }
    expect(auth.verifyToken).toHaveBeenCalledTimes(10);
    expect(settings.getConfiguration).toHaveBeenCalledTimes(10);
    expect(sockets[10].disconnect).toHaveBeenCalledTimes(1);
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
