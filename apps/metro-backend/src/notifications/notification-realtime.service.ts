import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type {
  NotificationConfigurationDeltaInput,
  NotificationConfigurationDeltaEvent,
  NotificationConfigurationRealtimeEvent,
  NotificationDevice,
  NotificationTrigger,
} from '@metro/shared/notification-contracts';

const NOTIFICATION_CONFIGURATION_CHANNEL = 'metro:notifications:configuration';
const NOTIFICATION_REVISION_KEY_PREFIX = 'metro:notifications:revision:';

// Assigning the version and publishing the message in one Redis script keeps
// concurrent commits ordered across backend replicas. The database mutation
// has already committed before this script is called.
const PUBLISH_DELTA_SCRIPT = `
  local revision = redis.call('INCR', KEYS[1])
  local envelope = cjson.decode(ARGV[2])
  envelope.event.delta.revision = revision
  redis.call('PUBLISH', ARGV[1], cjson.encode(envelope))
  return revision
`;

type NotificationRealtimeEnvelope = {
  userId: string;
  event: NotificationConfigurationDeltaEvent;
};

export type NotificationRealtimeListener = (
  userId: string,
  event: NotificationConfigurationRealtimeEvent,
) => void;

/**
 * Publishes account-scoped notification changes to every backend replica.
 *
 * Redis is used only as the cross-process transport and version allocator;
 * PostgreSQL remains the source of truth. Without Redis configuration,
 * process-local delivery supports development on a single replica. Configured
 * Redis interruptions are reconciled with database snapshots after recovery.
 */
