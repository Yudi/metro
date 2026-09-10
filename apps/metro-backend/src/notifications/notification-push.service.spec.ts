import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPushService } from './notification-push.service';
import { NotificationRealtimeService } from './notification-realtime.service';

jest.mock('web-push', () => ({ sendNotification: jest.fn() }));
describe('notification delivery', () => {
  const now = new Date('2026-09-07T11:30:00Z');
  const updateMany = jest.fn();
  const findUnique = jest.fn();
  const deleteMany = jest.fn();
  const findFirst = jest.fn();
  const transaction = {
    $queryRaw: jest.fn(),
    notificationDelivery: { updateMany, findFirst },
  };
  const prisma = {
    notificationDelivery: { updateMany, findUnique },
    pushSubscription: { deleteMany },
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;
  const config = { get: () => 'configured' } as unknown as ConfigService;
  const publishDeviceRemoved = jest.fn().mockResolvedValue(1);
  const service = new NotificationPushService(prisma, config, {
    publishDeviceRemoved,
  } as unknown as NotificationRealtimeService);
  const delivery = () => ({
    id: 'd',
    triggerId: 't',
    subscriptionId: 's',
    revision: 1,
    attempts: 1,
    expiresAt: new Date('2026-09-07T11:35:00Z'),
    payload: { notification: { data: { important: true } } },
    trigger: {
      enabled: true,
      revision: 1,
      userId: 'u',
      config: {
        name: 'Ida',
        enabled: true,
        days: [1],
        windows: [{ start: '08:00', end: '09:00' }],
        timezone: 'America/Sao_Paulo',
        smart: false,
        leadMinutes: 30,
        intervalMinutes: 15,
        kind: 'rail_status',
        targetIds: ['target'],
        statusMode: 'abnormal',
      },
    },
    subscription: {
      endpoint: 'https://fcm.googleapis.com/push/test',
      p256dh: 'key',
      auth: 'auth',
      user_id: 'u',
      user: { last_login: now },
    },
  });
  const statusDelivery = (
    id: string,
    stateFingerprint: string,
    revision = 1,
  ) => {
    const row = delivery();
    return {
      ...row,
      id,
      revision,
      fingerprint: `delivery-${id}`,
      payload: {
        notification: {
          ...row.payload.notification,
          data: {
            ...row.payload.notification.data,
            stateScope: 'scope-lines-1-2',
            stateFingerprint,
            windowKey: '2026-09-07-08:00-09:00',
          },
        },
      },
      trigger: { ...row.trigger, revision },
    };
  };
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    findFirst.mockResolvedValue(null);
    deleteMany.mockResolvedValue({ count: 1 });
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockImplementation(async () => ({
      ...delivery(),
      claimToken: updateMany.mock.calls[0][0].data.claimToken,
    }));
    jest
      .mocked(webPush.sendNotification)
      .mockResolvedValue({ statusCode: 201, body: '', headers: {} });
  });
  afterEach(() => jest.useRealTimers());
  it('sends with no push-service storage and acknowledges the owned claim', async () => {
    await service.deliver('d', now);
    expect(webPush.sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.objectContaining({ TTL: 0, timeout: 10_000 }),
    );
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'd', claimToken: expect.any(String) },
        data: expect.objectContaining({ sentAt: now }),
      }),
    );
  });
  it('does not send a delivery leased by another worker', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await service.deliver('d', now);
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });
  it.each(['revision', 'disabled', 'owner', 'window', 'inactive'])(
    'rechecks %s immediately before sending',
    async (reason) => {
      findUnique.mockImplementation(async () => {
        const row = delivery();
        if (reason === 'inactive')
          row.subscription.user.last_login = new Date('2024-09-07T11:30:00Z');
        if (reason === 'revision') row.trigger.revision = 2;
        if (reason === 'disabled') row.trigger.enabled = false;
        if (reason === 'owner') row.subscription.user_id = 'another';
        if (reason === 'window')
          row.trigger.config.windows = [{ start: '10:00', end: '11:00' }];
        return {
          ...row,
          claimToken: updateMany.mock.calls[0][0].data.claimToken,
        };
      });
      await service.deliver('d', now);
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    },
  );
  it('drops overlapping trigger pushes instead of queuing a burst', async () => {
    findFirst.mockResolvedValue({ id: 'another-trigger-delivery' });
    await service.deliver('d', now);
    expect(webPush.sendNotification).not.toHaveBeenCalled();
    expect(transaction.$queryRaw).toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          subscriptionId: 's',
          dispatchStartedAt: { gt: new Date(now.getTime() - 60_000) },
        },
      }),
    );
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiresAt: now }),
      }),
    );
  });
  it('suppresses a previously dispatched status state after a restart', async () => {
    const rows = new Map([
      ['first', statusDelivery('first', 'state-a')],
      ['second', statusDelivery('second', 'state-a', 2)],
    ]);
    findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      ...rows.get(where.id),
      claimToken:
        updateMany.mock.calls[updateMany.mock.calls.length - 1]?.[0].data
          .claimToken,
    }));
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ payload: rows.get('first')?.payload });

    await service.deliver('first', now);
    const restartedService = new NotificationPushService(
      prisma,
      config,
      { publishDeviceRemoved } as unknown as NotificationRealtimeService,
    );
    await restartedService.deliver('second', now);

    expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'second', claimToken: expect.any(String) },
        data: expect.objectContaining({ expiresAt: now }),
      }),
    );
    const historyQuery = findFirst.mock.calls.find(
      ([call]) => call?.orderBy?.dispatchStartedAt === 'desc',
    )?.[0];
    expect(historyQuery).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          subscriptionId: 's',
          AND: expect.arrayContaining([
            {
              payload: {
                path: ['notification', 'data', 'stateScope'],
                equals: 'scope-lines-1-2',
              },
            },
            {
              payload: {
                path: ['notification', 'data', 'windowKey'],
                equals: '2026-09-07-08:00-09:00',
              },
            },
          ]),
          dispatchStartedAt: { not: null },
        }),
        orderBy: { dispatchStartedAt: 'desc' },
        select: { payload: true },
      }),
    );
  });
  it('allows a status state to be dispatched again after recovery', async () => {
    const rows = new Map([
      ['first', statusDelivery('first', 'state-a')],
      ['second', statusDelivery('second', 'state-b', 2)],
      ['third', statusDelivery('third', 'state-a', 3)],
    ]);
    findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      ...rows.get(where.id),
      claimToken:
        updateMany.mock.calls[updateMany.mock.calls.length - 1]?.[0].data
          .claimToken,
    }));
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ payload: rows.get('first')?.payload })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ payload: rows.get('second')?.payload })
      .mockResolvedValueOnce(null);

    await service.deliver('first', now);
    await service.deliver('second', now);
    await service.deliver('third', now);

    expect(webPush.sendNotification).toHaveBeenCalledTimes(3);
  });
  it('does not replay an ambiguous status dispatch after a process restart', async () => {
    const rows = new Map([
      ['first', statusDelivery('first', 'state-a')],
      ['second', statusDelivery('second', 'state-a', 2)],
    ]);
    findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      ...rows.get(where.id),
      claimToken:
        updateMany.mock.calls[updateMany.mock.calls.length - 1]?.[0].data
          .claimToken,
    }));
    jest
      .mocked(webPush.sendNotification)
      .mockRejectedValueOnce(new Error('connection reset'));
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ payload: rows.get('first')?.payload });

    await service.deliver('first', now);
    await new NotificationPushService(
      prisma,
      config,
      { publishDeviceRemoved } as unknown as NotificationRealtimeService,
    ).deliver('second', now);

    expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'second', claimToken: expect.any(String) },
        data: expect.objectContaining({ expiresAt: now }),
      }),
    );
  });
  it('allows a status retry after an explicit rate-limit response', async () => {
    const rows = new Map([
      ['first', statusDelivery('first', 'state-a')],
      ['second', statusDelivery('second', 'state-a', 2)],
    ]);
    findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      ...rows.get(where.id),
      claimToken:
        updateMany.mock.calls[updateMany.mock.calls.length - 1]?.[0].data
          .claimToken,
    }));
    jest
      .mocked(webPush.sendNotification)
      .mockRejectedValueOnce({ statusCode: 429 })
      .mockResolvedValueOnce({ statusCode: 201, body: '', headers: {} });
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await service.deliver('first', now);
    await new NotificationPushService(
      prisma,
      config,
      { publishDeviceRemoved } as unknown as NotificationRealtimeService,
    ).deliver('second', now);

    expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls.some(([call]) =>
      call.data.dispatchStartedAt === null,
    )).toBe(true);
  });
  it('keeps periodic notification kinds outside status history deduplication', async () => {
    const row = statusDelivery('periodic', 'state-a');
    row.trigger.config = { ...row.trigger.config, kind: 'rail_arrivals' };
    findUnique.mockImplementation(async () => ({
      ...row,
      claimToken: updateMany.mock.calls[0][0].data.claimToken,
    }));

    await service.deliver('periodic', now);

    expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subscriptionId: 's',
          dispatchStartedAt: { gt: new Date(now.getTime() - 60_000) },
        }),
      }),
    );
  });
  it.each([false, true])(
    'revalidates retention reminders after login: %s',
    async (loggedIn) => {
      findUnique.mockImplementation(async () => ({
        ...delivery(),
        trigger: null,
        subscription: {
          ...delivery().subscription,
          user: {
            last_login: loggedIn ? now : new Date('2024-09-14T11:30:00Z'),
          },
        },
        retentionExpiresAt: new Date('2026-09-14T11:30:00Z'),
        retentionKey: '2026-09-14T11:30:00.000Z:7',
        claimToken: updateMany.mock.calls[0][0].data.claimToken,
      }));
      await service.deliver('d', now);
      expect(webPush.sendNotification).toHaveBeenCalledTimes(loggedIn ? 0 : 1);
    },
  );
  it('defers a retention reminder during cooldown without consuming retries', async () => {
    findUnique.mockImplementation(async () => ({
      ...delivery(),
      trigger: null,
      subscription: {
        ...delivery().subscription,
        user: { last_login: new Date('2024-09-14T11:30:00Z') },
      },
      retentionExpiresAt: new Date('2026-09-14T11:30:00Z'),
      retentionKey: '2026-09-14T11:30:00.000Z:7',
      claimToken: updateMany.mock.calls[0][0].data.claimToken,
    }));
    findFirst.mockResolvedValue({ id: 'recent' });
    await service.deliver('d', now);
    expect(webPush.sendNotification).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextAttemptAt: new Date(now.getTime() + 60_000),
          attempts: { decrement: 1 },
        }),
      }),
    );
  });
  it('removes expired push subscriptions on 410', async () => {
    jest
      .mocked(webPush.sendNotification)
      .mockRejectedValue({ statusCode: 410 });
    await service.deliver('d', now);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 's', user_id: 'u' },
    });
    expect(publishDeviceRemoved).toHaveBeenCalledWith('u', 's');
  });
  it('does not publish a removal for a subscription already deleted elsewhere', async () => {
    jest
      .mocked(webPush.sendNotification)
      .mockRejectedValue({ statusCode: 404 });
    deleteMany.mockResolvedValue({ count: 0 });
    await service.deliver('d', now);
    expect(publishDeviceRemoved).not.toHaveBeenCalled();
  });
  it('persists transient retry times and releases the claim', async () => {
    jest
      .mocked(webPush.sendNotification)
      .mockRejectedValue({ statusCode: 429 });
    await service.deliver('d', now);
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextAttemptAt: new Date(now.getTime() + 20_000),
          claimToken: null,
        }),
      }),
    );
  });
  it('does not retry an ambiguous network outcome that might have delivered', async () => {
    jest
      .mocked(webPush.sendNotification)
      .mockRejectedValue(new Error('connection reset'));
    await service.deliver('d', now);
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiresAt: now }),
      }),
    );
    expect(
      updateMany.mock.calls.some(
        ([call]) => call.data.dispatchStartedAt === null,
      ),
    ).toBe(false);
  });
  it('does not replay a 5xx response with an uncertain acceptance outcome', async () => {
    jest
      .mocked(webPush.sendNotification)
      .mockRejectedValue({ statusCode: 503 });
    await service.deliver('d', now);
    expect(
      updateMany.mock.calls.some(
        ([call]) => call.data.dispatchStartedAt === null,
      ),
    ).toBe(false);
  });
});
