import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPushService } from './notification-push.service';

jest.mock('web-push', () => ({ sendNotification: jest.fn() }));
describe('notification delivery', () => {
  const now = new Date('2026-09-07T11:30:00Z');
  const updateMany = jest.fn();
  const findUnique = jest.fn();
  const deleteMany = jest.fn();
  const prisma = { notificationDelivery: { updateMany, findUnique }, pushSubscription: { deleteMany } } as unknown as PrismaService;
  const config = { get: () => 'configured' } as unknown as ConfigService;
  const service = new NotificationPushService(prisma, config);
  const delivery = () => ({
    id: 'd', triggerId: 't', subscriptionId: 's', revision: 1, attempts: 1,
    expiresAt: new Date('2026-09-07T11:35:00Z'), payload: { notification: { data: { important: true } } },
    trigger: { enabled: true, revision: 1, userId: 'u', config: { name: 'Ida', enabled: true, days: [1], windows: [{ start: '08:00', end: '09:00' }], timezone: 'America/Sao_Paulo', smart: false, leadMinutes: 30, intervalMinutes: 15, kind: 'rail_status', targetIds: ['target'], statusMode: 'abnormal' } },
    subscription: { endpoint: 'https://fcm.googleapis.com/push/test', p256dh: 'key', auth: 'auth', user_id: 'u' },
  });
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockImplementation(async () => ({ ...delivery(), claimToken: updateMany.mock.calls[0][0].data.claimToken }));
    jest.mocked(webPush.sendNotification).mockResolvedValue({ statusCode: 201, body: '', headers: {} });
  });
  afterEach(() => jest.useRealTimers());
  it('sends with no push-service storage and acknowledges the owned claim', async () => {
    await service.deliver('d', now);
    expect(webPush.sendNotification).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({ TTL: 0, timeout: 10_000 }));
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'd', claimToken: expect.any(String) }, data: expect.objectContaining({ sentAt: now }) }));
  });
  it('does not send a delivery leased by another worker', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await service.deliver('d', now);
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });
  it.each(['revision', 'disabled', 'owner', 'window'])('rechecks %s immediately before sending', async reason => {
    findUnique.mockImplementation(async () => {
      const row = delivery();
      if (reason === 'revision') row.trigger.revision = 2;
      if (reason === 'disabled') row.trigger.enabled = false;
      if (reason === 'owner') row.subscription.user_id = 'another';
      if (reason === 'window') row.trigger.config.windows = [{ start: '10:00', end: '11:00' }];
      return { ...row, claimToken: updateMany.mock.calls[0][0].data.claimToken };
    });
    await service.deliver('d', now);
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });
  it('removes expired push subscriptions on 410', async () => {
    jest.mocked(webPush.sendNotification).mockRejectedValue({ statusCode: 410 });
    await service.deliver('d', now);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 's', user_id: 'u' } });
  });
  it('persists transient retry times and releases the claim', async () => {
    jest.mocked(webPush.sendNotification).mockRejectedValue({ statusCode: 429 });
    await service.deliver('d', now);
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ nextAttemptAt: new Date(now.getTime() + 20_000), claimToken: null }) }));
  });
  it('does not retry an ambiguous network outcome that might have delivered', async () => {
    jest.mocked(webPush.sendNotification).mockRejectedValue(new Error('connection reset'));
    await service.deliver('d', now);
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ expiresAt: now }) }));
    expect(updateMany.mock.calls.some(([call]) => call.data.dispatchStartedAt === null)).toBe(false);
  });
  it('does not replay a 5xx response with an uncertain acceptance outcome', async () => {
    jest.mocked(webPush.sendNotification).mockRejectedValue({ statusCode: 503 });
    await service.deliver('d', now);
    expect(updateMany.mock.calls.some(([call]) => call.data.dispatchStartedAt === null)).toBe(false);
  });
});