@Injectable()
export class NotificationRealtimeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationRealtimeService.name);
  private readonly listeners = new Set<NotificationRealtimeListener>();
  private readonly localRevisions = new Map<string, number>();
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private redisStartup: Promise<void> | null = null;
  private redisRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private redisAvailable = false;
  private readonly distributedTransport: boolean;
  private readonly transportResetListeners = new Set<() => void>();
  private closed = false;

  constructor(private readonly config: ConfigService) {
    this.distributedTransport = Boolean(this.config.get('REDIS_URL'));
  }

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test' || !this.config.get('REDIS_URL')) {
      return;
    }

    this.redisStartup = this.startRedis();
    void this.redisStartup.catch(() => {
      // startRedis logs the failure and schedules another connection attempt.
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    if (this.redisRetryTimer) {
      clearTimeout(this.redisRetryTimer);
      this.redisRetryTimer = null;
    }
    await Promise.allSettled([
      this.publisher?.quit(),
      this.subscriber?.quit(),
      this.redisStartup,
    ]);
    this.publisher = null;
    this.subscriber = null;
    this.redisAvailable = false;
    this.listeners.clear();
    this.transportResetListeners.clear();
  }

  onEvent(listener: NotificationRealtimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Invoked after the Redis transport recovers. Any events published during
   * the outage may have been missed, so the gateway sends fresh snapshots to
   * its currently connected account sockets.
   */
  onTransportReset(listener: () => void): () => void {
    this.transportResetListeners.add(listener);
    return () => this.transportResetListeners.delete(listener);
  }

  async getCurrentRevision(userId: string): Promise<number> {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) {
      return 0;
    }

    if (this.redisAvailable && this.publisher) {
      try {
        const value = await this.publisher.get(revisionKey(normalizedUserId));
        const revision = Number(value ?? 0);
        if (Number.isSafeInteger(revision) && revision >= 0) {
          this.rememberRevision(normalizedUserId, revision);
          return revision;
        }
      } catch {
        this.markRedisUnavailable();
      }
    }

    return this.localRevisions.get(normalizedUserId) ?? 0;
  }

  async publishTriggerUpsert(
    userId: string,
    trigger: NotificationTrigger,
  ): Promise<number> {
    return this.publishDelta(userId, { type: 'trigger_upsert', trigger });
  }

  async publishTriggerRemove(
    userId: string,
    triggerId: string,
    triggerRevision: number,
  ): Promise<number> {
    return this.publishDelta(userId, {
      type: 'trigger_remove',
      triggerId,
      triggerRevision,
    });
  }

  async publishDeviceUpsert(
    userId: string,
    device: NotificationDevice,
  ): Promise<number> {
    return this.publishDelta(userId, { type: 'device_upsert', device });
  }

  async publishDeviceRemoved(
    userId: string,
    deviceId: string,
  ): Promise<number> {
    return this.publishDelta(userId, { type: 'device_remove', deviceId });
  }

  private async publishDelta(
    userId: string,
    input: NotificationConfigurationDeltaInput,
  ): Promise<number> {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) {
      return 0;
    }

    if (this.distributedTransport && !this.redisAvailable) {
      // A locally generated version would collide with versions allocated by
      // another replica. Let the HTTP mutation complete and let the next
      // socket snapshot reconcile it after Redis recovers.
      return 0;
    }

    if (this.redisAvailable && this.publisher) {
      try {
        const envelope: NotificationRealtimeEnvelope = {
          userId: normalizedUserId,
          event: {
            type: 'delta',
            delta: {
              ...input,
              revision: 0,
            } as NotificationRealtimeEnvelope['event']['delta'],
          },
        };
        const result = await this.publisher.eval(
          PUBLISH_DELTA_SCRIPT,
          1,
          revisionKey(normalizedUserId),
          NOTIFICATION_CONFIGURATION_CHANNEL,
          JSON.stringify(envelope),
        );
        const revision = Number(result);
        if (Number.isSafeInteger(revision) && revision > 0) {
          this.rememberRevision(normalizedUserId, revision);
          return revision;
        }
      } catch {
        this.markRedisUnavailable();
        return 0;
      }
    }

    const revision = (this.localRevisions.get(normalizedUserId) ?? 0) + 1;
    this.rememberRevision(normalizedUserId, revision);
    const event: NotificationConfigurationDeltaEvent = {
      type: 'delta',
      delta: {
        ...input,
        revision,
      } as NotificationRealtimeEnvelope['event']['delta'],
    };
    this.notify(normalizedUserId, event);
    return revision;
  }

  private async startRedis(): Promise<void> {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl || this.closed) {
      return;
    }

    const options = {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    } as const;
    const publisher = new Redis(redisUrl, options);
    const subscriber = new Redis(redisUrl, options);
    const reportError = () => {
      this.logger.warn(
        'Notification realtime Redis transport is unavailable; waiting for snapshot recovery.',
      );
    };
    publisher.on('error', reportError);
    subscriber.on('error', reportError);
    publisher.on('close', () => this.markRedisUnavailable());
    subscriber.on('close', () => this.markRedisUnavailable());
    publisher.on('ready', () => this.markRedisReadyIfConnected());
    subscriber.on('ready', () => this.markRedisReadyIfConnected());

    try {
      await publisher.connect();
      await subscriber.connect();
      await subscriber.subscribe(NOTIFICATION_CONFIGURATION_CHANNEL);
      subscriber.on('message', (channel, message) => {
        if (channel === NOTIFICATION_CONFIGURATION_CHANNEL) {
          this.handleRedisMessage(message);
        }
      });

      if (this.closed) {
        await Promise.allSettled([publisher.quit(), subscriber.quit()]);
        return;
      }

      this.publisher = publisher;
      this.subscriber = subscriber;
      this.redisAvailable = true;
      this.logger.debug('Notification realtime Redis transport connected.');
    } catch {
      await Promise.allSettled([publisher.quit(), subscriber.quit()]);
      this.redisAvailable = false;
      this.logger.warn(
        'Notification realtime Redis transport could not initialize; using local delivery.',
      );
      this.scheduleRedisRetry();
    }
  }

  private handleRedisMessage(message: string): void {
    let value: unknown;
    try {
      value = JSON.parse(message);
    } catch {
      return;
    }

    const envelope = parseEnvelope(value);
    if (!envelope) {
      return;
    }

    this.rememberRevision(envelope.userId, envelope.event.delta.revision);
    this.notify(envelope.userId, envelope.event);
  }

  private notify(
    userId: string,
    event: NotificationConfigurationRealtimeEvent,
  ): void {
    for (const listener of this.listeners) {
      try {
        listener(userId, event);
      } catch {
        this.logger.warn('Notification realtime listener failed.');
      }
    }
  }

  private rememberRevision(userId: string, revision: number): void {
    const current = this.localRevisions.get(userId) ?? 0;
    if (revision > current) {
      this.localRevisions.set(userId, revision);
    }
  }

  private markRedisUnavailable(): void {
    if (!this.distributedTransport || !this.redisAvailable) {
      return;
    }
    this.redisAvailable = false;
    this.logger.warn(
      'Notification realtime Redis transport disconnected; waiting for recovery.',
    );
  }

  private markRedisReadyIfConnected(): void {
    if (
      !this.distributedTransport ||
      !this.publisher ||
      !this.subscriber ||
      this.publisher.status !== 'ready' ||
      this.subscriber.status !== 'ready'
    ) {
      return;
    }

    const wasAvailable = this.redisAvailable;
    this.redisAvailable = true;
    if (!wasAvailable) {
      for (const listener of this.transportResetListeners) {
        try {
          listener();
        } catch {
          this.logger.warn('Notification realtime recovery listener failed.');
        }
      }
    }
  }

  private scheduleRedisRetry(): void {
    if (
      this.closed ||
      !this.distributedTransport ||
      this.redisRetryTimer !== null
    ) {
      return;
    }
    this.redisRetryTimer = setTimeout(() => {
      this.redisRetryTimer = null;
      this.redisStartup = this.startRedis();
      void this.redisStartup.catch(() => undefined);
    }, 5_000);
  }
}

function revisionKey(userId: string): string {
  return `${NOTIFICATION_REVISION_KEY_PREFIX}${userId}`;
}

function normalizeUserId(value: string): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    ? value
    : null;
}

function parseEnvelope(value: unknown): NotificationRealtimeEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const event = candidate['event'];
  if (
    typeof candidate['userId'] !== 'string' ||
    !normalizeUserId(candidate['userId']) ||
    !event ||
    typeof event !== 'object' ||
    Array.isArray(event)
  ) {
    return null;
  }
  const eventRecord = event as Record<string, unknown>;
  const delta = eventRecord['delta'];
  if (
    eventRecord['type'] !== 'delta' ||
    !delta ||
    typeof delta !== 'object' ||
    Array.isArray(delta)
  ) {
    return null;
  }
  const deltaRecord = delta as Record<string, unknown>;
  const revision = deltaRecord['revision'];
  const deltaType = deltaRecord['type'];
  if (
    !Number.isSafeInteger(revision) ||
    Number(revision) <= 0 ||
    (deltaType !== 'trigger_upsert' &&
      deltaType !== 'trigger_remove' &&
      deltaType !== 'device_upsert' &&
      deltaType !== 'device_remove')
  ) {
    return null;
  }
  return {
    userId: candidate['userId'],
    event: {
      type: 'delta',
      delta: deltaRecord as NotificationRealtimeEnvelope['event']['delta'],
    },
  };
}
