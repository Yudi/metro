import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable, Logger, OnModuleDestroy, UseGuards } from '@nestjs/common';
import { Namespace, Socket } from 'socket.io';
import {
  NOTIFICATION_CONFIGURATION_DELTA_EVENT,
  NOTIFICATION_CONFIGURATION_RESYNC_EVENT,
  NOTIFICATION_CONFIGURATION_SNAPSHOT_EVENT,
  NotificationConfigurationSnapshotEvent,
  NotificationConfigurationRealtimeEvent,
} from '@metro/shared/notification-contracts';
import { WsThrottlerGuard } from '../common/guards/ws-throttler.guard';
import { AuthService } from '../user/auth.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationRealtimeService } from './notification-realtime.service';

const NOTIFICATION_NAMESPACE = '/notifications';
const NOTIFICATION_ROOM_PREFIX = 'notification-account:';
const CONNECTION_ATTEMPT_WINDOW_MS = 60_000;
const MAX_CONNECTION_ATTEMPTS_PER_IP = 30;
const MAX_CONNECTIONS_PER_IP = 10;
const MAX_CONNECTIONS_PER_USER = 5;
const MAX_TRACKED_IPS = 10_000;

type ConnectionAttempts = { count: number; windowStartedAt: number };

type AuthenticatedSocket = Socket & {
  data: Socket['data'] & {
    connectionIp?: string;
    connectionPending?: boolean;
    userId?: string;
    tokenExpiryTimer?: NodeJS.Timeout;
  };
};

/**
 * Authenticated account settings stream for notification configuration.
 * Every client is joined to a room derived from the verified Firebase uid;
 * no public namespace or broadcast is used for these payloads.
 */
