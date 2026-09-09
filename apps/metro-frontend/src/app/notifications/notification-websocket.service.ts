import { isPlatformBrowser } from '@angular/common';
import {
  OnDestroy,
  PLATFORM_ID,
  Service,
  inject,
  signal,
} from '@angular/core';
import { LoggerService } from '@metro/shared/api';
import type {
  NotificationConfigurationRealtimeEvent,
  NotificationConfigurationSnapshotEvent,
} from '@metro/shared/notification-contracts';
import {
  NOTIFICATION_CONFIGURATION_DELTA_EVENT,
  NOTIFICATION_CONFIGURATION_RESYNC_EVENT,
  NOTIFICATION_CONFIGURATION_SNAPSHOT_EVENT,
} from '@metro/shared/notification-contracts';
import { io, Socket } from 'socket.io-client';
import { Subject } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Authenticated Socket.IO transport for notification settings. The owning
 * page supplies the current Firebase uid/token so a token refresh can tear
 * down the old connection before opening a new account session.
 */
@Service()
export class NotificationWebsocketService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger = inject(LoggerService);
  private readonly eventsSubject = new Subject<NotificationConfigurationRealtimeEvent>();
  private readonly socketUrl = environment.apiUrl.replace(/\/api$/, '');
  private readonly namespace = '/notifications';
  private socket: Socket | null = null;
  private connectedUserId: string | null = null;
  private connectedToken: string | null = null;

  readonly events$ = this.eventsSubject.asObservable();
  readonly connected = signal(false);

  connect(userId: string, token: string): void {
    if (!isPlatformBrowser(this.platformId) || !userId || !token) {
      return;
    }
    if (
      this.socket &&
      this.connectedUserId === userId &&
      this.connectedToken === token
    ) {
      return;
    }

    this.disconnect();
    this.connectedUserId = userId;
    this.connectedToken = token;

    const socket = io(this.socketUrl + this.namespace, {
      path: '/api/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      reconnectionAttempts: Infinity,
    });
    this.socket = socket;

    socket.on('connect', () => {
      if (this.socket !== socket) {
        return;
      }
      this.connected.set(true);
      this.logger.debug('Connected to notification settings WebSocket.');
    });
    socket.on('disconnect', () => {
      if (this.socket !== socket) {
        return;
      }
      this.connected.set(false);
      this.logger.debug('Disconnected from notification settings WebSocket.');
    });
    socket.on('connect_error', (error: unknown) => {
      if (this.socket === socket) {
        this.connected.set(false);
        this.logger.warn('Notification settings WebSocket connection failed.', error);
      }
    });
    socket.on(
      NOTIFICATION_CONFIGURATION_SNAPSHOT_EVENT,
      (payload: unknown) => {
        const event = parseSnapshot(payload);
        if (event && this.socket === socket) {
          this.eventsSubject.next(event);
        }
      },
    );
    socket.on(NOTIFICATION_CONFIGURATION_DELTA_EVENT, (payload: unknown) => {
      const event = parseDelta(payload);
      if (event && this.socket === socket) {
        this.eventsSubject.next(event);
      }
    });
  }

  requestResync(): void {
    if (this.socket?.connected) {
      this.socket.emit(NOTIFICATION_CONFIGURATION_RESYNC_EVENT, {});
    }
  }

  disconnect(): void {
    const socket = this.socket;
    this.socket = null;
    this.connectedUserId = null;
    this.connectedToken = null;
    this.connected.set(false);
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.eventsSubject.complete();
  }
}

function parseSnapshot(
  value: unknown,
): NotificationConfigurationSnapshotEvent | null {
  if (!isRecord(value) || value['type'] !== 'snapshot') {
    return null;
  }
  const configuration = value['configuration'];
  if (!isRecord(configuration)) {
    return null;
  }
  const revision = configuration['revision'];
  if (!Number.isSafeInteger(revision) || Number(revision) < 0) {
    return null;
  }
  return value as unknown as NotificationConfigurationSnapshotEvent;
}

function parseDelta(value: unknown): NotificationConfigurationRealtimeEvent | null {
  if (!isRecord(value) || value['type'] !== 'delta') {
    return null;
  }
  const delta = value['delta'];
  if (!isRecord(delta)) {
    return null;
  }
  const revision = delta['revision'];
  const type = delta['type'];
  if (
    !Number.isSafeInteger(revision) ||
    Number(revision) <= 0 ||
    (type !== 'trigger_upsert' &&
      type !== 'trigger_remove' &&
      type !== 'device_upsert' &&
      type !== 'device_remove')
  ) {
    return null;
  }
  return value as unknown as NotificationConfigurationRealtimeEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
