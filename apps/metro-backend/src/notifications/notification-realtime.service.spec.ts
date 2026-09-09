import { ConfigService } from '@nestjs/config';
import type {
  NotificationTrigger,
} from '@metro/shared/notification-contracts';
import { NotificationRealtimeService } from './notification-realtime.service';

const trigger: NotificationTrigger = {
  id: '018f3a37-9c5e-7a8b-8c2d-000000000002',
  revision: 3,
  name: 'Linha 1',
  enabled: true,
  days: [1],
  windows: [{ start: '08:00', end: '09:00' }],
  timezone: 'America/Sao_Paulo',
  smart: false,
  leadMinutes: 0,
  intervalMinutes: 15,
  kind: 'rail_status',
  targetIds: ['018f3a37-9c5e-7a8b-8c2d-000000000001'],
  statusMode: 'all',
  targets: [],
};

describe('NotificationRealtimeService', () => {
  it('allocates local revisions and publishes only the safe delta in development fallback', async () => {
    const service = new NotificationRealtimeService(new ConfigService({}));
    const received: Array<{ userId: string; event: unknown }> = [];
    service.onEvent((userId, event) => received.push({ userId, event }));

    await expect(service.publishTriggerUpsert('account-a', trigger)).resolves.toBe(1);
    await expect(
      service.publishDeviceRemoved('account-a', '018f3a37-9c5e-7a8b-8c2d-000000000003'),
    ).resolves.toBe(2);
    await expect(service.getCurrentRevision('account-a')).resolves.toBe(2);

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({
      userId: 'account-a',
      event: {
        type: 'delta',
        delta: { type: 'trigger_upsert', trigger, revision: 1 },
      },
    });
    expect(received[1].event).toEqual({
      type: 'delta',
      delta: {
        type: 'device_remove',
        deviceId: '018f3a37-9c5e-7a8b-8c2d-000000000003',
        revision: 2,
      },
    });
  });

  it('does not invent process-local revisions when distributed Redis is configured but unavailable', async () => {
    const service = new NotificationRealtimeService(
      new ConfigService({ REDIS_URL: 'redis://unavailable.invalid:6379' }),
    );
    const listener = jest.fn();
    service.onEvent(listener);

    await expect(service.publishTriggerUpsert('account-a', trigger)).resolves.toBe(0);
    await expect(service.getCurrentRevision('account-a')).resolves.toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('allocates and publishes a distributed revision atomically through the Redis script', async () => {
    const service = new NotificationRealtimeService(
      new ConfigService({ REDIS_URL: 'redis://redis.example:6379' }),
    );
    const publisher = {
      eval: jest.fn().mockResolvedValue(9),
    };
    const internals = service as unknown as {
      publisher: typeof publisher;
      redisAvailable: boolean;
    };
    internals.publisher = publisher;
    internals.redisAvailable = true;

    await expect(service.publishTriggerUpsert('account-a', trigger)).resolves.toBe(9);

    expect(publisher.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('PUBLISH'"),
      1,
      'metro:notifications:revision:account-a',
      'metro:notifications:configuration',
      expect.stringContaining('"revision":0'),
    );
  });

  it('notifies the gateway when both Redis clients recover after an outage', () => {
    const service = new NotificationRealtimeService(
      new ConfigService({ REDIS_URL: 'redis://redis.example:6379' }),
    );
    const recovered = jest.fn();
    service.onTransportReset(recovered);
    const internals = service as unknown as {
      publisher: { status: string };
      subscriber: { status: string };
      redisAvailable: boolean;
      markRedisReadyIfConnected: () => void;
    };
    internals.publisher = { status: 'ready' };
    internals.subscriber = { status: 'ready' };
    internals.redisAvailable = false;

    internals.markRedisReadyIfConnected();

    expect(recovered).toHaveBeenCalledTimes(1);
  });
});