@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  namespace: NOTIFICATION_NAMESPACE,
  path: '/api/socket.io',
  cors: {
    origin:
      process.env.NODE_ENV === 'production' ? 'https://metro.yudi.com.br' : '*',
  },
})
@Injectable()
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Namespace;

  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly removeRealtimeListener: () => void;
  private readonly removeTransportResetListener: () => void;
  private readonly connectionAttemptsByIp = new Map<string, ConnectionAttempts>();
  private readonly connectionsByIp = new Map<string, number>();
  private readonly connectionsByUser = new Map<string, number>();
  private lastAttemptPruneAt = 0;

  constructor(
    private readonly auth: AuthService,
    private readonly settings: NotificationSettingsService,
    private readonly realtime: NotificationRealtimeService,
  ) {
    this.removeRealtimeListener = this.realtime.onEvent((userId, event) =>
      this.broadcastDelta(userId, event),
    );
    this.removeTransportResetListener = this.realtime.onTransportReset(() => {
      void this.resyncConnectedClients();
    });
  }

  onModuleDestroy(): void {
    this.removeRealtimeListener();
    this.removeTransportResetListener();
    this.connectionAttemptsByIp.clear();
    this.connectionsByIp.clear();
    this.connectionsByUser.clear();
  }

  async handleConnection(client: Socket): Promise<void> {
    const socket = client as AuthenticatedSocket;
    const ip = socket.handshake.address || socket.conn.remoteAddress || 'unknown';
    if (!this.reserveIpConnection(socket, ip)) {
      this.rejectConnection(socket);
      return;
    }

    socket.data.connectionPending = true;
    let accepted = false;
    try {
      const token = extractSocketToken(socket);
      if (!token) {
        this.rejectConnection(socket);
        return;
      }

      let userId: false | string;
      try {
        userId = await this.auth.verifyToken(token);
      } catch {
        this.rejectConnection(socket);
        return;
      }

      if (
        !userId ||
        !socket.connected ||
        !this.reserveUserConnection(socket, userId)
      ) {
        this.rejectConnection(socket);
        return;
      }

      this.scheduleTokenExpiry(socket, token);
      try {
        await socket.join(accountRoom(userId));
        await this.sendSnapshot(socket);
        accepted = true;
      } catch {
        this.logger.warn('Unable to send notification settings snapshot.');
        this.rejectConnection(socket);
      }
    } finally {
      delete socket.data.connectionPending;
      if (!accepted || !socket.connected) {
        this.handleDisconnect(socket);
      }
    }
  }

  handleDisconnect(client: Socket): void {
    const socket = client as AuthenticatedSocket;
    if (socket.data.tokenExpiryTimer) {
      clearTimeout(socket.data.tokenExpiryTimer);
      delete socket.data.tokenExpiryTimer;
    }
    // Keep reservations until pending auth/snapshot work settles. Otherwise a
    // client could disconnect and immediately start more expensive work.
    if (!socket.data.connectionPending) {
      this.releaseConnection(socket);
    }
  }

  @SubscribeMessage(NOTIFICATION_CONFIGURATION_RESYNC_EVENT)
  async handleResync(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    void body;
    const socket = client as AuthenticatedSocket;
    if (!socket.data.userId || !socket.connected) {
      return;
    }

    try {
      await this.sendSnapshot(socket);
    } catch {
      // The next reconnect will retry the authoritative snapshot. Do not
      // expose database details through a socket error payload.
      socket.disconnect();
    }
  }

  private async sendSnapshot(client: AuthenticatedSocket): Promise<void> {
    const userId = client.data.userId;
    if (!userId || !client.connected) {
      return;
    }

    const event: NotificationConfigurationSnapshotEvent = {
      type: 'snapshot',
      configuration: await this.settings.getConfiguration(userId),
    };
    if (!client.connected || client.data.userId !== userId) {
      return;
    }
    client.emit(NOTIFICATION_CONFIGURATION_SNAPSHOT_EVENT, event);
  }

  private async resyncConnectedClients(): Promise<void> {
    if (!this.server) {
      return;
    }

    const sockets = this.server.sockets as unknown as Map<string, Socket>;
    for (const socket of sockets.values()) {
      const client = socket as AuthenticatedSocket;
      if (!client.data.userId || !client.connected) {
        continue;
      }
      try {
        await this.sendSnapshot(client);
      } catch {
        client.disconnect();
      }
    }
  }

  private broadcastDelta(
    userId: string,
    event: NotificationConfigurationRealtimeEvent,
  ): void {
    if (!this.server || event.type !== 'delta') {
      return;
    }

    // The account id is used only as an internal room key. The payload sent
    // to a socket contains the safe public delta and never the room identity.
    this.server
      .to(accountRoom(userId))
      .emit(NOTIFICATION_CONFIGURATION_DELTA_EVENT, event);
  }

  private rejectConnection(client: AuthenticatedSocket): void {
    client.disconnect();
  }

  private reserveIpConnection(client: AuthenticatedSocket, ip: string): boolean {
    const now = Date.now();
    if (now - this.lastAttemptPruneAt >= CONNECTION_ATTEMPT_WINDOW_MS) {
      this.lastAttemptPruneAt = now;
      for (const [address, attempts] of this.connectionAttemptsByIp) {
        if (now - attempts.windowStartedAt >= CONNECTION_ATTEMPT_WINDOW_MS) {
          this.connectionAttemptsByIp.delete(address);
        }
      }
    }

    let attempts = this.connectionAttemptsByIp.get(ip);
    if (
      !attempts ||
      now - attempts.windowStartedAt >= CONNECTION_ATTEMPT_WINDOW_MS
    ) {
      if (!attempts && this.connectionAttemptsByIp.size >= MAX_TRACKED_IPS) {
        return false;
      }
      attempts = { count: 0, windowStartedAt: now };
      this.connectionAttemptsByIp.set(ip, attempts);
    }
    if (attempts.count >= MAX_CONNECTION_ATTEMPTS_PER_IP) {
      return false;
    }
    attempts.count += 1;

    const connections = this.connectionsByIp.get(ip) ?? 0;
    if (connections >= MAX_CONNECTIONS_PER_IP) {
      return false;
    }
    this.connectionsByIp.set(ip, connections + 1);
    client.data.connectionIp = ip;
    return true;
  }

  private reserveUserConnection(
    client: AuthenticatedSocket,
    userId: string,
  ): boolean {
    const connections = this.connectionsByUser.get(userId) ?? 0;
    if (connections >= MAX_CONNECTIONS_PER_USER) {
      return false;
    }
    this.connectionsByUser.set(userId, connections + 1);
    client.data.userId = userId;
    return true;
  }

  private releaseConnection(client: AuthenticatedSocket): void {
    const ip = client.data.connectionIp;
    if (ip) {
      decrementCounter(this.connectionsByIp, ip);
      delete client.data.connectionIp;
    }
    const userId = client.data.userId;
    if (userId) {
      decrementCounter(this.connectionsByUser, userId);
      delete client.data.userId;
    }
  }

  private scheduleTokenExpiry(
    client: AuthenticatedSocket,
    token: string,
  ): void {
    const expiresAt = tokenExpiry(token);
    if (expiresAt === null) {
      return;
    }
    const delay = Math.max(0, expiresAt - Date.now() + 1_000);
    client.data.tokenExpiryTimer = setTimeout(() => {
      client.disconnect();
    }, delay);
  }
}

function decrementCounter(counts: Map<string, number>, key: string): void {
  const next = (counts.get(key) ?? 1) - 1;
  if (next > 0) {
    counts.set(key, next);
  } else {
    counts.delete(key);
  }
}

function accountRoom(userId: string): string {
  return `${NOTIFICATION_ROOM_PREFIX}${userId}`;
}

function extractSocketToken(client: AuthenticatedSocket): string | null {
  const auth = client.handshake.auth;
  const authRecord =
    auth && typeof auth === 'object' && !Array.isArray(auth)
      ? (auth as Record<string, unknown>)
      : null;
  const authorization = authRecord?.['authorization'];
  const token = authRecord?.['token'] ?? authorization;
  if (typeof token === 'string' && token.trim()) {
    return stripBearer(token.trim());
  }

  const header = client.handshake.headers.authorization;
  return typeof header === 'string' && header.trim()
    ? stripBearer(header.trim())
    : null;
}

function stripBearer(value: string): string {
  return value.replace(/^Bearer\s+/iu, '').trim();
}

function tokenExpiry(token: string): number | null {
  const pieces = token.split('.');
  if (pieces.length !== 3) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(pieces[1], 'base64url').toString('utf8'),
    ) as unknown;
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('exp' in payload) ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp)
    ) {
      return null;
    }
    return payload.exp * 1_000;
  } catch {
    return null;
  }
}
